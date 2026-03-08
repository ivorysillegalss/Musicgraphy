import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { queryDiscoveryPool } from "@/lib/discovery-pool";

function parseNumber(value: string | null, fallback: number, field: string) {
  if (value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", `${field} must be a number.`);
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const west = parseNumber(url.searchParams.get("west"), -180, "west");
    const south = parseNumber(url.searchParams.get("south"), -85, "south");
    const east = parseNumber(url.searchParams.get("east"), 180, "east");
    const north = parseNumber(url.searchParams.get("north"), 85, "north");
    const zoom = parseNumber(url.searchParams.get("zoom"), 1.5, "zoom");
    const minYear = Math.trunc(parseNumber(url.searchParams.get("minYear"), 1960, "minYear"));
    const maxYear = Math.trunc(parseNumber(url.searchParams.get("maxYear"), 2030, "maxYear"));
    const seed = url.searchParams.get("seed") ?? undefined;

    if (minYear > maxYear) {
      throw new ApiHttpError(
        400,
        "VALIDATION_ERROR",
        "minYear must be less than or equal to maxYear."
      );
    }

    const preferredCountries = (url.searchParams.get("countries") ?? "")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    let calculatedLimit = 20;
    if (seed) {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
      }
      calculatedLimit = 20 + (hash % 11); // Deterministic Random between 20 and 30
    } else {
      calculatedLimit = 20 + Math.floor(Math.random() * 11);
    }
    const limit = calculatedLimit;

    const albums = await queryDiscoveryPool({
      west,
      south,
      east,
      north,
      minYear,
      maxYear,
      limit,
      preferredCountries,
      seed,
    });

    return NextResponse.json({ albums }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
