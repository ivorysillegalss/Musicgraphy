import { dbGet, dbRun } from "@/lib/local-db";
import { searchReleasesByFields } from "@/lib/musicbrainz";

export type CoverSource = "itunes" | "coverartarchive" | "deezer";

export type CoverLookupResponse = {
  found: boolean;
  source: CoverSource | null;
  coverUrl: string | null;
  candidates: string[];
  cache: "hit" | "miss" | "refresh";
};

type CoverCacheRow = {
  cache_key: string;
  artist_name: string | null;
  album_title: string | null;
  source: CoverSource | null;
  cover_url: string | null;
  candidates_json: string;
  found: number;
  updated_at: string;
};

const HIT_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MISS_TTL_MS = 1000 * 60 * 60 * 24 * 3;

function normalize(input: string | null | undefined) {
  return (input ?? "").trim();
}

function normalizeKeyPart(input: string | null | undefined) {
  return normalize(input)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .trim();
}

function buildQueryTerm(artist: string, album: string, term: string) {
  if (term) return term;
  return `${artist} ${album}`.trim();
}

function buildCacheKey(artist: string, album: string, term: string) {
  const artistKey = normalizeKeyPart(artist);
  const albumKey = normalizeKeyPart(album);
  if (artistKey && albumKey) {
    return `artist:${artistKey}::album:${albumKey}`;
  }
  return `term:${normalizeKeyPart(term)}`;
}

function parseDateMs(value: string) {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return 0;
  return ms;
}

function isPlaceholderUrl(url: string) {
  const lower = url.toLowerCase();
  return (
    lower.includes("noimage") ||
    lower.includes("no-image") ||
    lower.includes("placeholder") ||
    lower.includes("default_cover")
  );
}

function extractMaxEdgeFromUrl(url: string) {
  const match = url.match(/(\d{2,4})x(\d{2,4})/i);
  if (!match) return 0;
  const w = Number.parseInt(match[1], 10);
  const h = Number.parseInt(match[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return 0;
  return Math.max(w, h);
}

function scoreCover(url: string, source: CoverSource) {
  let score = 0;

  if (source === "coverartarchive") score += 30;
  if (source === "itunes") score += 20;
  if (source === "deezer") score += 15;

  const edge = extractMaxEdgeFromUrl(url);
  if (edge >= 1200) score += 35;
  else if (edge >= 800) score += 25;
  else if (edge >= 600) score += 15;
  else if (edge >= 300) score += 8;

  if (url.includes("cover_xl") || url.includes("/1200x1200")) score += 8;
  if (url.includes("600x600")) score += 4;
  if (isPlaceholderUrl(url)) score -= 50;

  return score;
}

function rankCandidateUrls(items: Array<{ url: string; source: CoverSource }>) {
  const deduped = new Map<string, { url: string; source: CoverSource; score: number }>();

  for (const item of items) {
    const url = item.url.trim();
    if (!url) continue;
    const next = {
      url,
      source: item.source,
      score: scoreCover(url, item.source),
    };

    const existing = deduped.get(url);
    if (!existing || next.score > existing.score) {
      deduped.set(url, next);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => b.score - a.score);
}

function tryUpgradeItunesArtwork(url: string) {
  return url
    .replace("100x100bb", "1200x1200bb")
    .replace("100x100", "1200x1200")
    .replace("60x60bb", "1200x1200bb");
}

async function fetchFromItunes(term: string) {
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=5`,
    {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    }
  );

  if (!res.ok) return [] as string[];

  const data = (await res.json()) as {
    results?: Array<{
      artworkUrl100?: string;
      artworkUrl60?: string;
    }>;
  };

  return (data.results ?? [])
    .map((item) => item.artworkUrl100 ?? item.artworkUrl60 ?? "")
    .filter(Boolean)
    .map(tryUpgradeItunesArtwork);
}

async function fetchFromCoverArtArchive(artist: string, album: string, fallbackTerm: string) {
  const releases = await searchReleasesByFields(
    {
      artist: artist || null,
      release: album || null,
      fallbackQuery: fallbackTerm || null,
    },
    5
  );

  const urls: string[] = [];
  for (const release of releases) {
    const coverRes = await fetch(`https://coverartarchive.org/release/${release.id}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });

    if (!coverRes.ok) continue;

    const payload = (await coverRes.json()) as {
      images?: Array<{
        front?: boolean;
        image?: string;
        thumbnails?: {
          large?: string;
          small?: string;
        };
      }>;
    };

    const images = payload.images ?? [];
    const ordered = [
      ...images.filter((img) => img.front),
      ...images.filter((img) => !img.front),
    ];

    for (const image of ordered) {
      const url = image.thumbnails?.large ?? image.image ?? image.thumbnails?.small ?? null;
      if (url) {
        urls.push(url);
      }
    }
  }

  return urls;
}

async function fetchFromDeezer(term: string) {
  const res = await fetch(
    `https://api.deezer.com/search/album?q=${encodeURIComponent(term)}&limit=3`,
    {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    }
  );

  if (!res.ok) return [] as string[];

  const data = (await res.json()) as {
    data?: Array<{
      cover_xl?: string;
      cover_big?: string;
      cover_medium?: string;
      cover?: string;
    }>;
  };

  return (data.data ?? [])
    .map((item) => item.cover_xl ?? item.cover_big ?? item.cover_medium ?? item.cover ?? "")
    .filter(Boolean);
}

async function readCoverCache(cacheKey: string) {
  return dbGet<CoverCacheRow>(
    `select cache_key, artist_name, album_title, source, cover_url, candidates_json, found, updated_at
     from album_cover_cache
     where cache_key = ?
     limit 1`,
    [cacheKey]
  );
}

async function writeCoverCache(args: {
  cacheKey: string;
  artist: string;
  album: string;
  source: CoverSource | null;
  coverUrl: string | null;
  candidates: string[];
  found: boolean;
}) {
  await dbRun(
    `insert into album_cover_cache (
      cache_key, artist_name, album_title, source, cover_url, candidates_json, found, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    on conflict(cache_key) do update set
      artist_name = excluded.artist_name,
      album_title = excluded.album_title,
      source = excluded.source,
      cover_url = excluded.cover_url,
      candidates_json = excluded.candidates_json,
      found = excluded.found,
      updated_at = datetime('now')`,
    [
      args.cacheKey,
      args.artist || null,
      args.album || null,
      args.source,
      args.coverUrl,
      JSON.stringify(args.candidates),
      args.found ? 1 : 0,
    ]
  );
}

function parseCandidatesJson(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item)).filter(Boolean);
    }
    return [] as string[];
  } catch {
    return [] as string[];
  }
}

function mapCacheRowToResponse(row: CoverCacheRow, cacheState: "hit" | "refresh"): CoverLookupResponse {
  const candidates = parseCandidatesJson(row.candidates_json);
  return {
    found: Boolean(row.found),
    source: (row.source as CoverSource | null) ?? null,
    coverUrl: row.cover_url,
    candidates,
    cache: cacheState,
  };
}

export async function lookupAlbumCover(options: {
  artist?: string | null;
  album?: string | null;
  term?: string | null;
  forceRefresh?: boolean;
}): Promise<CoverLookupResponse> {
  const artist = normalize(options.artist);
  const album = normalize(options.album);
  const term = normalize(options.term);
  const queryTerm = buildQueryTerm(artist, album, term);

  if (!queryTerm) {
    return {
      found: false,
      source: null,
      coverUrl: null,
      candidates: [],
      cache: "miss",
    };
  }

  const cacheKey = buildCacheKey(artist, album, queryTerm);
  const now = Date.now();

  if (!options.forceRefresh) {
    const cached = await readCoverCache(cacheKey);
    if (cached) {
      const ageMs = Math.max(0, now - parseDateMs(cached.updated_at));
      const ttl = cached.found ? HIT_TTL_MS : MISS_TTL_MS;
      if (ageMs <= ttl) {
        return mapCacheRowToResponse(cached, "hit");
      }
    }
  }

  const foundCandidates: Array<{ url: string; source: CoverSource }> = [];

  try {
    const itunesUrls = await fetchFromItunes(queryTerm);
    for (const url of itunesUrls) {
      foundCandidates.push({ url, source: "itunes" });
    }
  } catch (error) {
    console.error("iTunes cover fetch failed:", error);
  }

  try {
    const coverArtUrls = await fetchFromCoverArtArchive(artist, album, queryTerm);
    for (const url of coverArtUrls) {
      foundCandidates.push({ url, source: "coverartarchive" });
    }
  } catch (error) {
    console.error("Cover Art Archive fetch failed:", error);
  }

  try {
    const deezerUrls = await fetchFromDeezer(queryTerm);
    for (const url of deezerUrls) {
      foundCandidates.push({ url, source: "deezer" });
    }
  } catch (error) {
    console.error("Deezer cover fetch failed:", error);
  }

  const ranked = rankCandidateUrls(foundCandidates);
  const candidates = ranked.map((item) => item.url).slice(0, 8);
  const top = ranked[0] ?? null;

  const response: CoverLookupResponse = {
    found: Boolean(top),
    source: top?.source ?? null,
    coverUrl: top?.url ?? null,
    candidates,
    cache: "refresh",
  };

  await writeCoverCache({
    cacheKey,
    artist,
    album,
    source: response.source,
    coverUrl: response.coverUrl,
    candidates: response.candidates,
    found: response.found,
  });

  return response;
}
