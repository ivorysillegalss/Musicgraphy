import { ApiHttpError } from "@/lib/api-error";

export type NeteaseSavedAlbum = {
  albumId: number;
  title: string;
  artistName: string;
  coverUrl: string | null;
  savedAt: string;
  publishTime: string | null;
};

function getBaseUrl(): string {
  return (process.env.NETEASE_API_BASE_URL || "http://localhost:3001").replace(
    /\/+$/,
    ""
  );
}

function buildUrl(path: string, params?: Record<string, string | number>): string {
  const base = `${getBaseUrl()}${path}`;
  if (!params) return base;
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

/** Known Set-Cookie attribute names to exclude from cookie strings. */
const COOKIE_ATTRS = new Set([
  "max-age", "expires", "path", "domain", "secure", "httponly", "samesite",
]);

function sanitizeCookie(raw: string): string {
  const seen = new Map<string, string>();
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (COOKIE_ATTRS.has(key)) continue;
    // Reconstruct with original key casing for the map
    seen.set(part.slice(0, idx).trim(), val);
  }
  return [...seen.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Low-level call to the api-enhanced server.
 * Returns the full JSON body without code validation.
 */
async function neteaseFetch<T extends Record<string, unknown>>(
  path: string,
  params?: Record<string, string | number>,
  cookie?: string,
): Promise<T & { code: number; cookie?: string }> {
  const cleanCookie = cookie ? sanitizeCookie(cookie) : undefined;
  const url = buildUrl(path, params);
  const headers: Record<string, string> = {};
  if (cleanCookie) headers.Cookie = cleanCookie;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiHttpError(
      502,
      "EXTERNAL_API_ERROR",
      `Cannot connect to NetEase API at ${getBaseUrl()}. Is the server running?`
    );
  }

  const body = (await res.json().catch(() => ({}))) as T & {
    code: number;
    message?: string;
    cookie?: string;
  };

  return body;
}

/**
 * High-level POST with code === 200 validation.
 * Used for album/playlist endpoints after authentication.
 */
async function neteasePost<T extends Record<string, unknown>>(
  path: string,
  cookie: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const body = await neteaseFetch<T>(path, params, cookie);

  if (body.code === 301) {
    throw new ApiHttpError(502, "EXTERNAL_API_ERROR", "NetEase session expired.");
  }

  if (body.code !== 200) {
    throw new ApiHttpError(
      502,
      "EXTERNAL_API_ERROR",
      `NetEase API error (code=${body.code}): ${(body as { message?: string }).message ?? "unknown"}`
    );
  }

  return body;
}

// ── Login: Phone ──────────────────────────────────────────────────────────

export type LoginResult =
  | { ok: true; cookie: string }
  | { ok: false; needCaptcha: true; message: string };

/**
 * Login with phone + password + optional captcha via api-enhanced.
 * Matches login_cellphone.js response format:
 *   { code: 200, account, profile, cookie: "MUSIC_U=...; __csrf=..." }
 */
export async function loginWithPhone(
  phone: string,
  password: string,
  captcha?: string,
): Promise<LoginResult> {
  const params: Record<string, string | number> = {
    phone,
    password,
    countrycode: "86",
  };
  if (captcha) params.captcha = captcha;

  const body = await neteaseFetch<Record<string, unknown>>(
    "/login/cellphone",
    params,
  );

  // code 502 = need captcha
  if (body.code === 502) {
    return {
      ok: false,
      needCaptcha: true,
      message: (body as { message?: string }).message ?? "Verification code sent to your phone.",
    };
  }

  if (body.code === 200 && body.cookie) {
    return { ok: true, cookie: body.cookie };
  }

  throw new ApiHttpError(
    502,
    "EXTERNAL_API_ERROR",
    `Login failed (code=${body.code}): ${(body as { message?: string }).message ?? "check credentials"}`
  );
}

// ── Login: QR Code ────────────────────────────────────────────────────────

export type QRKeyResult = { unikey: string };
export type QRMeta = { qrurl: string; qrimg: string };

/**
 * Step 1: Get a QR login key from api-enhanced.
 * Response: { data: { unikey: "xxx", code: 200 }, code: 200 }
 */
export async function getQRKey(): Promise<QRKeyResult> {
  const body = await neteaseFetch<{ data?: { unikey?: string } }>("/login/qr/key");
  const unikey = body.data?.unikey;
  if (!unikey) {
    throw new ApiHttpError(502, "EXTERNAL_API_ERROR", "Failed to get QR key from NetEase.");
  }
  return { unikey };
}

/**
 * Step 2: Create QR code image from the key.
 * Response: { code: 200, data: { qrurl, qrimg } }
 */
export async function createQRImage(key: string): Promise<QRMeta> {
  const body = await neteaseFetch<{ data?: { qrurl?: string; qrimg?: string } }>(
    "/login/qr/create",
    { key, qrimg: 1 },
  );
  if (!body.data?.qrimg) {
    throw new ApiHttpError(502, "EXTERNAL_API_ERROR", "Failed to create QR code image.");
  }
  return { qrurl: body.data.qrurl ?? "", qrimg: body.data.qrimg };
}

/** QR check status codes from api-enhanced */
export const QR_STATUS = {
  EXPIRED: 800,
  WAITING: 801,
  SCANNED: 802,
  AUTHORIZED: 803,
} as const;

export type QRCheckResult =
  | { status: typeof QR_STATUS.WAITING | typeof QR_STATUS.SCANNED }
  | { status: typeof QR_STATUS.AUTHORIZED; cookie: string }
  | { status: typeof QR_STATUS.EXPIRED };

/**
 * Step 3: Check QR login status.
 * Codes: 800=expired, 801=waiting, 802=scanned, 803=authorized(+cookie)
 * Response on 803: { code: 803, cookie: "MUSIC_U=...; __csrf=..." }
 */
export async function checkQRStatus(key: string): Promise<QRCheckResult> {
  const body = await neteaseFetch<{ cookie?: string }>("/login/qr/check", { key });

  if (body.code === 803 && body.cookie) {
    return { status: QR_STATUS.AUTHORIZED, cookie: body.cookie };
  }

  if (body.code === 800) {
    return { status: QR_STATUS.EXPIRED };
  }

  if (body.code === 802) {
    return { status: QR_STATUS.SCANNED };
  }

  // 801 or any other code → waiting
  return { status: QR_STATUS.WAITING };
}

// ── Saved Albums (收藏专辑) ────────────────────────────────────────────────

export async function fetchSavedAlbums(params: {
  cookie: string;
  limit: number;
  offset: number;
}): Promise<{ items: NeteaseSavedAlbum[]; total: number; hasMore: boolean }> {
  const raw = await neteasePost<Record<string, unknown>>(
    "/album/sublist",
    params.cookie,
    { limit: params.limit, offset: params.offset }
  );

  // Normalise data into an array of items
  const dataField = raw.data;
  let rawItems: Record<string, unknown>[] = [];

  if (Array.isArray(dataField)) {
    rawItems = dataField as Record<string, unknown>[];
  } else if (dataField && typeof dataField === "object") {
    const obj = dataField as Record<string, unknown>;
    // Try common nested paths
    const nested = (obj.data || obj.list || obj.albums || obj.items) as unknown[];
    if (Array.isArray(nested)) {
      rawItems = nested as Record<string, unknown>[];
    } else {
      console.warn("[netease] album/sublist data is object but no recognised array field found, keys:", Object.keys(obj));
    }
  } else if (dataField === undefined || dataField === null) {
    console.warn("[netease] album/sublist returned no data field, top keys:", Object.keys(raw));
  }

  let total: number;
  if (typeof raw.count === "number") {
    total = raw.count;
  } else if (raw.total && typeof raw.total === "number") {
    total = raw.total as number;
  } else {
    total = rawItems.length;
  }

  const items: NeteaseSavedAlbum[] = [];

  for (const item of rawItems) {
    // Check for album sub-object (standard NetEase format)
    const album = item.album as Record<string, unknown> | undefined;

    if (album && typeof album === "object" && album.id && album.name) {
      // Format: { album: { id, name, picUrl, artist: { name }, publishTime }, time }
      items.push({
        albumId: Number(album.id),
        title: String(album.name),
        artistName:
          (album.artist as Record<string, unknown> | undefined)?.name as string ?? "Unknown",
        coverUrl: (album.picUrl as string) ?? null,
        savedAt: new Date(Number(item.time) || Date.now()).toISOString(),
        publishTime: album.publishTime
          ? new Date(Number(album.publishTime)).toISOString()
          : null,
      });
      continue;
    }

    // Check for flat format where album fields sit at item top level
    if (item.id && item.name) {
      items.push({
        albumId: Number(item.id),
        title: String(item.name),
        artistName:
          ((item.artist as Record<string, unknown> | undefined)?.name as string) ?? "Unknown",
        coverUrl: (item.picUrl as string) ?? null,
        savedAt: new Date(Number(item.time) || Number(item.subTime) || Date.now()).toISOString(),
        publishTime: item.publishTime
          ? new Date(Number(item.publishTime)).toISOString()
          : null,
      });
      continue;
    }

    // Non-album item (artist subscription, playlist, etc.) — skip
    if (item.artists || item.subTime) {
      const artistNames = Array.isArray(item.artists)
        ? (item.artists as Record<string, unknown>[])
            .map((a: Record<string, unknown>) => String(a.name ?? ""))
            .filter(Boolean)
            .join(", ")
        : "";
      console.warn(
        "[netease] Skipping non-album sublist item:",
        artistNames ? `artist(s): ${artistNames}` : JSON.stringify(item).slice(0, 180)
      );
    }
  }

  return { items, total, hasMore: params.offset + items.length < total };
}

export async function* fetchAllSavedAlbums(params: {
  cookie: string;
  limit?: number;
}): AsyncGenerator<NeteaseSavedAlbum> {
  const pageSize = Math.min(params.limit ?? 50, 100);
  let offset = 0;
  let totalFetched = 0;
  const maxLimit = params.limit ?? Infinity;

  while (totalFetched < maxLimit) {
    const remaining =
      maxLimit === Infinity
        ? pageSize
        : Math.min(pageSize, maxLimit - totalFetched);
    if (remaining <= 0) break;

    const { items, hasMore } = await fetchSavedAlbums({
      cookie: params.cookie,
      limit: remaining,
      offset,
    });

    for (const item of items) {
      if (totalFetched >= maxLimit) break;
      yield item;
      totalFetched++;
    }

    if (!hasMore || items.length === 0) break;
    offset += items.length;
    await new Promise((r) => setTimeout(r, 200));
  }
}

// ── Playlist Import (歌单导入) ─────────────────────────────────────────────

type PlaylistTrackItem = {
  id: number;
  name: string;
  al: {
    id: number;
    name: string;
    picUrl: string | null;
  };
  ar: Array<{ id: number; name: string }>;
};

type PlaylistTrackAllResponse = {
  code: number;
  songs: PlaylistTrackItem[];
};

export function parsePlaylistId(input: string): number {
  const trimmed = input.trim();

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  const match = trimmed.match(/[?&]id=(\d+)/);
  if (match) {
    return Number(match[1]);
  }

  throw new ApiHttpError(
    400,
    "VALIDATION_ERROR",
    "Cannot parse playlist ID from the provided URL."
  );
}

export async function fetchAlbumsFromPlaylist(
  cookie: string,
  playlistId: number,
  limit?: number,
): Promise<NeteaseSavedAlbum[]> {
  const raw = await neteasePost<PlaylistTrackAllResponse>(
    "/playlist/track/all",
    cookie,
    { id: playlistId, limit: limit ?? 1000 }
  );

  const seen = new Set<number>();
  const albums: NeteaseSavedAlbum[] = [];

  for (const track of raw.songs ?? []) {
    if (!track.al || seen.has(track.al.id)) continue;
    seen.add(track.al.id);

    albums.push({
      albumId: track.al.id,
      title: track.al.name,
      artistName: track.ar?.[0]?.name ?? "Unknown",
      coverUrl: track.al.picUrl ?? null,
      savedAt: new Date().toISOString(),
      publishTime: null,
    });
  }

  return albums;
}
