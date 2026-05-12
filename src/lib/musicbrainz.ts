import dns from "node:dns";
import { ProxyAgent } from "undici";

type MusicBrainzArtist = {
  id: string;
  name: string;
};

type MusicBrainzRelease = {
  id: string;
  title: string;
  date?: string;
  "artist-credit"?: Array<{
    artist?: MusicBrainzArtist;
  }>;
  tags?: Array<{ name?: string }>;
  genres?: Array<{ name?: string }>;
};

type MusicBrainzReleaseResponse = {
  count?: number;
  offset?: number;
  "release-count"?: number;
  releases?: MusicBrainzRelease[];
};

type MusicBrainzArtistResponse = {
  id: string;
  name: string;
  country?: string;
  area?: {
    name?: string;
  };
  "begin-area"?: {
    name?: string;
  };
};

const MUSICBRAINZ_BASE_URL =
  (process.env.MUSICBRAINZ_BASE_URL?.trim() || "https://musicbrainz.org/ws/2").replace(/\/+$/, "");
const MUSICBRAINZ_TIMEOUT_MS = Number.parseInt(process.env.MUSICBRAINZ_TIMEOUT_MS ?? "12000", 10);
const MUSICBRAINZ_RETRIES = Number.parseInt(process.env.MUSICBRAINZ_RETRIES ?? "2", 10);
const MUSICBRAINZ_MIN_INTERVAL_MS = Number.parseInt(
  process.env.MUSICBRAINZ_MIN_INTERVAL_MS ?? "1100",
  10
);
const MUSICBRAINZ_EXACT_MAX_PAGES = Number.parseInt(
  process.env.MUSICBRAINZ_EXACT_MAX_PAGES ?? "2",
  10
);
const OUTBOUND_PROXY =
  process.env.HTTPS_PROXY?.trim() ||
  process.env.HTTP_PROXY?.trim() ||
  process.env.ALL_PROXY?.trim() ||
  "";
const proxyAgent = OUTBOUND_PROXY ? new ProxyAgent(OUTBOUND_PROXY) : null;
const MB_TOKENS = (process.env.MUSICBRAINZ_TOKENS ?? process.env.MUSICBRAINZ_TOKEN ?? "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

let mbRequestChain: Promise<void> = Promise.resolve();
let lastMbRequestAt = 0;

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore when runtime does not support changing DNS result order.
}

function pickAuthToken(seed: string): string | null {
  if (MB_TOKENS.length === 0) return null;
  const hash = Math.abs(seed.split("").reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0));
  return MB_TOKENS[hash % MB_TOKENS.length] ?? null;
}

export class MusicBrainzError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function buildUserAgent(): string {
  const appName = process.env.MUSIC_APP_NAME ?? "dream-music-timeline";
  const appVersion = process.env.MUSIC_APP_VERSION ?? "0.1.0";
  const contact = process.env.MUSIC_APP_CONTACT ?? "local-dev";
  return `${appName}/${appVersion} (${contact})`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMusicBrainzSlot() {
  const minInterval = Number.isFinite(MUSICBRAINZ_MIN_INTERVAL_MS)
    ? Math.max(0, MUSICBRAINZ_MIN_INTERVAL_MS)
    : 0;
  if (minInterval === 0) {
    return;
  }

  const slot = mbRequestChain.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, lastMbRequestAt + minInterval - now);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastMbRequestAt = Date.now();
  });

  mbRequestChain = slot.catch(() => undefined);
  await slot;
}

async function fetchMusicBrainz<T>(path: string, overrideToken?: string | null): Promise<T> {
  const token = overrideToken ?? pickAuthToken(path);
  const attempts = Math.max(1, MUSICBRAINZ_RETRIES + 1);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await waitForMusicBrainzSlot();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MUSICBRAINZ_TIMEOUT_MS);

    try {
      const response = await fetch(`${MUSICBRAINZ_BASE_URL}${path}`, {
        headers: {
          "User-Agent": buildUserAgent(),
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        next: { revalidate: 0 },
        signal: controller.signal,
        ...(proxyAgent ? ({ dispatcher: proxyAgent } as { dispatcher: ProxyAgent }) : {}),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const payload = await response.text();
        const code = response.status === 503 ? "RATE_LIMIT" : undefined;
        throw new MusicBrainzError(
          `MusicBrainz request failed: ${response.status} ${payload}`,
          code,
          response.status
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      if (error instanceof MusicBrainzError && error.code === "RATE_LIMIT") {
        throw error;
      }

      const hasNextAttempt = attempt < attempts - 1;
      if (!hasNextAttempt) {
        break;
      }

      await sleep(250 * (attempt + 1));
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "Unknown network error";
  throw new MusicBrainzError(
    `MusicBrainz network failed after ${attempts} attempts: ${message}`,
    "NETWORK_ERROR"
  );
}

type ReleaseSearchParams = {
  artist?: string | null;
  release?: string | null;
  fallbackQuery?: string | null;
};

function sanitizeTerm(term?: string | null): string | null {
  if (!term) return null;
  const trimmed = term.trim().replace(/"/g, " ");
  return trimmed.length ? trimmed : null;
}

function mapReleaseResponse(response: MusicBrainzReleaseResponse | null) {
  if (!response?.releases) return [] as Array<{
    id: string;
    title: string;
    date: string | null;
    year: number | null;
    artist: { id: string; name: string } | null;
    tags: string[];
  }>;

  return response.releases
    .map((release) => {
      const creditedArtist = release["artist-credit"]?.[0]?.artist;
      const releaseYear = release.date ? Number.parseInt(release.date.slice(0, 4), 10) : null;

      const tags = new Set<string>();
      (release.tags ?? []).forEach((t) => t.name && tags.add(t.name.toLowerCase()));
      (release.genres ?? []).forEach((g) => g.name && tags.add(g.name.toLowerCase()));

      return {
        id: release.id,
        title: release.title,
        date: release.date ?? null,
        year: Number.isNaN(releaseYear) ? null : releaseYear,
        artist: creditedArtist
          ? {
              id: creditedArtist.id,
              name: creditedArtist.name,
            }
          : null,
        tags: Array.from(tags),
      };
    })
    .filter((r) => r.artist !== null);
}

function normalizeExactTerm(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isExactArtistAndReleaseMatch(
  item: { title: string; artist: { id: string; name: string } | null },
  artist: string,
  release: string
) {
  if (!item.artist) return false;
  return (
    normalizeExactTerm(item.artist.name) === normalizeExactTerm(artist) &&
    normalizeExactTerm(item.title) === normalizeExactTerm(release)
  );
}

function isExactArtistMatch(
  item: { artist: { id: string; name: string } | null },
  artist: string
) {
  if (!item.artist) return false;
  return normalizeExactTerm(item.artist.name) === normalizeExactTerm(artist);
}

function isExactReleaseMatch(item: { title: string }, release: string) {
  return normalizeExactTerm(item.title) === normalizeExactTerm(release);
}

async function fetchAllExactReleaseMatches(
  params: { artist?: string | null; release?: string | null },
  authToken?: string | null,
  maxResults = 10
) {
  const artist = sanitizeTerm(params.artist);
  const release = sanitizeTerm(params.release);
  if (!artist && !release) return [] as ReturnType<typeof mapReleaseResponse>;

  let exactQuery = "";
  let matcher: (item: ReturnType<typeof mapReleaseResponse>[number]) => boolean;

  if (artist && release) {
    exactQuery = `artist:"${artist}" AND release:"${release}"`;
    matcher = (item) => isExactArtistAndReleaseMatch(item, artist, release);
  } else if (artist) {
    exactQuery = `artist:"${artist}"`;
    matcher = (item) => isExactArtistMatch(item, artist);
  } else {
    exactQuery = `release:"${release}"`;
    matcher = (item) => isExactReleaseMatch(item, release as string);
  }

  const pageSize = 100;
  const encoded = encodeURIComponent(exactQuery);
  const collected: ReturnType<typeof mapReleaseResponse> = [];
  const seenReleaseIds = new Set<string>();
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  let pagesFetched = 0;
  const maxPages = artist && release
    ? Number.POSITIVE_INFINITY
    : Math.max(1, MUSICBRAINZ_EXACT_MAX_PAGES);
  const targetCount = Number.isFinite(maxResults) ? Math.max(1, maxResults) : 10;

  while (offset < total && pagesFetched < maxPages && collected.length < targetCount) {
    const path = `/release?query=${encoded}&fmt=json&limit=${pageSize}&offset=${offset}&inc=artist-credits+tags+genres`;
    const response = await fetchMusicBrainz<MusicBrainzReleaseResponse>(path, authToken);
    pagesFetched += 1;
    const mapped = mapReleaseResponse(response);

    for (const item of mapped) {
      if (!matcher(item)) continue;
      if (seenReleaseIds.has(item.id)) continue;
      seenReleaseIds.add(item.id);
      collected.push(item);
      if (collected.length >= targetCount) {
        return collected.slice(0, targetCount);
      }
    }

    const responseCount = response["release-count"] ?? response.count ?? 0;
    total = Number.isFinite(responseCount) ? Math.max(0, responseCount) : 0;
    const pageLength = response.releases?.length ?? 0;

    if (pageLength === 0) break;
    offset += pageLength;
  }

  return collected;
}

export async function searchReleasesByFields(
  params: ReleaseSearchParams,
  limit = 10,
  authToken?: string | null
) {
  const artist = sanitizeTerm(params.artist);
  const release = sanitizeTerm(params.release);
  const fallback = sanitizeTerm(params.fallbackQuery);

  // Exact-first strategy:
  // 1) artist + release => return all exact matches for both fields
  // 2) artist-only/release-only => return all exact matches for that field
  // 3) if exact is empty, fallback to fuzzy MB query variants
  if (artist || release) {
    const exactMatches = await fetchAllExactReleaseMatches({ artist, release }, authToken, limit);
    if (exactMatches.length > 0) {
      return exactMatches.slice(0, limit);
    }
  }

  // Prioritized query variants
  const queries: string[] = [];
  if (artist && release) queries.push(`${artist} ${release}`);
  if (release) queries.push(`release:"${release}"`);
  if (artist) queries.push(`artist:"${artist}"`);
  if (fallback) queries.push(fallback);

  // Ensure at least one query exists
  if (queries.length === 0) return [] as ReturnType<typeof mapReleaseResponse>;

  const seenQueries = new Set<string>();
  const collected: ReturnType<typeof mapReleaseResponse> = [];
  let failedQueries = 0;
  let lastError: unknown = null;

  for (const rawQuery of queries) {
    if (seenQueries.has(rawQuery)) continue;
    seenQueries.add(rawQuery);

    const encoded = encodeURIComponent(rawQuery);
    const path = `/release?query=${encoded}&fmt=json&limit=${limit}&inc=artist-credits+tags+genres`;

    try {
      const response = await fetchMusicBrainz<MusicBrainzReleaseResponse>(path, authToken);
      const mapped = mapReleaseResponse(response);
      for (const item of mapped) {
        if (!collected.some((r) => r.id === item.id)) {
          collected.push(item);
          if (collected.length >= limit) {
            return collected.slice(0, limit);
          }
        }
      }
    } catch (error) {
      // Swallow MB errors (rate limit, network) and continue to next query variant
      failedQueries += 1;
      lastError = error;
      continue;
    }
  }

  if (collected.length === 0 && failedQueries === seenQueries.size && lastError) {
    throw lastError instanceof Error
      ? lastError
      : new Error("MusicBrainz search failed for all query variants.");
  }

  return collected.slice(0, limit);
}

export async function searchReleases(query: string, limit = 10, authToken?: string | null) {
  // Backward-compatible wrapper using the fallback query
  return searchReleasesByFields({ fallbackQuery: query }, limit, authToken);
}

export async function resolveReleaseByArtistAndTitle(
  artistName: string,
  releaseTitle: string,
  authToken?: string | null
) {
  const results = await searchReleasesByFields(
    { artist: artistName, release: releaseTitle },
    1,
    authToken
  );

  if (results.length === 0) {
    throw new Error("No matching release found in MusicBrainz.");
  }

  const best = results[0];
  if (!best.artist) {
    throw new Error("No artist information found for the matched release.");
  }

  return {
    id: best.id,
    title: best.title,
    date: best.date,
    year: best.year,
    artist: best.artist,
  };
}

export async function resolveReleaseById(releaseId: string, authToken?: string | null) {
  const normalizedId = releaseId.trim();
  if (!normalizedId) {
    throw new Error("Release ID is required.");
  }

  const release = await fetchMusicBrainz<MusicBrainzRelease>(
    `/release/${encodeURIComponent(normalizedId)}?fmt=json&inc=artist-credits+tags+genres`,
    authToken
  );

  const artist = release["artist-credit"]?.[0]?.artist;
  if (!artist) {
    throw new Error("No artist information found for the selected MusicBrainz release.");
  }

  const releaseYear = release.date ? Number.parseInt(release.date.slice(0, 4), 10) : null;

  return {
    id: release.id,
    title: release.title,
    date: release.date ?? null,
    year: Number.isNaN(releaseYear) ? null : releaseYear,
    artist: {
      id: artist.id,
      name: artist.name,
    },
  };
}

export async function resolveArtistGeoById(artistId: string, authToken?: string | null) {
  const artistResponse = await fetchMusicBrainz<MusicBrainzArtistResponse>(
    `/artist/${artistId}?fmt=json`,
    authToken
  );

  const cityName = artistResponse["begin-area"]?.name ?? null;

  return {
    artistId: artistResponse.id,
    artistName: artistResponse.name,
    countryCode: artistResponse.country ?? null,
    countryName: artistResponse.area?.name ?? null,
    cityName,
    regionCode: null,
    regionName: null,
    geoGranularity: cityName ? ("city" as const) : ("country" as const),
    rawPayload: artistResponse,
  };
}