#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { createClient as createLibsqlClient } from "@libsql/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const LOCAL_DB_PATH =
  process.env.LOCAL_DB_PATH?.trim() || path.join(process.cwd(), "data", "dream.db");

const args = new Set(process.argv.slice(2));
const SHOULD_WIPE = !args.has("--no-wipe");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function headers(rangeStart, rangeEnd) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
    Prefer: "count=exact",
    Range: `${rangeStart}-${rangeEnd}`,
  };
}

async function fetchAllRows(table, select, orderBy = "id", pageSize = 1000) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    url.searchParams.set("select", select);
    url.searchParams.set("order", `${orderBy}.asc`);

    const res = await fetch(url, {
      headers: headers(from, to),
    });

    if (res.status === 404) {
      return { exists: false, rows: [] };
    }

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`Fetch ${table} failed: ${res.status} ${msg}`);
    }

    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) {
      break;
    }

    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return { exists: true, rows };
}

async function ensureSchema(db) {
  await db.batch(
    [
      `create table if not exists users (
        id text primary key,
        email text,
        mb_token text,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now'))
      )`,
      `create table if not exists artist_geo_cache (
        artist_id text primary key,
        artist_name text not null,
        country_code text,
        country_name text,
        city_name text,
        lng real,
        lat real,
        raw_payload text,
        updated_at text not null default (datetime('now'))
      )`,
      `create table if not exists user_records (
        id text primary key,
        user_id text not null,
        album_mbid text,
        album_title text not null,
        release_date text,
        release_year integer,
        listen_at text not null,
        score integer not null,
        personal_tags text not null default '[]',
        artist_id text not null,
        artist_name text not null,
        country_code text,
        country_name text,
        city_name text,
        lng real,
        lat real,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now'))
      )`,
      `create table if not exists discovery_pool (
        id text primary key,
        album_title text not null,
        artist_name text not null,
        release_year integer not null,
        country_code text not null,
        country_name text not null,
        city_name text not null,
        lng real not null,
        lat real not null,
        enabled integer not null default 1,
        weight integer not null default 1,
        created_at text not null default (datetime('now'))
      )`,
    ],
    "write"
  );
}

async function run() {
  ensureDir(LOCAL_DB_PATH);
  const db = createLibsqlClient({ url: `file:${LOCAL_DB_PATH}` });

  await ensureSchema(db);

  console.log("Fetching data from Supabase...");
  const [discoveryPoolRes, userRecordsRes, artistGeoCacheRes, profilesRes] = await Promise.all([
    fetchAllRows(
      "discovery_pool",
      "id,album_title,artist_name,release_year,country_code,country_name,city_name,lng,lat,enabled,weight,created_at",
      "id"
    ),
    fetchAllRows(
      "user_records",
      "id,user_id,album_mbid,album_title,release_date,release_year,listen_at,score,personal_tags,artist_id,artist_name,country_code,country_name,city_name,created_at,updated_at",
      "id"
    ),
    fetchAllRows(
      "artist_geo_cache",
      "artist_id,artist_name,country_code,country_name,city_name,raw_payload,updated_at",
      "artist_id"
    ),
    fetchAllRows("profiles", "id,mb_token", "id"),
  ]);

  const discoveryPool = discoveryPoolRes.rows;
  const userRecords = userRecordsRes.rows;
  const artistGeoCache = artistGeoCacheRes.rows;
  const profiles = profilesRes.rows;

  console.log(
    `Supabase rows -> discovery_pool: ${discoveryPool.length}, user_records: ${userRecords.length}, artist_geo_cache: ${artistGeoCache.length}, profiles: ${profiles.length}`
  );

  await db.execute("begin");
  try {
    if (SHOULD_WIPE) {
      await db.execute("delete from discovery_pool");
      await db.execute("delete from user_records");
      await db.execute("delete from artist_geo_cache");
      await db.execute("delete from users");
    }

    for (const row of discoveryPool) {
      await db.execute({
        sql: `insert or replace into discovery_pool (
          id, album_title, artist_name, release_year, country_code, country_name,
          city_name, lng, lat, enabled, weight, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce(?, datetime('now')))` ,
        args: [
          row.id,
          row.album_title,
          row.artist_name,
          row.release_year,
          row.country_code,
          row.country_name,
          row.city_name,
          row.lng,
          row.lat,
          row.enabled ? 1 : 0,
          row.weight ?? 1,
          row.created_at ?? null,
        ],
      });
    }

    const userIdSet = new Set();
    for (const row of userRecords) {
      userIdSet.add(row.user_id);
      const tags = Array.isArray(row.personal_tags) ? row.personal_tags : [];
      await db.execute({
        sql: `insert or replace into user_records (
          id, user_id, album_mbid, album_title, release_date, release_year,
          listen_at, score, personal_tags, artist_id, artist_name,
          country_code, country_name, city_name, lng, lat, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, coalesce(?, datetime('now')), coalesce(?, datetime('now')))` ,
        args: [
          row.id,
          row.user_id,
          row.album_mbid ?? null,
          row.album_title,
          row.release_date ?? null,
          row.release_year ?? null,
          row.listen_at,
          row.score,
          JSON.stringify(tags),
          row.artist_id,
          row.artist_name,
          row.country_code ?? null,
          row.country_name ?? null,
          row.city_name ?? null,
          row.created_at ?? null,
          row.updated_at ?? null,
        ],
      });
    }

    for (const row of artistGeoCache) {
      await db.execute({
        sql: `insert or replace into artist_geo_cache (
          artist_id, artist_name, country_code, country_name, city_name, lng, lat, raw_payload, updated_at
        ) values (?, ?, ?, ?, ?, null, null, ?, coalesce(?, datetime('now')))` ,
        args: [
          row.artist_id,
          row.artist_name,
          row.country_code ?? null,
          row.country_name ?? null,
          row.city_name ?? null,
          row.raw_payload ? JSON.stringify(row.raw_payload) : null,
          row.updated_at ?? null,
        ],
      });
    }

    for (const userId of userIdSet) {
      await db.execute({
        sql: `insert or ignore into users (id, email, created_at, updated_at)
              values (?, null, datetime('now'), datetime('now'))`,
        args: [userId],
      });
    }

    for (const row of profiles) {
      await db.execute({
        sql: `insert into users (id, email, mb_token, created_at, updated_at)
              values (?, null, ?, datetime('now'), datetime('now'))
              on conflict(id) do update set
                mb_token = excluded.mb_token,
                updated_at = datetime('now')`,
        args: [row.id, row.mb_token ?? null],
      });
    }

    await db.execute("commit");
  } catch (error) {
    await db.execute("rollback");
    throw error;
  }

  const [dCount, uCount, aCount, usrCount] = await Promise.all([
    db.execute("select count(*) as c from discovery_pool"),
    db.execute("select count(*) as c from user_records"),
    db.execute("select count(*) as c from artist_geo_cache"),
    db.execute("select count(*) as c from users"),
  ]);

  const localCounts = {
    discovery_pool: Number(dCount.rows?.[0]?.c ?? 0),
    user_records: Number(uCount.rows?.[0]?.c ?? 0),
    artist_geo_cache: Number(aCount.rows?.[0]?.c ?? 0),
    users: Number(usrCount.rows?.[0]?.c ?? 0),
  };

  console.log("Local SQLite rows ->", localCounts);
  console.log("Migration finished.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
