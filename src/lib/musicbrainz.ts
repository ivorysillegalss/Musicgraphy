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

async function fetchMusicBrainz<T>(path: string, overrideToken?: string | null): Promise<T> {
  const token = overrideToken ?? pickAuthToken(path);
  const attempts = Math.max(1, MUSICBRAINZ_RETRIES + 1);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
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

export async function searchReleasesByFields(
  params: ReleaseSearchParams,
  limit = 10,
  authToken?: string | null
) {
  const artist = sanitizeTerm(params.artist);
  const release = sanitizeTerm(params.release);
  const fallback = sanitizeTerm(params.fallbackQuery);

  // Prioritized query variants
  const queries: string[] = [];
  if (artist && release) queries.push(`artist:"${artist}" AND release:"${release}"`);
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
  const releaseQuery = encodeURIComponent(
    `release:${releaseTitle} AND artist:${artistName}`
  );

  const releaseResponse = await fetchMusicBrainz<MusicBrainzReleaseResponse>(
    `/release?query=${releaseQuery}&fmt=json&limit=1`,
    authToken
  );

  const firstRelease = releaseResponse.releases?.[0];
  if (!firstRelease) {
    throw new Error("No matching release found in MusicBrainz.");
  }

  const creditedArtist = firstRelease["artist-credit"]?.[0]?.artist;
  if (!creditedArtist) {
    throw new Error("No artist information found for the matched release.");
  }

  const releaseYear = firstRelease.date
    ? Number.parseInt(firstRelease.date.slice(0, 4), 10)
    : null;

  return {
    id: firstRelease.id,
    title: firstRelease.title,
    date: firstRelease.date ?? null,
    year: Number.isNaN(releaseYear) ? null : releaseYear,
    artist: {
      id: creditedArtist.id,
      name: creditedArtist.name,
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