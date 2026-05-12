import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { getLocalAuthUser } from "@/lib/local-auth";
import { dbAll, dbGet } from "@/lib/local-db";
import { resolveReleaseByArtistAndTitle } from "@/lib/musicbrainz";
import { cacheNotFound, cacheRelease, getCachedRelease } from "@/lib/release-cache";
import {
  createUserRecord,
  resolveArtistGeoWithCache,
  type ReleaseResolution,
} from "@/lib/record-ingest";
import {
  fetchAllSavedAlbums,
  fetchAlbumsFromPlaylist,
  loginWithPhone,
  parsePlaylistId,
  type NeteaseSavedAlbum,
} from "@/lib/netease";

type NeteaseImportRequest = {
  authType?: "phone" | "cookie" | "qr";

  // Phone login fields
  phone?: string;
  password?: string;
  captcha?: string;

  // Cookie login field (paste from browser)
  cookie?: string;

  // Import source
  importType: "saved" | "playlist";
  playlistUrl?: string;

  // Options
  limit?: number;

  // Preview mode: return album list without importing
  preview?: boolean;

  // Selected albums to import (dedup keys), empty = all new
  selected?: string[];
};

type AlbumPreviewItem = {
  dedupKey: string;
  artistName: string;
  albumTitle: string;
  savedAt: string;
  isNew: boolean;
};

type ExistingRow = {
  album_title: string;
  artist_name: string;
};

function buildDedupeKey(artistName: string, albumTitle: string) {
  return `${artistName.trim().toLowerCase()}||${albumTitle.trim().toLowerCase()}`;
}

function parseBody(body: unknown): NeteaseImportRequest {
  const payload = (body ?? {}) as NeteaseImportRequest;
  payload.authType = payload.authType ?? "phone";

  if (payload.authType === "cookie" || payload.authType === "qr") {
    if (!payload.cookie?.trim()) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "Cookie is required for cookie/qr auth.");
    }
  } else {
    if (!payload.phone || !payload.password) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "Phone and password are required.");
    }
  }

  if (payload.importType === "playlist" && !payload.playlistUrl) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Playlist URL is required for playlist import.");
  }

  if (payload.limit !== undefined) {
    if (!Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 200) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "limit must be an integer in [1, 200].");
    }
  }

  return payload;
}

// ── Shared auth logic ───────────────────────────────────────────────────────

async function authenticate(body: NeteaseImportRequest): Promise<string> {
  if (body.authType === "cookie" || body.authType === "qr") {
    return body.cookie!;
  }

  const loginResult = await loginWithPhone(body.phone!, body.password!, body.captcha);

  if (!loginResult.ok) {
    // Captcha needed — throw a special marker that the handler can recognise
    const err = new ApiHttpError(449, "VALIDATION_ERROR", loginResult.message);
    (err as { needCaptcha?: boolean }).needCaptcha = true;
    throw err;
  }

  return loginResult.cookie;
}

// ── Fetch albums from NetEase ───────────────────────────────────────────────

async function fetchAlbums(body: NeteaseImportRequest, cookie: string): Promise<NeteaseSavedAlbum[]> {
  const limit = body.limit ?? 50;

  if (body.importType === "playlist") {
    const playlistId = parsePlaylistId(body.playlistUrl!);
    return fetchAlbumsFromPlaylist(cookie, playlistId, limit);
  }

  const albums: NeteaseSavedAlbum[] = [];
  for await (const album of fetchAllSavedAlbums({ cookie, limit })) {
    albums.push(album);
  }
  return albums;
}

// ── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    const body = parseBody(await request.json().catch(() => ({})));

    // Step 1: Authenticate
    let cookie: string;
    try {
      cookie = await authenticate(body);
    } catch (authError) {
      // Forward captcha-needed signal
      if (authError instanceof ApiHttpError && (authError as { needCaptcha?: boolean }).needCaptcha) {
        return NextResponse.json(
          { needCaptcha: true, message: authError.message },
          { status: 200 }
        );
      }
      throw authError;
    }

    // Step 2: Fetch albums
    const albums = await fetchAlbums(body, cookie);

    if (albums.length === 0) {
      return NextResponse.json(
        {
          albums: [],
          summary: { fetched: 0, new: 0, alreadyExists: 0 },
        },
        { status: 200 }
      );
    }

    // Step 3: Dedup against existing records
    const existing = await dbAll<ExistingRow>(
      `select distinct album_title, artist_name
       from user_records
       where user_id = ?`,
      [user.id]
    );

    const existingKeySet = new Set(
      (existing ?? []).map((row) => buildDedupeKey(row.artist_name, row.album_title))
    );

    // Build preview items
    const allItems: AlbumPreviewItem[] = albums.map((a) => ({
      dedupKey: buildDedupeKey(a.artistName, a.title),
      artistName: a.artistName,
      albumTitle: a.title,
      savedAt: a.savedAt,
      isNew: !existingKeySet.has(buildDedupeKey(a.artistName, a.title)),
    }));

    // Step 4: Preview mode — return list without importing
    if (body.preview) {
      return NextResponse.json(
        {
          albums: allItems,
          summary: {
            fetched: allItems.length,
            new: allItems.filter((i) => i.isNew).length,
            alreadyExists: allItems.filter((i) => !i.isNew).length,
          },
        },
        { status: 200 }
      );
    }

    // Step 5: Import mode — filter by selected keys, then process
    const selectedSet = body.selected?.length
      ? new Set(body.selected.map((k) => k.trim().toLowerCase()))
      : null;

    const toImport = allItems.filter((item) => {
      if (!item.isNew) return false;
      if (selectedSet && !selectedSet.has(item.dedupKey)) return false;
      return true;
    });

    if (toImport.length === 0) {
      return NextResponse.json(
        {
          summary: { fetched: allItems.length, imported: 0, skipped: allItems.length, failed: 0 },
          failures: [],
        },
        { status: 200 }
      );
    }

    // Fetch user's MB token for authenticated MusicBrainz access
    const userRow = await dbGet<{ mb_token: string | null }>(
      `select mb_token from users where id = ? limit 1`,
      [user.id]
    );
    const mbAuthToken = userRow?.mb_token ?? null;

    // Step 6: Process each album through MusicBrainz
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Array<{ artistName: string; albumTitle: string; reason: string }> = [];

    for (const item of toImport) {
      try {
        const cached = await getCachedRelease(item.artistName, item.albumTitle);

        let release: ReleaseResolution;
        if (cached === null) {
          release = await resolveReleaseByArtistAndTitle(item.artistName, item.albumTitle, mbAuthToken);
          await cacheRelease(item.artistName, item.albumTitle, release);
        } else if ("notFound" in cached) {
          throw new Error("No matching release found in MusicBrainz (cached).");
        } else {
          release = cached;
        }

        const artistGeo = await resolveArtistGeoWithCache(release.artist.id, mbAuthToken);

        // Fix "Unknown" artist name from rate-limit fallback
        if ((!artistGeo.artistName || artistGeo.artistName === "Unknown") && release.artist.name) {
          artistGeo.artistName = release.artist.name;
        }

        await createUserRecord({
          userId: user.id,
          release,
          artistGeo,
          listenAt: item.savedAt,
          score: 0,
          personalTags: ["netease", "auto-import"],
        });

        imported += 1;
      } catch (trackError) {
        failed += 1;
        const reason = trackError instanceof Error ? trackError.message : "Unknown import error";
        failures.push({
          artistName: item.artistName,
          albumTitle: item.albumTitle,
          reason,
        });
      }
    }

    skipped = toImport.length - imported - failed;

    return NextResponse.json(
      {
        summary: {
          fetched: allItems.length,
          imported,
          skipped,
          failed,
        },
        failures: failures.slice(0, 20),
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
