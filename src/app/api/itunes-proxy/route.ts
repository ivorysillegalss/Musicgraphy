import { NextResponse } from "next/server";

import { lookupAlbumCover, type CoverSource } from "@/lib/album-cover";

type CoverLookupResponse = {
  found: boolean;
  source: CoverSource | null;
  coverUrl: string | null;
  candidates: string[];
  cache: "hit" | "miss" | "refresh";
};

function normalize(value: string | null) {
  return (value ?? "").trim();
}

function buildTerm(artist: string, album: string, term: string) {
  if (term) return term;
  return `${artist} ${album}`.trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = normalize(searchParams.get("artist"));
  const album = normalize(searchParams.get("album"));
  const term = normalize(searchParams.get("term"));
  const releaseId = normalize(searchParams.get("releaseId"));
  const forceRefresh = searchParams.get("refresh") === "1";
  const queryTerm = buildTerm(artist, album, term);

  if (!queryTerm && !releaseId) {
    const empty: CoverLookupResponse = {
      found: false,
      source: null,
      coverUrl: null,
      candidates: [],
      cache: "miss",
    };
    return NextResponse.json(empty);
  }

  try {
    const response = await lookupAlbumCover({
      artist,
      album,
      term: queryTerm,
      releaseId,
      forceRefresh,
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Album cover proxy error:", error);
    const failed: CoverLookupResponse = {
      found: false,
      source: null,
      coverUrl: null,
      candidates: [],
      cache: "miss",
    };
    return NextResponse.json(failed, { status: 200 });
  }
}
