#!/usr/bin/env node
import path from "node:path";

import { createClient } from "@libsql/client";
import { City, State } from "country-state-city";

const dbPath = process.env.LOCAL_DB_PATH?.trim() || path.join(process.cwd(), "data", "dream.db");
const db = createClient({ url: `file:${dbPath}` });

const UNKNOWN_GEO_LABELS = new Set([
  "unknown",
  "unkown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "-",
  "?",
]);

function normalizePart(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function normalizeLabel(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function sanitizeGeoLabel(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (UNKNOWN_GEO_LABELS.has(raw.toLowerCase())) return null;
  return raw;
}

const statesByCountry = new Map();
const citiesByCountry = new Map();

function getStates(countryCode) {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (!code) return [];
  if (statesByCountry.has(code)) return statesByCountry.get(code);
  const states = State.getStatesOfCountry(code) ?? [];
  statesByCountry.set(code, states);
  return states;
}

function getCities(countryCode) {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (!code) return [];
  if (citiesByCountry.has(code)) return citiesByCountry.get(code);
  const cities = City.getCitiesOfCountry(code) ?? [];
  citiesByCountry.set(code, cities);
  return cities;
}

function inferRegion(countryCode, cityName) {
  const code = String(countryCode ?? "").trim().toUpperCase();
  const city = normalizePart(sanitizeGeoLabel(cityName));
  if (!code || !city) {
    return { regionCode: null, regionName: null };
  }

  const states = getStates(code);
  if (states.length === 0) {
    return { regionCode: null, regionName: null };
  }

  const stateMap = new Map(states.map((item) => [item.isoCode, item.name]));
  const cities = getCities(code);
  if (cities.length === 0) {
    return { regionCode: null, regionName: null };
  }

  const exact = cities.find((item) => normalizePart(item.name) === city);
  if (exact?.stateCode && stateMap.has(exact.stateCode)) {
    return { regionCode: exact.stateCode, regionName: stateMap.get(exact.stateCode) };
  }

  const fuzzy = cities.find((item) => {
    const normalized = normalizePart(item.name);
    return normalized.includes(city) || city.includes(normalized);
  });

  if (fuzzy?.stateCode && stateMap.has(fuzzy.stateCode)) {
    return { regionCode: fuzzy.stateCode, regionName: stateMap.get(fuzzy.stateCode) };
  }

  return { regionCode: null, regionName: null };
}

function computeGranularity({ cityName, regionCode, countryName }) {
  const city = normalizeLabel(sanitizeGeoLabel(cityName));
  const country = normalizeLabel(countryName);
  if (city && city !== country) return "city";
  if (regionCode && String(regionCode).trim()) return "region";
  return "country";
}

function computeClusterKey({ countryCode, regionCode, cityName, countryName }) {
  const country = normalizePart(countryCode) || "xx";
  const region = normalizePart(regionCode);
  const city = normalizePart(sanitizeGeoLabel(cityName));
  const countryAsCity = normalizePart(countryName);

  if (city && city !== countryAsCity) {
    return `${country}:${region || "na"}:${city}`;
  }
  if (region) {
    return `${country}:${region}`;
  }
  return country;
}

async function hasColumn(table, column) {
  const result = await db.execute(`pragma table_info(${table})`);
  return (result.rows || []).some((row) => row.name === column);
}

async function ensureColumn(table, column, definition) {
  if (await hasColumn(table, column)) {
    return;
  }
  await db.execute(`alter table ${table} add column ${column} ${definition}`);
}

async function ensureSchema() {
  await ensureColumn("discovery_pool", "region_code", "text");
  await ensureColumn("discovery_pool", "region_name", "text");
  await ensureColumn("discovery_pool", "geo_granularity", "text not null default 'country'");
  await ensureColumn("discovery_pool", "geo_cluster_key", "text");

  await ensureColumn("user_records", "region_code", "text");
  await ensureColumn("user_records", "region_name", "text");
  await ensureColumn("user_records", "geo_granularity", "text not null default 'country'");

  await ensureColumn("artist_geo_cache", "region_code", "text");
  await ensureColumn("artist_geo_cache", "region_name", "text");
  await ensureColumn("artist_geo_cache", "geo_granularity", "text not null default 'country'");

  await db.batch(
    [
      "create index if not exists idx_discovery_pool_geo_cluster on discovery_pool(geo_cluster_key)",
      "create index if not exists idx_discovery_pool_release_country on discovery_pool(release_year, country_code)",
    ],
    "write"
  );
}

async function backfillDiscoveryPool() {
  const rows = await db.execute(`
    select id, country_code, country_name, city_name, region_code, region_name, geo_granularity, geo_cluster_key
    from discovery_pool
  `);

  let updates = 0;
  for (const row of rows.rows || []) {
    const inferred = inferRegion(row.country_code, row.city_name);
    const nextRegionCode = row.region_code || inferred.regionCode || null;
    const nextRegionName = row.region_name || inferred.regionName || null;
    const granularity = computeGranularity({
      cityName: row.city_name,
      regionCode: nextRegionCode,
      countryName: row.country_name,
    });
    const clusterKey = computeClusterKey({
      countryCode: row.country_code,
      regionCode: nextRegionCode,
      cityName: row.city_name,
      countryName: row.country_name,
    });

    const currentGranularity = String(row.geo_granularity || "").trim();
    const currentCluster = String(row.geo_cluster_key || "").trim();
    const currentRegionCode = String(row.region_code || "").trim();
    const currentRegionName = String(row.region_name || "").trim();
    if (
      currentGranularity === granularity &&
      currentCluster === clusterKey &&
      currentRegionCode === String(nextRegionCode || "") &&
      currentRegionName === String(nextRegionName || "")
    ) {
      continue;
    }

    await db.execute({
      sql: `
        update discovery_pool
        set region_code = ?, region_name = ?, geo_granularity = ?, geo_cluster_key = ?
        where id = ?
      `,
      args: [nextRegionCode, nextRegionName, granularity, clusterKey, row.id],
    });
    updates += 1;
  }

  return updates;
}

async function backfillUserRecords() {
  const rows = await db.execute(`
    select id, country_code, country_name, city_name, region_code, region_name, geo_granularity
    from user_records
  `);

  let updates = 0;
  for (const row of rows.rows || []) {
    const inferred = inferRegion(row.country_code, row.city_name);
    const nextRegionCode = row.region_code || inferred.regionCode || null;
    const nextRegionName = row.region_name || inferred.regionName || null;
    const granularity = computeGranularity({
      cityName: row.city_name,
      regionCode: nextRegionCode,
      countryName: row.country_name,
    });

    const currentGranularity = String(row.geo_granularity || "").trim();
    const currentRegionCode = String(row.region_code || "").trim();
    const currentRegionName = String(row.region_name || "").trim();
    if (
      currentGranularity === granularity &&
      currentRegionCode === String(nextRegionCode || "") &&
      currentRegionName === String(nextRegionName || "")
    ) {
      continue;
    }

    await db.execute({
      sql: `update user_records set region_code = ?, region_name = ?, geo_granularity = ? where id = ?`,
      args: [nextRegionCode, nextRegionName, granularity, row.id],
    });
    updates += 1;
  }

  return updates;
}

async function backfillArtistGeoCache() {
  const rows = await db.execute(`
    select artist_id, country_code, country_name, city_name, region_code, region_name, geo_granularity
    from artist_geo_cache
  `);

  let updates = 0;
  for (const row of rows.rows || []) {
    const inferred = inferRegion(row.country_code, row.city_name);
    const nextRegionCode = row.region_code || inferred.regionCode || null;
    const nextRegionName = row.region_name || inferred.regionName || null;
    const granularity = computeGranularity({
      cityName: row.city_name,
      regionCode: nextRegionCode,
      countryName: row.country_name,
    });

    const currentGranularity = String(row.geo_granularity || "").trim();
    const currentRegionCode = String(row.region_code || "").trim();
    const currentRegionName = String(row.region_name || "").trim();
    if (
      currentGranularity === granularity &&
      currentRegionCode === String(nextRegionCode || "") &&
      currentRegionName === String(nextRegionName || "")
    ) {
      continue;
    }

    await db.execute({
      sql: `update artist_geo_cache set region_code = ?, region_name = ?, geo_granularity = ? where artist_id = ?`,
      args: [nextRegionCode, nextRegionName, granularity, row.artist_id],
    });
    updates += 1;
  }

  return updates;
}

async function run() {
  await ensureSchema();

  const [discoveryUpdates, recordUpdates, cacheUpdates] = await Promise.all([
    backfillDiscoveryPool(),
    backfillUserRecords(),
    backfillArtistGeoCache(),
  ]);

  console.log("Geo backfill completed:");
  console.log(`- discovery_pool updated: ${discoveryUpdates}`);
  console.log(`- user_records updated: ${recordUpdates}`);
  console.log(`- artist_geo_cache updated: ${cacheUpdates}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
