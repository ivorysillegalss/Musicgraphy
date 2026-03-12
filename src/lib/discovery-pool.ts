import { dbAll } from "@/lib/local-db";

import {
  DISCOVERY_ALBUM_CATALOG,
  type DiscoveryAlbum,
} from "@/lib/discovery-catalog";
import { getCountryCoordinates } from "@/lib/country-centroid";
import { sanitizeGeoLabel } from "@/lib/geo-label";
import { inferRegionFromCountryAndCity } from "@/lib/geo-region";

type DiscoveryPoolFilter = {
  west: number;
  south: number;
  east: number;
  north: number;
  minYear: number;
  maxYear: number;
  limit: number;
  preferredCountries?: string[];
  seed?: string;
};

type DiscoveryPoolRow = {
  id: string;
  album_title: string;
  artist_name: string;
  release_year: number;
  country_code: string;
  country_name: string;
  city_name: string | null;
  region_code?: string | null;
  region_name?: string | null;
  geo_granularity?: "city" | "region" | "country" | null;
  geo_cluster_key?: string | null;
  lng: number;
  lat: number;
  enabled?: boolean;
  weight?: number;
};

function normalizeGeoToken(value: string | null | undefined) {
  return normalizePart(sanitizeGeoLabel(value));
}

function hasMeaningfulCity(input: {
  cityName?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
}) {
  const city = normalizeGeoToken(input.cityName);
  if (!city) return false;

  const countryCode = normalizeGeoToken(input.countryCode);
  const countryName = normalizeGeoToken(input.countryName);

  if (countryCode && city === countryCode) return false;
  if (countryName && city === countryName) return false;
  return true;
}

function resolveEffectiveGranularity(input: {
  cityName?: string | null;
  regionCode?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
}) {
  if (hasMeaningfulCity(input)) {
    return "city" as const;
  }

  const region = normalizeGeoToken(input.regionCode);
  if (region) {
    return "region" as const;
  }

  return "country" as const;
}

function normalizePart(value: string | null | undefined) {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function computeClusterKey(album: Pick<DiscoveryAlbum, "countryCode" | "countryName" | "cityName"> & {
  regionCode?: string | null;
  geoClusterKey?: string;
  geoGranularity?: "city" | "region" | "country";
}) {
  const country = normalizePart(album.countryCode) || "xx";
  const effectiveGranularity = resolveEffectiveGranularity({
    cityName: album.cityName,
    regionCode: album.regionCode,
    countryCode: album.countryCode,
    countryName: album.countryName,
  });

  if (effectiveGranularity === "country") {
    return country;
  }

  const region = normalizePart(sanitizeGeoLabel(album.regionCode));
  if (effectiveGranularity === "region") {
    return region ? [country, region].join(":") : country;
  }

  const city = hasMeaningfulCity({
    cityName: album.cityName,
    countryCode: album.countryCode,
    countryName: album.countryName,
  })
    ? normalizePart(sanitizeGeoLabel(album.cityName))
    : "";

  if (city) {
    return [country, region || "na", city].join(":");
  }
  if (region) {
    return [country, region].join(":");
  }
  return country;
}

function scatterCountryLevelCoordinates(lng: number, lat: number, seed: string) {
  const hash = hashString(seed);
  const angle = ((hash % 360) * Math.PI) / 180;
  const radiusDeg = 1.8 + ((hash >>> 8) % 320) / 100; // 1.8 ~ 5.0 deg

  const nextLng = lng + Math.cos(angle) * radiusDeg;
  const nextLat = lat + Math.sin(angle) * radiusDeg * 0.58;

  return {
    lng: nextLng > 180 ? 180 : nextLng < -180 ? -180 : nextLng,
    lat: nextLat > 85 ? 85 : nextLat < -85 ? -85 : nextLat,
  };
}

function scatterClusterLevelCoordinates(
  lng: number,
  lat: number,
  clusterSeed: string,
  itemSeed: string,
  options: { baseMin: number; baseMax: number; microMin: number; microMax: number }
) {
  const clusterHash = hashString(clusterSeed);
  const clusterAngle = ((clusterHash % 360) * Math.PI) / 180;
  const clusterRadius =
    options.baseMin + ((clusterHash >>> 9) % Math.round((options.baseMax - options.baseMin) * 100 + 1)) / 100;

  const itemHash = hashString(itemSeed);
  const itemAngle = ((itemHash % 360) * Math.PI) / 180;
  const itemRadius =
    options.microMin + ((itemHash >>> 8) % Math.round((options.microMax - options.microMin) * 100 + 1)) / 100;

  const deltaLng =
    Math.cos(clusterAngle) * clusterRadius + Math.cos(itemAngle) * itemRadius;
  const deltaLat =
    (Math.sin(clusterAngle) * clusterRadius + Math.sin(itemAngle) * itemRadius) * 0.6;

  return {
    lng: clampLng(lng + deltaLng),
    lat: clampLat(lat + deltaLat),
  };
}

function clampLng(value: number) {
  return value > 180 ? 180 : value < -180 ? -180 : value;
}

function clampLat(value: number) {
  return value > 85 ? 85 : value < -85 ? -85 : value;
}

function isNearCountryCentroid(
  lng: number,
  lat: number,
  countryCode: string,
  countryName: string
) {
  const centroid = getCountryCoordinates(countryCode, countryName);
  if (!centroid) return false;
  return Math.abs(lng - centroid.lng) <= 0.35 && Math.abs(lat - centroid.lat) <= 0.35;
}

function mapRow(row: DiscoveryPoolRow): DiscoveryAlbum & { weight?: number } {
  const countryCode = row.country_code?.toUpperCase?.() ?? "XX";
  const sanitizedCityName = sanitizeGeoLabel(row.city_name);
  const sanitizedRegionCode = sanitizeGeoLabel(row.region_code);
  const sanitizedRegionName = sanitizeGeoLabel(row.region_name);
  const inferredRegion =
    !sanitizedRegionCode && sanitizedCityName
      ? inferRegionFromCountryAndCity(countryCode, sanitizedCityName)
      : null;
  const effectiveRegionCode = sanitizedRegionCode ?? inferredRegion?.regionCode ?? null;
  const effectiveRegionName = sanitizedRegionName ?? inferredRegion?.regionName ?? null;
  const geoGranularity = resolveEffectiveGranularity({
    cityName: sanitizedCityName,
    regionCode: effectiveRegionCode,
    countryCode,
    countryName: row.country_name,
  });

  const cityForDisplay = sanitizedCityName ?? row.country_name ?? countryCode;
  const clusterKey = computeClusterKey({
    countryCode,
    countryName: row.country_name,
    cityName: cityForDisplay,
    regionCode: effectiveRegionCode,
    geoGranularity,
  });

  let lng = row.lng;
  let lat = row.lat;

  if (geoGranularity === "country") {
    const scattered = scatterCountryLevelCoordinates(
      row.lng,
      row.lat,
      `${row.id}:${countryCode}`
    );
    lng = scattered.lng;
    lat = scattered.lat;
  } else if (isNearCountryCentroid(row.lng, row.lat, countryCode, row.country_name)) {
    const scatterOptions =
      geoGranularity === "city"
        ? { baseMin: 2.4, baseMax: 6.8, microMin: 0.2, microMax: 1.1 }
        : { baseMin: 1.8, baseMax: 4.9, microMin: 0.15, microMax: 0.8 };
    const scattered = scatterClusterLevelCoordinates(
      row.lng,
      row.lat,
      clusterKey,
      `${clusterKey}:${row.id}`,
      scatterOptions
    );
    lng = scattered.lng;
    lat = scattered.lat;
  }

  return {
    id: row.id,
    albumTitle: row.album_title,
    artistName: row.artist_name,
    releaseYear: row.release_year,
    countryCode,
    countryName: row.country_name,
    cityName: cityForDisplay,
    regionCode: effectiveRegionCode,
    regionName: effectiveRegionName,
    geoGranularity,
    geoClusterKey: clusterKey,
    coordinates: {
      lng,
      lat,
    },
    weight: typeof row.weight === "number" ? row.weight : 1,
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const copied = [...items];
  let state = hashString(seed) || 1234567;

  function nextRandom() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  }

  for (let index = copied.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(nextRandom() * (index + 1));
    [copied[index], copied[randomIndex]] = [copied[randomIndex], copied[index]];
  }

  return copied;
}

function applyFilter(
  albums: Array<DiscoveryAlbum & { weight?: number }>,
  filter: DiscoveryPoolFilter
) {
  const preferred = new Set((filter.preferredCountries ?? []).map((item) => item.toUpperCase()));

  const weightedCandidates: Array<{ album: DiscoveryAlbum & { weight?: number }; weight: number }> = [];

  // Single-pass classification avoids repeated includes/filter scans on large pools.
  for (const album of albums) {
    if (album.releaseYear < filter.minYear || album.releaseYear > filter.maxYear) {
      continue;
    }

    const item = {
      album,
      weight:
        (preferred.has(album.countryCode.toUpperCase()) ? 2 : 1) *
        Math.max(1, Math.min(10, Math.trunc(album.weight ?? 1))),
    };

    weightedCandidates.push(item);
  }

  const weightedToList = (items: Array<{ album: DiscoveryAlbum & { weight?: number }; weight: number }>) =>
    items.flatMap((item) => Array.from({ length: item.weight }, () => item.album));

  const unique = new Map<string, DiscoveryAlbum>();
  const shuffled = seededShuffle(
    weightedToList(weightedCandidates),
    `${filter.seed ?? Date.now()}-global-${filter.limit}-${filter.minYear}-${filter.maxYear}`
  );

  // Global round-robin by geo cluster gives a near-uniform world spread at each refresh.
  const byCluster = new Map<string, DiscoveryAlbum[]>();
  for (const album of shuffled) {
    if (unique.has(album.id)) continue;
    const clusterKey = computeClusterKey(album);
    const list = byCluster.get(clusterKey) ?? [];
    list.push(album);
    byCluster.set(clusterKey, list);
  }

  const clusterKeys = seededShuffle(Array.from(byCluster.keys()), `${filter.seed ?? Date.now()}-clusters`);
  let added = true;
  while (added && unique.size < filter.limit) {
    added = false;
    for (const key of clusterKeys) {
      if (unique.size >= filter.limit) break;
      const list = byCluster.get(key);
      if (!list || list.length === 0) continue;
      const album = list.shift()!;
      unique.set(album.id, album);
      added = true;
    }
  }

  return Array.from(unique.values());
}

async function getLocalDiscoveryPool(): Promise<Array<DiscoveryAlbum & { weight?: number }> | null> {
  try {
    const data = await dbAll<DiscoveryPoolRow>(
      `select
        id, album_title, artist_name, release_year, country_code,
        country_name, city_name, region_code, region_name, geo_granularity, geo_cluster_key,
        lng, lat, enabled, weight
       from discovery_pool
       where enabled = 1
       limit 5000`
    );

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    return data.map(mapRow);
  } catch {
    return null;
  }
}

export async function queryDiscoveryPool(filter: DiscoveryPoolFilter) {
  const dbPool = await getLocalDiscoveryPool();
  const sourcePool = dbPool ?? DISCOVERY_ALBUM_CATALOG.map((item) => ({ ...item, weight: 1 }));
  return applyFilter(sourcePool, filter);
}
