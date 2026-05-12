import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { getLocalAuthUser } from "@/lib/local-auth";
import { dbAll, dbGet } from "@/lib/local-db";
import {
  resolveReleaseByArtistAndTitle,
  resolveReleaseById,
  searchReleasesByFields,
} from "@/lib/musicbrainz";
import { cacheRelease, getCachedRelease } from "@/lib/release-cache";
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

  // Selected albums to import.
  // Backward-compatible with old string[] payload.
  selected?: Array<string | { dedupKey: string; releaseId?: string | null }>;
};

type SelectedItem = {
  dedupKey: string;
  releaseId: string | null;
};

type MatchCandidate = {
  releaseId: string;
  albumTitle: string;
  artistName: string;
  releaseDate: string | null;
  releaseYear: number | null;
};

type AlbumPreviewItem = {
  dedupKey: string;
  artistName: string;
  albumTitle: string;
  savedAt: string;
  isNew: boolean;
  mbCandidates: MatchCandidate[];
  suggestedReleaseId: string | null;
  hasCandidate: boolean;
};

type ExistingRow = {
  album_title: string;
  artist_name: string;
};

function buildDedupeKey(artistName: string, albumTitle: string) {
  return `${artistName.trim().toLowerCase()}||${albumTitle.trim().toLowerCase()}`;
}

function parseSelectedItems(payload: NeteaseImportRequest["selected"]): SelectedItem[] {
  if (!Array.isArray(payload)) return [];

  const parsed: SelectedItem[] = [];
  for (const item of payload) {
    if (typeof item === "string") {
      const dedupKey = item.trim().toLowerCase();
      if (dedupKey) {
        parsed.push({ dedupKey, releaseId: null });
      }
      continue;
    }

    if (!item || typeof item !== "object") continue;
    const dedupKey = String(item.dedupKey ?? "").trim().toLowerCase();
    if (!dedupKey) continue;

    const releaseIdRaw = item.releaseId;
    const releaseId =
      typeof releaseIdRaw === "string" && releaseIdRaw.trim().length > 0
        ? releaseIdRaw.trim()
        : null;

    parsed.push({ dedupKey, releaseId });
  }

  return parsed;
}

async function buildPreviewItems(
  albums: NeteaseSavedAlbum[],
  existingKeySet: Set<string>,
  mbAuthToken: string | null
): Promise<AlbumPreviewItem[]> {
  const baseItems: AlbumPreviewItem[] = albums.map((a) => {
    const dedupKey = buildDedupeKey(a.artistName, a.title);
    return {
      dedupKey,
      artistName: a.artistName,
      albumTitle: a.title,
      savedAt: a.savedAt,
      isNew: !existingKeySet.has(dedupKey),
      mbCandidates: [],
      suggestedReleaseId: null,
      hasCandidate: false,
    };
  });

  const newItems = baseItems.filter((item) => item.isNew);
  for (const item of newItems) {
    try {
      const candidates = await searchReleasesByFields(
        {
          artist: item.artistName,
          release: item.albumTitle,
        },
        5,
        mbAuthToken
      );

      item.mbCandidates = candidates.map((candidate) => ({
        releaseId: candidate.id,
        albumTitle: candidate.title,
        artistName: candidate.artist?.name ?? item.artistName,
        releaseDate: candidate.date,
        releaseYear: candidate.year,
      }));
      item.suggestedReleaseId = item.mbCandidates[0]?.releaseId ?? null;
      item.hasCandidate = item.mbCandidates.length > 0;
    } catch {
      item.mbCandidates = [];
      item.suggestedReleaseId = null;
      item.hasCandidate = false;
    }
  }

  return baseItems;
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

    // Step 3: Fetch user's MB token for authenticated MusicBrainz access
    const userRow = await dbGet<{ mb_token: string | null }>(
      `select mb_token from users where id = ? limit 1`,
      [user.id]
    );
    const mbAuthToken = userRow?.mb_token ?? null;

    // Step 4: Dedup against existing records
    const existing = await dbAll<ExistingRow>(
      `select distinct album_title, artist_name
       from user_records
       where user_id = ?`,
      [user.id]
    );

    const existingKeySet = new Set(
      (existing ?? []).map((row) => buildDedupeKey(row.artist_name, row.album_title))
    );

    // Build preview items with candidate MB matches for manual confirmation.
    const allItems = await buildPreviewItems(albums, existingKeySet, mbAuthToken);

    // Step 5: Preview mode — return list without importing
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

    // Step 6: Import mode — filter by selected keys, then process
    const selectedItems = parseSelectedItems(body.selected);
    const selectedSet = selectedItems.length
      ? new Set(selectedItems.map((item) => item.dedupKey))
      : null;
    const selectedReleaseMap = new Map(selectedItems.map((item) => [item.dedupKey, item.releaseId]));

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

    // Step 7: Process each album through MusicBrainz
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Array<{ artistName: string; albumTitle: string; reason: string }> = [];

    for (const item of toImport) {
      try {
        let release: ReleaseResolution;
        const selectedReleaseId = selectedReleaseMap.get(item.dedupKey) ?? null;

        if (selectedReleaseId) {
          release = await resolveReleaseById(selectedReleaseId, mbAuthToken);
          await cacheRelease(item.artistName, item.albumTitle, release);
        } else {
          const cached = await getCachedRelease(item.artistName, item.albumTitle);
          if (cached === null) {
            release = await resolveReleaseByArtistAndTitle(item.artistName, item.albumTitle, mbAuthToken);
            await cacheRelease(item.artistName, item.albumTitle, release);
          } else if ("notFound" in cached) {
            throw new Error("No matching release found in MusicBrainz (cached). Please select a candidate manually.");
          } else {
            release = cached;
          }
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
