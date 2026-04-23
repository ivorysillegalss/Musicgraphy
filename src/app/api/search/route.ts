import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { getLocalAuthUser } from "@/lib/local-auth";
import { DISCOVERY_ALBUM_CATALOG } from "@/lib/discovery-catalog";
import { dbAll, dbGet, dbRun } from "@/lib/local-db";
import {
  computeTokenExpiryIso,
  refreshMusicBrainzAccessToken,
  resolveMusicBrainzOAuthConfig,
} from "@/lib/musicbrainz-oauth";
import { searchReleasesByFields, resolveArtistGeoById } from "@/lib/musicbrainz";
import { resolveArtistGeoWithCache } from "@/lib/record-ingest";
import { getCountryCoordinates } from "@/lib/country-centroid";
import { isUnknownGeoLabel, sanitizeGeoLabel } from "@/lib/geo-label";

const MB_SEARCH_CACHE_TTL_MS = 90_000;
const MB_RATE_LIMIT_COOLDOWN_MS = 120_000;

type RateLimitLikeError = {
  code?: string;
  status?: number;
  message?: string;
};

function isMusicBrainzRateLimitError(error: unknown) {
  const e = error as RateLimitLikeError | null;
  if (!e) return false;
  if (e.code === "RATE_LIMIT") return true;
  if (e.status === 503) return true;

  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("allowable rate") || msg.includes("503");
}

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

async function getPreferredUserMbToken(
  request: Request,
  userId: string | null,
  seed: string
): Promise<string | null> {
  if (!userId) return null;

  try {
    const row = await dbGet<{
      mb_oauth_access_token: string | null;
      mb_oauth_refresh_token: string | null;
      mb_oauth_expires_at: string | null;
    }>(
      `select mb_oauth_access_token, mb_oauth_refresh_token, mb_oauth_expires_at
       from users
       where id = ?
       limit 1`,
      [userId]
    );

    const accessToken = row?.mb_oauth_access_token?.trim() || "";
    const refreshToken = row?.mb_oauth_refresh_token?.trim() || "";
    const expiresMs = Date.parse(row?.mb_oauth_expires_at ?? "");
    const hasFreshAccessToken =
      Boolean(accessToken) && Number.isFinite(expiresMs) && Date.now() < expiresMs - 30_000;

    if (hasFreshAccessToken) {
      return accessToken;
    }

    if (refreshToken) {
      const config = resolveMusicBrainzOAuthConfig(request);
      if (config) {
        try {
          const refreshed = await refreshMusicBrainzAccessToken({
            tokenUrl: config.tokenUrl,
            refreshToken,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
          });

          const refreshedAccessToken = refreshed.access_token?.trim() || "";
          if (refreshedAccessToken) {
            const expiresAt = computeTokenExpiryIso(refreshed.expires_in);
            const nextRefreshToken = refreshed.refresh_token ?? refreshToken;

            await dbRun(
              `update users
               set mb_oauth_access_token = ?,
                   mb_oauth_refresh_token = ?,
                   mb_oauth_token_type = ?,
                   mb_oauth_scope = ?,
                   mb_oauth_expires_at = ?,
                   mb_token = ?,
                   updated_at = datetime('now')
               where id = ?`,
              [
                refreshedAccessToken,
                nextRefreshToken,
                refreshed.token_type ?? "Bearer",
                refreshed.scope ?? null,
                expiresAt,
                refreshedAccessToken,
                userId,
              ]
            );

            return refreshedAccessToken;
          }
        } catch {
          // Fall through to legacy user tokens when refresh fails.
        }
      }
    }
  } catch {
    // Fall through to legacy user tokens when oauth lookup fails.
  }

  return getUserMbToken(userId, seed);
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

type SearchHints = {
  artistQuery?: string;
  albumQuery?: string;
  query?: string;
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
    // Artist-only search is an entity query, not a full result query.
    // Even if artist name matches exactly, we may still need external expansion
    // when local albums are sparse.
    return false;
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

function normalizeClusterPart(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function buildSearchAlias(primary: string, ...aliases: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const output: string[] = [];

  const add = (value: string | null | undefined) => {
    const text = String(value ?? "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(text);
  };

  add(primary);
  for (const alias of aliases) {
    add(alias);
  }

  return output.join(" | ");
}

async function upsertDiscoveryPoolFromSearch(result: SearchResult, hints?: SearchHints) {
  const cityName = sanitizeGeoLabel(result.cityName);
  const regionCode = null;
  const regionName = null;
  const geoGranularity = cityName ? "city" : "country";
  const clusterCountry = normalizeClusterPart(result.countryCode) || "xx";
  const clusterCity = normalizeClusterPart(cityName);
  const geoClusterKey = clusterCity
    ? `${clusterCountry}:na:${clusterCity}`
    : clusterCountry;
  const artistSearchName = buildSearchAlias(
    result.artistName,
    hints?.artistQuery,
    hints?.query
  );
  const albumSearchTitle = buildSearchAlias(
    result.albumTitle,
    hints?.albumQuery,
    hints?.query
  );

  await dbRun(
    `insert into discovery_pool (
      id, album_title, album_search_title, artist_name, artist_search_name, release_year, country_code, country_name,
      city_name, region_code, region_name, geo_granularity, geo_cluster_key,
      lng, lat, enabled, weight, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'))
    on conflict(id) do update set
      album_title = excluded.album_title,
      album_search_title = excluded.album_search_title,
      artist_name = excluded.artist_name,
      artist_search_name = excluded.artist_search_name,
      release_year = excluded.release_year,
      country_code = excluded.country_code,
      country_name = excluded.country_name,
      city_name = excluded.city_name,
      region_code = excluded.region_code,
      region_name = excluded.region_name,
      geo_granularity = excluded.geo_granularity,
      geo_cluster_key = excluded.geo_cluster_key,
      lng = excluded.lng,
      lat = excluded.lat,
      enabled = 1,
      weight = 1`,
    [
      result.id,
      result.albumTitle,
      albumSearchTitle,
      result.artistName,
      artistSearchName,
      result.releaseYear,
      result.countryCode,
      result.countryName,
      cityName ?? result.countryName,
      regionCode,
      regionName,
      geoGranularity,
      geoClusterKey,
      result.coordinates.lng,
      result.coordinates.lat,
    ]
  );
}

export async function GET(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.toLowerCase().trim() || "";
    const artistQuery = searchParams.get("artist")?.trim() || "";
    const albumQuery = searchParams.get("album")?.trim() || "";
    const combinedQuery = `${artistQuery} ${albumQuery} ${query}`.trim();
    const allowExternal = searchParams.get("allowExternal") === "1";
    const userId = user.id;
    const userMbToken = await getPreferredUserMbToken(request, userId, combinedQuery || "seed");

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
    const sqlFilters: string[] = ["enabled = 1"];
    const sqlArgs: Array<string | number> = [];

    const q = query.toLowerCase();
    const aq = artistQuery.toLowerCase();
    const lq = albumQuery.toLowerCase();

    if (lq) {
      sqlFilters.push("(lower(album_title) like ? or lower(coalesce(album_search_title, '')) like ?)");
      sqlArgs.push(`%${lq}%`, `%${lq}%`);
    }
    if (aq) {
      sqlFilters.push("(lower(artist_name) like ? or lower(coalesce(artist_search_name, '')) like ?)");
      sqlArgs.push(`%${aq}%`, `%${aq}%`);
    }
    if (!lq && !aq && q) {
      sqlFilters.push(
        "(lower(album_title) like ? or lower(artist_name) like ? or lower(coalesce(album_search_title, '')) like ? or lower(coalesce(artist_search_name, '')) like ?)"
      );
      sqlArgs.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    // Keep local search fast by trimming DB payload before JS post-processing.
    sqlArgs.push(300);

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
       where ${sqlFilters.join(" and ")}
       order by created_at desc
       limit ?`,
      sqlArgs
    );

    localPoolMatches = rows;

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
      externalError = undefined;
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
                new Promise<never>((_, reject) =>
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
              if ((e as RateLimitLikeError)?.code === "RATE_LIMIT") {
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

          const normalizedCountryCode = sanitizeGeoLabel(geoInfo?.countryCode)?.toUpperCase() ?? null;
          const normalizedCountryName = sanitizeGeoLabel(geoInfo?.countryName);
          const normalizedCityName = sanitizeGeoLabel(geoInfo?.cityName);
          const hasResolvableCountry =
            Boolean(normalizedCountryCode) &&
            normalizedCountryCode !== "XX" &&
            !isUnknownGeoLabel(normalizedCountryName);

          if (!hasResolvableCountry) {
            // Avoid fake placement when we do not know the artist country.
            externalError = externalError ?? "Some external results were skipped because location data is unavailable.";
            continue;
          }

          const ensuredCountryCode = normalizedCountryCode as string;
          const ensuredCountryName = normalizedCountryName ?? ensuredCountryCode;

          // Try to get coordinates
          let coordinates: { lng: number; lat: number } | null = null;
          coordinates = getCountryCoordinates(ensuredCountryCode, ensuredCountryName);

          if (!coordinates) {
            externalError = externalError ?? "Some external results were skipped because country coordinates are unavailable.";
            continue;
          }

          if (coordinates) {
            const seed = `${artist.name}-${release.title}-${normalizedCityName ?? normalizedCountryCode ?? ""}`;
            const jittered = jitterCoordinates(coordinates.lng, coordinates.lat, seed);
            const item: SearchResult = {
              id: `mb-${release.id}`,
              albumTitle: release.title,
              artistName: artist.name,
              releaseYear: release.year ?? new Date().getFullYear(),
              countryCode: ensuredCountryCode,
              countryName: ensuredCountryName,
              cityName: normalizedCityName ?? ensuredCountryName,
              coordinates: {
                lng: jittered.lng,
                lat: jittered.lat,
              },
              source: "musicbrainz",
              tags: release.tags ?? [],
            };

            try {
              await upsertDiscoveryPoolFromSearch(item, {
                artistQuery,
                albumQuery,
                query,
              });
            } catch (cacheError) {
              // Search should not fail if cache write fails.
              console.error("Failed to persist external search result:", cacheError);
            }

            // Deduplicate for current response, but always persist to local pool.
            const exists = results.some(
              (r) => normalizeKey(r.albumTitle, r.artistName) === normalizeKey(item.albumTitle, item.artistName)
            );
            if (!exists) {
              results.push(item);
            }
          }
        }

        if (mbResults.length === 0 && !externalError) {
          externalError = "No third-party matches found for this query.";
        }
      } catch (e) {
        console.error("MusicBrainz search error:", e);
        if (isMusicBrainzRateLimitError(e)) {
          lastMbRateLimitMs = now;
          externalSuppressedByCooldown = true;
          externalError = undefined;
        } else {
          externalError = e instanceof Error ? e.message : "Third-party search request failed.";
        }
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
  } catch (error) {
    return handleApiError(error);
  }
}
