import { NextResponse } from "next/server";

import { DISCOVERY_ALBUM_CATALOG } from "@/lib/discovery-catalog";
import { dbAll, dbGet, dbRun } from "@/lib/local-db";
import { searchReleasesByFields, resolveArtistGeoById } from "@/lib/musicbrainz";
import { resolveArtistGeoWithCache } from "@/lib/record-ingest";
import { getCountryCoordinates } from "@/lib/country-centroid";

const MB_SEARCH_CACHE_TTL_MS = 90_000;
const MB_RATE_LIMIT_COOLDOWN_MS = 120_000;

function pickFromList(tokens: string[], seed: string): string | null {
  if (!tokens.length) return null;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return tokens[hash % tokens.length] ?? null;
}

type MbSearchItem = Awaited<ReturnType<typeof searchReleasesByFields>>[number];

// In-memory cache for MB search results to avoid hitting the API repeatedly for the same query
const mbSearchCache = new Map<string, { ts: number; results: MbSearchItem[] }>();
let lastMbRateLimitMs = 0;

async function getUserMbToken(userId: string | null, seed: string): Promise<string | null> {
  if (!userId) return null;

  try {
    const data = await dbGet<{ mb_token: string | null }>(
      `select mb_token from users where id = ? limit 1`,
      [userId]
    );
    if (!data) return null;
    const raw = data.mb_token ?? "";
    const tokens = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return pickFromList(tokens, seed);
  } catch {
    return null;
  }
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

type SearchResultSource = "pool" | "musicbrainz";

type SearchResult = {
  id: string;
  albumTitle: string;
  artistName: string;
  releaseYear: number;
  countryCode: string;
  countryName: string;
  cityName: string;
  coordinates: { lng: number; lat: number };
  source: SearchResultSource;
  tags?: string[];
};

type SearchMeta = {
  source: "local-only" | "local-plus-external";
  exactMatch: boolean;
  localCount: number;
  shouldOfferExternalSearch: boolean;
  externalRequested: boolean;
  externalAttempted: boolean;
  externalSuppressedByCooldown: boolean;
  externalError?: string;
};

function normalizeKey(title: string, artist: string) {
  return `${title.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function hasExactMatch(rows: Array<{ album_title: string; artist_name: string }>, artistQuery: string, albumQuery: string, query: string) {
  const aq = normalizeText(artistQuery);
  const lq = normalizeText(albumQuery);
  const q = normalizeText(query);

  if (aq && lq) {
    return rows.some(
      (row) =>
        normalizeText(row.artist_name) === aq &&
        normalizeText(row.album_title) === lq
    );
  }

  if (lq) {
    return rows.some((row) => normalizeText(row.album_title) === lq);
  }

  if (aq) {
    return rows.some((row) => normalizeText(row.artist_name) === aq);
  }

  if (q) {
    return rows.some(
      (row) => normalizeText(row.artist_name) === q || normalizeText(row.album_title) === q
    );
  }

  return false;
}

// Generate a small deterministic offset (in degrees) so country-level fallbacks don't stack
function jitterCoordinates(lng: number, lat: number, seed: string) {
  const hash = hashString(seed);
  const angle = (hash % 360) * (Math.PI / 180);
  const radiusDeg = 0.35; // ~35km at the equator; keeps points near country centroid
  return {
    lng: lng + Math.cos(angle) * radiusDeg,
    lat: lat + Math.sin(angle) * radiusDeg * 0.6, // squash latitude a bit
  };
}

function fallbackCoordinatesFromSeed(seed: string) {
  const hash = hashString(seed);
  const lng = ((hash % 36000) / 100) - 180;
  const lat = (((Math.floor(hash / 36000) % 12000) / 100) - 60);
  return {
    lng: clampLng(lng),
    lat: clampLat(lat),
  };
}

function clampLng(value: number) {
  if (value > 180) return 180;
  if (value < -180) return -180;
  return value;
}

function clampLat(value: number) {
  if (value > 85) return 85;
  if (value < -85) return -85;
  return value;
}

async function upsertDiscoveryPoolFromSearch(result: SearchResult) {
  await dbRun(
    `insert into discovery_pool (
      id, album_title, artist_name, release_year, country_code, country_name,
      city_name, lng, lat, enabled, weight, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'))
    on conflict(id) do update set
      album_title = excluded.album_title,
      artist_name = excluded.artist_name,
      release_year = excluded.release_year,
      country_code = excluded.country_code,
      country_name = excluded.country_name,
      city_name = excluded.city_name,
      lng = excluded.lng,
      lat = excluded.lat,
      enabled = 1,
      weight = 1`,
    [
      result.id,
      result.albumTitle,
      result.artistName,
      result.releaseYear,
      result.countryCode,
      result.countryName,
      result.cityName,
      result.coordinates.lng,
      result.coordinates.lat,
    ]
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.toLowerCase().trim() || "";
  const artistQuery = searchParams.get("artist")?.trim() || "";
  const albumQuery = searchParams.get("album")?.trim() || "";
  const combinedQuery = `${artistQuery} ${albumQuery} ${query}`.trim();
  const allowExternal = searchParams.get("allowExternal") === "1";
  const userId = request.headers.get("x-user-id")?.trim() || null;
  const userMbToken = await getUserMbToken(userId, combinedQuery || "seed");

  if (!combinedQuery) {
    const emptyMeta: SearchMeta = {
      source: "local-only",
      exactMatch: false,
      localCount: 0,
      shouldOfferExternalSearch: false,
      externalRequested: allowExternal,
      externalAttempted: false,
      externalSuppressedByCooldown: false,
    };
    return NextResponse.json({ results: [], meta: emptyMeta });
  }

  const tagFilter = (searchParams.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const decadeFilterRaw = searchParams.get("decade");
  const decadeFilter = decadeFilterRaw ? Number.parseInt(decadeFilterRaw, 10) : null; // e.g., 1990 -> 1990s

  const areaFilter = (searchParams.get("area") ?? "").trim().toLowerCase();
  let results: SearchResult[] = [];
  let localPoolMatches: Array<{
    id: string;
    album_title: string;
    artist_name: string;
    release_year: number;
    country_code: string;
    country_name: string;
    city_name: string;
    lng: number;
    lat: number;
  }> = [];
  const now = Date.now();
  let externalAttempted = false;
  let externalSuppressedByCooldown = false;
  let externalError: string | undefined;

  try {
    const rows = await dbAll<{
      id: string;
      album_title: string;
      artist_name: string;
      release_year: number;
      country_code: string;
      country_name: string;
      city_name: string;
      lng: number;
      lat: number;
    }>(
      `select
        id, album_title, artist_name, release_year, country_code, country_name, city_name, lng, lat
       from discovery_pool
       where enabled = 1
       order by created_at desc
       limit 5000`
    );

    const q = query.toLowerCase();
    const aq = artistQuery.toLowerCase();
    const lq = albumQuery.toLowerCase();

    localPoolMatches = rows
      .filter((row) => {
        if (lq && !row.album_title.toLowerCase().includes(lq)) return false;
        if (aq && !row.artist_name.toLowerCase().includes(aq)) return false;
        if (!lq && !aq && q) {
          return (
            row.album_title.toLowerCase().includes(q) || row.artist_name.toLowerCase().includes(q)
          );
        }
        return true;
      });

    results = localPoolMatches
      .slice(0, 10)
      .map((row) => ({
        id: row.id,
        albumTitle: row.album_title,
        artistName: row.artist_name,
        releaseYear: row.release_year,
        countryCode: row.country_code,
        countryName: row.country_name,
        cityName: row.city_name,
        coordinates: {
          lng: row.lng,
          lat: row.lat,
        },
        source: "pool" as const,
      }));
  } catch (e) {
    console.error("Local DB search error:", e);
  }

  if (results.length === 0) {
    const q = query.toLowerCase();
    const aq = artistQuery.toLowerCase();
    const lq = albumQuery.toLowerCase();

    const catalogMatches = DISCOVERY_ALBUM_CATALOG.filter((item) => {
      if (lq && !item.albumTitle.toLowerCase().includes(lq)) return false;
      if (aq && !item.artistName.toLowerCase().includes(aq)) return false;
      if (!lq && !aq && q) {
        return (
          item.albumTitle.toLowerCase().includes(q) || item.artistName.toLowerCase().includes(q)
        );
      }
      return true;
    }).slice(0, 10);

    if (catalogMatches.length > 0) {
      results = catalogMatches.map((item) => ({
        ...item,
        source: "pool" as const,
      }));
    }
  }

  const exactMatch = hasExactMatch(localPoolMatches, artistQuery, albumQuery, query);
  const shouldOfferExternalSearch = results.length <= 3 && !exactMatch;

  // Local-first: only query third-party APIs when user explicitly requests it.
  if (allowExternal) {
    externalAttempted = true;
    const inCooldown = now - lastMbRateLimitMs < MB_RATE_LIMIT_COOLDOWN_MS;
    externalSuppressedByCooldown = inCooldown;
    if (inCooldown) {
      externalError = "Third-party search is cooling down due to recent rate limits.";
    }
    if (!inCooldown) {
      try {
        let mbRateLimited = false;
        const cacheKey = JSON.stringify({ query, artistQuery, albumQuery });
        const cached = mbSearchCache.get(cacheKey);
        let mbResults: MbSearchItem[] = [];

        if (cached && now - cached.ts < MB_SEARCH_CACHE_TTL_MS) {
          mbResults = cached.results;
        } else {
          mbResults = await searchReleasesByFields(
            {
              artist: artistQuery || null,
              release: albumQuery || null,
              fallbackQuery: query || combinedQuery || null,
            },
            8,
            userMbToken
          );
          mbSearchCache.set(cacheKey, { ts: now, results: mbResults });
        }

        const seenReleaseIds = new Set<string>();

        for (const release of mbResults) {
          const artist = release.artist;
          if (!artist) continue;
          if (seenReleaseIds.has(release.id)) continue;
          seenReleaseIds.add(release.id);

          // Check if we already have this in our results
          const exists = results.some(
            (r) => normalizeKey(r.albumTitle, r.artistName) === normalizeKey(release.title, artist.name)
          );

          if (exists) continue;

          // Try to get geo info for the artist
          let geoInfo: {
            artistId: string;
            artistName: string;
            countryCode: string | null;
            countryName: string | null;
            cityName: string | null;
          } | null = null;

          try {
            geoInfo = await resolveArtistGeoWithCache(artist.id, userMbToken);
          } catch (e) {
            console.error("Failed to resolve geo with cache:", e);
          }

          const hasGeoCountry = Boolean(geoInfo?.countryCode || geoInfo?.countryName);

          if ((!geoInfo || !hasGeoCountry) && !mbRateLimited) {
            try {
              const rawGeo = await Promise.race([
                resolveArtistGeoById(artist.id, userMbToken),
                new Promise<any>((_, reject) =>
                  setTimeout(() => reject(new Error("MusicBrainz geo timeout")), 2000)
                ),
              ]);
              geoInfo = {
                artistId: rawGeo.artistId,
                artistName: rawGeo.artistName,
                countryCode: rawGeo.countryCode,
                countryName: rawGeo.countryName,
                cityName: rawGeo.cityName,
              };
            } catch (e) {
              if ((e as any)?.code === "RATE_LIMIT") {
                mbRateLimited = true;
                lastMbRateLimitMs = now;
                externalError = "Third-party rate limit reached. Please retry later.";
                continue;
              }
              console.error("Failed to resolve geo from MB:", e);
              externalError =
                e instanceof Error ? e.message : "Failed to resolve artist geo from third-party.";
            }
          }

          // Try to get coordinates
          let coordinates: { lng: number; lat: number } | null = null;
          if (geoInfo) {
            // If we got it from cache, it might not have coordinates directly in the object
            // We need to calculate them from country code/name
            coordinates = getCountryCoordinates(geoInfo.countryCode, geoInfo.countryName);
          }

          if (!coordinates) {
            // Keep search usable when third-party geo is incomplete.
            const seed = `${artist.id}-${release.id}-${artist.name}-${release.title}`;
            coordinates = fallbackCoordinatesFromSeed(seed);
          }

          if (coordinates) {
            const seed = `${artist.name}-${release.title}-${geoInfo?.cityName ?? geoInfo?.countryCode ?? ""}`;
            const jittered = jitterCoordinates(coordinates.lng, coordinates.lat, seed);
            const item: SearchResult = {
              id: `mb-${release.id}`,
              albumTitle: release.title,
              artistName: artist.name,
              releaseYear: release.year ?? new Date().getFullYear(),
              countryCode: geoInfo?.countryCode || "XX",
              countryName: geoInfo?.countryName || "Unknown",
              cityName: geoInfo?.cityName || "Unknown",
              coordinates: {
                lng: jittered.lng,
                lat: jittered.lat,
              },
              source: "musicbrainz",
              tags: release.tags ?? [],
            };

            results.push(item);

            try {
              await upsertDiscoveryPoolFromSearch(item);
            } catch (cacheError) {
              // Search should not fail if cache write fails.
              console.error("Failed to persist external search result:", cacheError);
            }
          }
        }

        if (mbResults.length === 0 && !externalError) {
          externalError = "No third-party matches found for this query.";
        }
      } catch (e) {
        console.error("MusicBrainz search error:", e);
        externalError = e instanceof Error ? e.message : "Third-party search request failed.";
      }
    }
  }

  // Deduplicate and stabilize ordering
  const priority: Record<SearchResultSource, number> = {
    pool: 0,
    musicbrainz: 1,
  };

  const best = new Map<string, SearchResult>();
  for (const item of results) {
    const key = normalizeKey(item.albumTitle, item.artistName);
    const existing = best.get(key);
    if (!existing || priority[item.source] < priority[existing.source]) {
      best.set(key, item);
    }
  }

  const deduped = Array.from(best.values());

  const matchesTagFilter = (item: SearchResult) =>
    tagFilter.every((tag) => (item.tags ?? []).some((t) => t.toLowerCase() === tag));

  const matchesDecade = (item: SearchResult) => {
    if (!decadeFilter) return true;
    if (!item.releaseYear) return false;
    const decade = Math.floor(item.releaseYear / 10) * 10;
    return decade === decadeFilter;
  };

  const matchesArea = (item: SearchResult) => {
    if (!areaFilter) return true;
    return (
      item.countryName.toLowerCase().includes(areaFilter) ||
      item.cityName.toLowerCase().includes(areaFilter) ||
      item.countryCode.toLowerCase() === areaFilter
    );
  };

  const filtered = deduped.filter((item) => matchesTagFilter(item) && matchesDecade(item) && matchesArea(item));
  const filteredLocalCount = filtered.filter((item) => item.source === "pool").length;
  const shouldOfferExternalAfterFilter = filteredLocalCount <= 3 && !exactMatch;

  const stableHash = (title: string, artist: string) =>
    hashString(`${combinedQuery || query}::${title.toLowerCase()}::${artist.toLowerCase()}`);

  filtered.sort((a, b) => {
    const pa = priority[a.source];
    const pb = priority[b.source];
    if (pa !== pb) return pa - pb;
    return stableHash(a.albumTitle, a.artistName) - stableHash(b.albumTitle, b.artistName);
  });

  const meta: SearchMeta = {
    source: allowExternal ? "local-plus-external" : "local-only",
    exactMatch,
    localCount: localPoolMatches.length,
    shouldOfferExternalSearch: !allowExternal && (shouldOfferExternalSearch || shouldOfferExternalAfterFilter),
    externalRequested: allowExternal,
    externalAttempted,
    externalSuppressedByCooldown,
    externalError,
  };

  return NextResponse.json({ results: filtered, meta });
}
