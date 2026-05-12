import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { getLocalAuthUser } from "@/lib/local-auth";
import { dbAll, dbGet, dbRun } from "@/lib/local-db";
import { mapRowToUserRecord, type UserRecordRow } from "@/lib/record-mapper";
import type { UserRecord } from "@/lib/types";

function getRecordYear(record: UserRecord): number {
  if (record.releaseYear) {
    return record.releaseYear;
  }

  return new Date(record.listenAt).getFullYear();
}

export async function GET(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    const url = new URL(request.url);
    const startYear = url.searchParams.get("startYear");
    const endYear = url.searchParams.get("endYear");

    const data = await dbAll<UserRecordRow>(
      `select
        id, album_mbid, album_title, release_date, release_year,
        listen_at, score, personal_tags, artist_id, artist_name,
        country_code, country_name, city_name, lng, lat
       from user_records
       where user_id = ?
       order by listen_at desc`,
      [user.id]
    );

    const mapped = (data ?? []).map(mapRowToUserRecord);
    const hasYearFilter = Boolean(startYear || endYear);

    if (!hasYearFilter) {
      return NextResponse.json({ records: mapped }, { status: 200 });
    }

    const start = startYear ? Number.parseInt(startYear, 10) : Number.MIN_SAFE_INTEGER;
    const end = endYear ? Number.parseInt(endYear, 10) : Number.MAX_SAFE_INTEGER;

    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw new ApiHttpError(
        400,
        "VALIDATION_ERROR",
        "startYear and endYear must be valid integers."
      );
    }

    if (start > end) {
      throw new ApiHttpError(
        400,
        "VALIDATION_ERROR",
        "startYear must be less than or equal to endYear."
      );
    }

    const filtered = mapped.filter((record) => {
      const year = getRecordYear(record);
      return year >= start && year <= end;
    });

    return NextResponse.json({ records: filtered }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    const body = await request.json();

    const albumTitle: string | undefined = body?.albumTitle?.trim();
    const artistName: string | undefined = body?.artistName?.trim();
    const score: number | undefined = body?.score;

    if (!albumTitle || !artistName) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "albumTitle and artistName are required.");
    }
    if (typeof score !== "number" || score < 0 || score > 10 || !Number.isInteger(score)) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "score must be an integer in [0, 10].");
    }

    const existing = await dbGet<UserRecordRow>(
      `select id from user_records
       where user_id = ?
         and lower(trim(album_title)) = lower(trim(?))
         and lower(trim(artist_name)) = lower(trim(?))
       limit 1`,
      [user.id, albumTitle, artistName]
    );

    if (!existing) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }

    await dbRun(
      `update user_records set score = ? where id = ?`,
      [score, existing.id]
    );

    const updated = await dbGet<UserRecordRow>(
      `select
        id, album_mbid, album_title, release_date, release_year,
        listen_at, score, personal_tags, artist_id, artist_name,
        country_code, country_name, city_name, lng, lat
       from user_records
       where id = ?`,
      [existing.id]
    );

    return NextResponse.json(
      updated ? mapRowToUserRecord(updated) : { success: true },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}