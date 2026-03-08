import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { getLocalAuthUser } from "@/lib/local-auth";
import { dbAll } from "@/lib/local-db";
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