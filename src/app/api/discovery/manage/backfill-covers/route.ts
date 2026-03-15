import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { lookupAlbumCover } from "@/lib/album-cover";
import { getLocalAuthUser } from "@/lib/local-auth";
import { dbAll } from "@/lib/local-db";

type BackfillRequest = {
  limit?: number;
  forceRefresh?: boolean;
};

type DiscoveryAlbumRow = {
  artist_name: string;
  album_title: string;
};

function getAdminEmails() {
  return (process.env.DISCOVERY_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function requireAdmin(email: string | null | undefined) {
  const admins = getAdminEmails();
  if (admins.length === 0) {
    return;
  }

  if (!email || !admins.includes(email.toLowerCase())) {
    throw new ApiHttpError(403, "UNAUTHORIZED", "Only discovery admins can backfill covers.");
  }
}

function parseBody(body: unknown) {
  const payload = (body ?? {}) as BackfillRequest;
  const limit = payload.limit ?? 120;

  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "limit must be an integer in [1, 1000].");
  }

  return {
    limit,
    forceRefresh: Boolean(payload.forceRefresh),
  };
}

export async function POST(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    requireAdmin(user.email);

    const { limit, forceRefresh } = parseBody(await request.json().catch(() => ({})));

    const rows = await dbAll<DiscoveryAlbumRow>(
      `select artist_name, album_title
       from discovery_pool
       where enabled = 1
       group by artist_name, album_title
       order by max(created_at) desc
       limit ?`,
      [limit]
    );

    let processed = 0;
    let found = 0;
    let missing = 0;
    let refreshed = 0;
    let cacheHits = 0;

    const failures: Array<{ artist: string; album: string; reason: string }> = [];

    for (const row of rows) {
      processed += 1;

      try {
        const result = await lookupAlbumCover({
          artist: row.artist_name,
          album: row.album_title,
          forceRefresh,
        });

        if (result.cache === "hit") {
          cacheHits += 1;
        }
        if (result.cache === "refresh") {
          refreshed += 1;
        }

        if (result.found) {
          found += 1;
        } else {
          missing += 1;
        }
      } catch (error) {
        missing += 1;
        failures.push({
          artist: row.artist_name,
          album: row.album_title,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json(
      {
        summary: {
          processed,
          found,
          missing,
          cacheHits,
          refreshed,
          forceRefresh,
        },
        failures: failures.slice(0, 20),
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
