import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { getLocalAuthUser } from "@/lib/local-auth";
import { dbGet, dbRun } from "@/lib/local-db";
import { mapRowToUserRecord, type UserRecordRow } from "@/lib/record-mapper";
import { createUserRecord } from "@/lib/record-ingest";

type MarkHeardRequest = {
  albumTitle?: string;
  artistName?: string;
  releaseYear?: number;
  countryCode?: string;
  countryName?: string;
  cityName?: string;
  coordinates?: {
    lng?: number;
    lat?: number;
  };
};

function stableArtistId(artistName: string, countryCode: string) {
  const normalized = `${artistName.trim().toLowerCase()}::${countryCode
    .trim()
    .toLowerCase()}`;
  return `manual-${Buffer.from(normalized).toString("hex").slice(0, 20)}`;
}

function parseBody(payload: unknown) {
  const body = payload as MarkHeardRequest;

  if (!body?.albumTitle?.trim()) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "albumTitle is required.");
  }
  if (!body?.artistName?.trim()) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "artistName is required.");
  }
  if (!body?.countryCode?.trim()) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "countryCode is required.");
  }
  if (!body?.countryName?.trim()) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "countryName is required.");
  }

  return {
    albumTitle: body.albumTitle.trim(),
    artistName: body.artistName.trim(),
    releaseYear: body.releaseYear ?? null,
    countryCode: body.countryCode.trim().toUpperCase(),
    countryName: body.countryName.trim(),
    cityName: body.cityName?.trim() || null,
    coordinates:
      typeof body.coordinates?.lng === "number" &&
      typeof body.coordinates?.lat === "number"
        ? { lng: body.coordinates.lng, lat: body.coordinates.lat }
        : null,
  };
}

export async function POST(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    const bodyRaw = await request.json();
    const body = parseBody(bodyRaw);

    // Check for existing record to ensure idempotency
    const existingRecord = await dbGet<UserRecordRow>(
      `select
        id, album_mbid, album_title, release_date, release_year,
        listen_at, score, personal_tags, artist_id, artist_name,
        country_code, country_name, city_name, lng, lat
       from user_records
       where user_id = ?
         and lower(trim(album_title)) = lower(trim(?))
         and lower(trim(artist_name)) = lower(trim(?))
       limit 1`,
      [user.id, body.albumTitle, body.artistName]
    );

    if (existingRecord) {
      return NextResponse.json(mapRowToUserRecord(existingRecord), { status: 200 });
    }

    const artistId = stableArtistId(body.artistName, body.countryCode);
    const nowIso = new Date().toISOString();

    const record = await createUserRecord({
      userId: user.id,
      release: {
        id: null,
        title: body.albumTitle,
        date: body.releaseYear ? `${body.releaseYear}-01-01` : null,
        year: body.releaseYear,
        artist: {
          id: artistId,
          name: body.artistName,
        },
      },
      artistGeo: {
        artistId,
        artistName: body.artistName,
        countryCode: body.countryCode,
        countryName: body.countryName,
        cityName: body.cityName,
      },
      listenAt: nowIso,
      score: 0,
      personalTags: [],
      coordinatesOverride: body.coordinates,
    });

    return NextResponse.json(record, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    const body = await request.json();

    if (!body?.albumTitle?.trim() || !body?.artistName?.trim()) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "albumTitle and artistName are required.");
    }

    await dbRun(
      `delete from user_records
       where user_id = ?
         and lower(trim(album_title)) = lower(trim(?))
         and lower(trim(artist_name)) = lower(trim(?))`,
      [user.id, body.albumTitle.trim(), body.artistName.trim()]
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
