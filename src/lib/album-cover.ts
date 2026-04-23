import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { dbAll, dbGet, dbRun } from "@/lib/local-db";
import { searchReleasesByFields } from "@/lib/musicbrainz";
import sharp from "sharp";

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
const MISS_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const configuredCoverDir = process.env.COVER_CACHE_DIR?.trim();
const COVER_DIR = configuredCoverDir
  ? path.isAbsolute(configuredCoverDir)
    ? configuredCoverDir
    : path.join(process.cwd(), configuredCoverDir)
  : path.join(process.cwd(), "data", "covers");
const PUBLIC_COVER_DIR = path.join(process.cwd(), "public", "covers");
const STALE_COVER_DAYS = 90;
const CLEANUP_MAX_ROWS = 300;
const CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 6;

let cleanupPromise: Promise<void> | null = null;
let lastCleanupAt = 0;

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isLocalCoverUrl(url: string) {
  return url.startsWith("/covers/");
}

function getLocalCoverPath(url: string) {
  const relative = url.replace(/^\/covers\//, "");
  return path.join(COVER_DIR, relative);
}

function getPublicCoverPath(url: string) {
  const relative = url.replace(/^\/covers\//, "");
  return path.join(PUBLIC_COVER_DIR, relative);
}

function buildCoverFileName(cacheKey: string) {
  const digest = createHash("sha1").update(cacheKey).digest("hex");
  return `${digest}.webp`;
}

async function persistCoverToLocal(cacheKey: string, remoteUrl: string) {
  if (!remoteUrl || isLocalCoverUrl(remoteUrl)) {
    return remoteUrl;
  }

  await fs.mkdir(COVER_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_COVER_DIR, { recursive: true });

  const fileName = buildCoverFileName(cacheKey);
  const localUrl = `/covers/${fileName}`;
  const targetPath = path.join(COVER_DIR, fileName);
  const publicPath = path.join(PUBLIC_COVER_DIR, fileName);

  if (await fileExists(targetPath)) {
    if (!(await fileExists(publicPath))) {
      try {
        await fs.copyFile(targetPath, publicPath);
      } catch {
        // Keep storage copy even if public mirror fails.
      }
    }
    return localUrl;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(remoteUrl, {
      headers: { Accept: "image/*" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return remoteUrl;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return remoteUrl;
    }

    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.length === 0) {
      return remoteUrl;
    }

    const optimized = await sharp(raw)
      .rotate()
      .resize(420, 420, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();

    const tempPath = `${targetPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.writeFile(tempPath, optimized);
    await fs.rename(tempPath, targetPath);

    if (targetPath !== publicPath) {
      try {
        await fs.copyFile(targetPath, publicPath);
      } catch {
        // Keep storage copy even if public mirror fails.
      }
    }

    return localUrl;
  } catch {
    return remoteUrl;
  } finally {
    clearTimeout(timeoutId);
  }
}

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
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const coverRes = await fetch(`https://coverartarchive.org/release/${release.id}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 3600 },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
    } catch (e) {
      console.warn(`[CoverArtArchive] Fetch failed for release ${release.id}:`, e);
      continue;
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

type StaleCoverRow = {
  cache_key: string;
  cover_url: string | null;
};

async function cleanupStaleCovers() {
  const staleRows = await dbGet<{ total: number }>(
    `select count(*) as total
     from album_cover_cache
     where cover_url like '/covers/%'
       and updated_at < datetime('now', ?)` ,
    [`-${STALE_COVER_DAYS} day`]
  );

  if (!staleRows || Number(staleRows.total) === 0) {
    return;
  }

  const rows = await dbAll<StaleCoverRow>(
    `select cache_key, cover_url
     from album_cover_cache
     where cover_url like '/covers/%'
       and updated_at < datetime('now', ?)
     order by updated_at asc
     limit ?`,
    [`-${STALE_COVER_DAYS} day`, CLEANUP_MAX_ROWS]
  );

  for (const row of rows) {
    if (row.cover_url && isLocalCoverUrl(row.cover_url)) {
      const localPath = getLocalCoverPath(row.cover_url);
      const publicPath = getPublicCoverPath(row.cover_url);
      try {
        await fs.unlink(localPath);
      } catch {
        // Ignore file system race or already deleted files.
      }
      if (publicPath !== localPath) {
        try {
          await fs.unlink(publicPath);
        } catch {
          // Ignore file system race or already deleted files.
        }
      }
    }

    await dbRun(`delete from album_cover_cache where cache_key = ?`, [row.cache_key]);
  }
}

function maybeTriggerCleanup() {
  const now = Date.now();
  if (cleanupPromise) {
    return;
  }
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }
  // Probabilistic trigger avoids adding latency to every request.
  if (Math.random() > 0.05) {
    return;
  }

  lastCleanupAt = now;
  cleanupPromise = cleanupStaleCovers()
    .catch((error) => {
      console.warn("Cover cleanup skipped:", error);
    })
    .finally(() => {
      cleanupPromise = null;
    });
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
  maybeTriggerCleanup();

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
        if (cached.cover_url && isLocalCoverUrl(cached.cover_url)) {
          const localFilePath = getLocalCoverPath(cached.cover_url);
          if (!(await fileExists(localFilePath))) {
            // Local cached image was removed from disk, continue to refresh.
          } else {
            return mapCacheRowToResponse(cached, "hit");
          }
        } else {
        return mapCacheRowToResponse(cached, "hit");
        }
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

  // If iTunes already found a good quality cover, we can skip CoverArtArchive and Deezer
  // which might be significantly slower or rate-limited.
  if (foundCandidates.length === 0) {
    try {
      const coverArtUrls = await fetchFromCoverArtArchive(artist, album, queryTerm);
      for (const url of coverArtUrls) {
        foundCandidates.push({ url, source: "coverartarchive" });
      }
    } catch (error) {
      console.error("Cover Art Archive fetch failed:", error);
    }
  }

  if (foundCandidates.length === 0) {
    try {
      const deezerUrls = await fetchFromDeezer(queryTerm);
      for (const url of deezerUrls) {
        foundCandidates.push({ url, source: "deezer" });
      }
    } catch (error) {
      console.error("Deezer cover fetch failed:", error);
    }
  }

  const ranked = rankCandidateUrls(foundCandidates);
  const remoteCandidates = ranked.map((item) => item.url).slice(0, 8);
  const top = ranked[0] ?? null;

  let resolvedCoverUrl = top?.url ?? null;
  if (top?.url) {
    resolvedCoverUrl = await persistCoverToLocal(cacheKey, top.url);
  }

  const candidates = resolvedCoverUrl
    ? [resolvedCoverUrl, ...remoteCandidates.filter((url) => url !== resolvedCoverUrl)].slice(0, 8)
    : remoteCandidates;

  const response: CoverLookupResponse = {
    found: Boolean(top),
    source: top?.source ?? null,
    coverUrl: resolvedCoverUrl,
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
