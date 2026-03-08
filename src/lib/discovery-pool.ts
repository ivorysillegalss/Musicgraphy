import { dbAll } from "@/lib/local-db";

import {
  DISCOVERY_ALBUM_CATALOG,
  type DiscoveryAlbum,
} from "@/lib/discovery-catalog";

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
}) {
  if (album.geoClusterKey && album.geoClusterKey.trim()) {
    return album.geoClusterKey;
  }

  const country = normalizePart(album.countryCode) || "xx";
  const region = normalizePart(album.regionCode);
  const city = normalizePart(album.cityName);

  if (city) {
    return [country, region || "na", city].join(":");
  }
  if (region) {
    return [country, region].join(":");
  }
  return country;
}

function mapRow(row: DiscoveryPoolRow): DiscoveryAlbum & { weight?: number } {
  const countryCode = row.country_code?.toUpperCase?.() ?? "XX";
  const cityName = row.city_name?.trim() || row.country_name || countryCode;
  const geoGranularity = row.geo_granularity ?? (row.city_name ? "city" : row.region_code ? "region" : "country");

  return {
    id: row.id,
    albumTitle: row.album_title,
    artistName: row.artist_name,
    releaseYear: row.release_year,
    countryCode,
    countryName: row.country_name,
    cityName,
    regionCode: row.region_code ?? null,
    regionName: row.region_name ?? null,
    geoGranularity,
    geoClusterKey: row.geo_cluster_key ?? undefined,
    coordinates: {
      lng: row.lng,
      lat: row.lat,
    },
    weight: typeof row.weight === "number" ? row.weight : 1,
  };
}

function inBounds(
  album: DiscoveryAlbum,
  west: number,
  south: number,
  east: number,
  north: number
) {
  const { lng, lat } = album.coordinates;
  if (lat < south || lat > north) {
    return false;
  }

  if (west <= east) {
    return lng >= west && lng <= east;
  }

  return lng >= west || lng <= east;
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

  const baseWeights = albums.map((album) => ({
    album,
    weight:
      (preferred.has(album.countryCode.toUpperCase()) ? 2 : 1) *
      Math.max(1, Math.min(10, Math.trunc(album.weight ?? 1))),
  }));

  // Apply year window globally before any layer fallback, otherwise out-of-range albums can leak in.
  const yearFiltered = baseWeights.filter(
    ({ album }) => album.releaseYear >= filter.minYear && album.releaseYear <= filter.maxYear
  );

  const inBoundsWeighted = yearFiltered.filter(({ album }) => {
    return inBounds(album, filter.west, filter.south, filter.east, filter.north);
  });

  const preferredOutWeighted = yearFiltered.filter(
    (item) => !inBoundsWeighted.includes(item) && preferred.has(item.album.countryCode.toUpperCase())
  );

  const remainingWeighted = yearFiltered.filter(
    (item) => !inBoundsWeighted.includes(item) && !preferredOutWeighted.includes(item)
  );

  const weightedToList = (items: typeof baseWeights) =>
    items.flatMap((item) => Array.from({ length: item.weight }, () => item.album));

  const unique = new Map<string, DiscoveryAlbum>();

  const pickLayer = (weighted: typeof baseWeights, salt: string) => {
    if (unique.size >= filter.limit || weighted.length === 0) return;
    const shuffled = seededShuffle(
      weightedToList(weighted),
      `${filter.seed ?? Date.now()}-${salt}-${filter.limit}-${filter.minYear}-${filter.maxYear}`
    );

    // Group by geo cluster key to improve city/region-level diversity while preserving country fallback.
    const byCluster = new Map<string, DiscoveryAlbum[]>();
    for (const album of shuffled) {
      if (!unique.has(album.id)) {
        const clusterKey = computeClusterKey(album);
        const list = byCluster.get(clusterKey) ?? [];
        list.push(album);
        byCluster.set(clusterKey, list);
      }
    }

    const clusterKeys = Array.from(byCluster.keys());
    let added = true;
    while (added && unique.size < filter.limit) {
      added = false;
      for (const key of clusterKeys) {
        if (unique.size >= filter.limit) break;
        const list = byCluster.get(key)!;
        if (list.length > 0) {
          const album = list.shift()!;
          unique.set(album.id, album);
          added = true;
        }
      }
    }
  };

  pickLayer(inBoundsWeighted, "in");
  pickLayer(preferredOutWeighted, "pref-out");
  pickLayer(remainingWeighted, "global");

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
