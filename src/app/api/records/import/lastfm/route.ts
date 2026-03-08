import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { fetchRecentTracks } from "@/lib/lastfm";
import { getLocalAuthUser } from "@/lib/local-auth";
import { dbAll, dbGet } from "@/lib/local-db";
import { resolveReleaseByArtistAndTitle } from "@/lib/musicbrainz";
import {
  createUserRecord,
  resolveArtistGeoWithCache,
  type ReleaseResolution,
} from "@/lib/record-ingest";

type LastFmImportRequest = {
  username?: string;
  limit?: number;
  score?: number;
  fromUnix?: number;
};

type ExistingRow = {
  listen_at: string;
  artist_name: string;
  album_title: string;
};

function parseBody(body: unknown): LastFmImportRequest {
  const payload = (body ?? {}) as LastFmImportRequest;

  if (payload.limit !== undefined) {
    if (!Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 100) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "limit must be an integer in [1, 100].");
    }
  }

  if (payload.score !== undefined) {
    if (!Number.isInteger(payload.score) || payload.score < 1 || payload.score > 10) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "score must be an integer in [1, 10].");
    }
  }

  if (payload.fromUnix !== undefined) {
    if (!Number.isInteger(payload.fromUnix) || payload.fromUnix <= 0) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "fromUnix must be a positive integer.");
    }
  }

  return payload;
}

function buildDedupeKey(listenAt: string, artistName: string, albumTitle: string) {
  return `${listenAt}__${artistName.trim().toLowerCase()}__${albumTitle
    .trim()
    .toLowerCase()}`;
}

export async function POST(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    const body = parseBody(await request.json().catch(() => ({})));

    const username = body.username?.trim() || process.env.LASTFM_USERNAME;
    if (!username) {
      throw new ApiHttpError(
        400,
        "VALIDATION_ERROR",
        "Missing username: provide body.username or LASTFM_USERNAME env."
      );
    }

    const limit = body.limit ?? 30;
    const score = body.score ?? 7;

    let fromUnix = body.fromUnix;
    if (!fromUnix) {
      const latest = await dbGet<{ listen_at: string }>(
        `select listen_at
         from user_records
         where user_id = ?
           and personal_tags like '%lastfm%'
         order by listen_at desc
         limit 1`,
        [user.id]
      );

      if (latest?.listen_at) {
        fromUnix = Math.floor(new Date(latest.listen_at).getTime() / 1000);
      }
    }

    const tracks = await fetchRecentTracks({ username, limit, fromUnix });
    if (tracks.length === 0) {
      return NextResponse.json(
        {
          summary: {
            username,
            fetched: 0,
            imported: 0,
            skipped: 0,
            failed: 0,
          },
          failures: [],
        },
        { status: 200 }
      );
    }

    const listenTimestamps = tracks.map((track) => track.listenAtIso).sort();
    const minListenAt = listenTimestamps[0];
    const maxListenAt = listenTimestamps[listenTimestamps.length - 1];

    const existing = await dbAll<ExistingRow>(
      `select listen_at, artist_name, album_title
       from user_records
       where user_id = ?
         and listen_at >= ?
         and listen_at <= ?`,
      [user.id, minListenAt, maxListenAt]
    );

    const existingKeySet = new Set(
      (existing ?? []).map((row) =>
        buildDedupeKey(row.listen_at, row.artist_name, row.album_title)
      )
    );

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Array<{ artistName: string; releaseTitle: string; reason: string }> = [];

    for (const track of tracks) {
      const dedupeKey = buildDedupeKey(
        track.listenAtIso,
        track.artistName,
        track.releaseTitle
      );

      if (existingKeySet.has(dedupeKey)) {
        skipped += 1;
        continue;
      }

      try {
        const release: ReleaseResolution = await resolveReleaseByArtistAndTitle(
          track.artistName,
          track.releaseTitle,
          null
        );
        const artistGeo = await resolveArtistGeoWithCache(release.artist.id, null);

        await createUserRecord({
          userId: user.id,
          release,
          artistGeo,
          listenAt: track.listenAtIso,
          score,
          personalTags: ["lastfm", "auto-import"],
        });

        existingKeySet.add(dedupeKey);
        imported += 1;
      } catch (trackError) {
        failed += 1;
        const reason =
          trackError instanceof Error ? trackError.message : "Unknown import error";
        failures.push({
          artistName: track.artistName,
          releaseTitle: track.releaseTitle,
          reason,
        });
      }
    }

    return NextResponse.json(
      {
        summary: {
          username,
          fetched: tracks.length,
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
