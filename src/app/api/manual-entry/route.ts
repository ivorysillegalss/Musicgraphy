import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { getLocalAuthUser } from "@/lib/local-auth";
import { resolveReleaseByArtistAndTitle } from "@/lib/musicbrainz";
import { createUserRecord, resolveArtistGeoWithCache } from "@/lib/record-ingest";
import type { ManualEntryRequest } from "@/lib/types";

function parseRequestBody(body: unknown): ManualEntryRequest {
  const payload = body as Partial<ManualEntryRequest>;

  if (!payload?.artistName?.trim()) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "artistName is required.");
  }
  if (!payload?.releaseTitle?.trim()) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "releaseTitle is required.");
  }
  if (!payload?.listenAt || Number.isNaN(new Date(payload.listenAt).valueOf())) {
    throw new ApiHttpError(
      400,
      "VALIDATION_ERROR",
      "listenAt must be a valid datetime string."
    );
  }
  if (
    typeof payload.score !== "number" ||
    Number.isNaN(payload.score) ||
    payload.score < 1 ||
    payload.score > 10
  ) {
    throw new ApiHttpError(
      400,
      "VALIDATION_ERROR",
      "score must be a number between 1 and 10."
    );
  }

  return {
    artistName: payload.artistName.trim(),
    releaseTitle: payload.releaseTitle.trim(),
    listenAt: payload.listenAt,
    score: payload.score,
    personalTags: payload.personalTags ?? [],
  };
}

export async function POST(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    const body = parseRequestBody(await request.json());
    const release = await resolveReleaseByArtistAndTitle(
      body.artistName,
      body.releaseTitle
    );

    const artistGeo = await resolveArtistGeoWithCache(release.artist.id, null);
    const record = await createUserRecord({
      userId: user.id,
      release,
      artistGeo,
      listenAt: body.listenAt,
      score: body.score,
      personalTags: body.personalTags ?? [],
    });

    return NextResponse.json(record, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}