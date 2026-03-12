import { dbAll } from "@/lib/local-db";

import {
  DISCOVERY_ALBUM_CATALOG,
  type DiscoveryAlbum,
} from "@/lib/discovery-catalog";
import { sanitizeGeoLabel } from "@/lib/geo-label";

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

function normalizePart(value: string | null | undefined) {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function computeClusterKey(album: Pick<DiscoveryAlbum, "countryCode" | "cityName"> & {
  regionCode?: string | null;
  geoClusterKey?: string;
  geoGranularity?: "city" | "region" | "country";
}) {
  if (album.geoClusterKey && album.geoClusterKey.trim()) {
    return album.geoClusterKey;
  }

  const country = normalizePart(album.countryCode) || "xx";
  if (album.geoGranularity === "country") {
    return country;
  }

  const region = normalizePart(sanitizeGeoLabel(album.regionCode));
  if (album.geoGranularity === "region") {
    return region ? [country, region].join(":") : country;
  }

  const city = normalizePart(sanitizeGeoLabel(album.cityName));

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

function mapRow(row: DiscoveryPoolRow): DiscoveryAlbum & { weight?: number } {
  const countryCode = row.country_code?.toUpperCase?.() ?? "XX";
  const sanitizedCityName = sanitizeGeoLabel(row.city_name);
  const sanitizedRegionCode = sanitizeGeoLabel(row.region_code);
  const sanitizedRegionName = sanitizeGeoLabel(row.region_name);
  const geoGranularity =
    row.geo_granularity ??
    (sanitizedCityName ? "city" : sanitizedRegionCode ? "region" : "country");

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
  }

  return {
    id: row.id,
    albumTitle: row.album_title,
    artistName: row.artist_name,
    releaseYear: row.release_year,
    countryCode,
    countryName: row.country_name,
    cityName: sanitizedCityName ?? row.country_name ?? countryCode,
    regionCode: sanitizedRegionCode,
    regionName: sanitizedRegionName,
    geoGranularity,
    geoClusterKey: row.geo_cluster_key ?? undefined,
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
