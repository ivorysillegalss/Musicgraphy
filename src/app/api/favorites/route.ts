import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { getLocalAuthUser } from "@/lib/local-auth";
import { dbAll, dbRun } from "@/lib/local-db";

type FavoritePayload = {
  id?: string;
  albumTitle?: string;
  artistName?: string;
  releaseYear?: number | null;
  countryCode?: string | null;
  countryName?: string | null;
  cityName?: string | null;
  coordinates?: {
    lng?: number;
    lat?: number;
  } | null;
};

type FavoriteRow = {
  album_id: string;
  album_title: string;
  artist_name: string;
  release_year: number | null;
  country_code: string | null;
  country_name: string | null;
  city_name: string | null;
  lng: number | null;
  lat: number | null;
};

function normalizeAlbumId(input: FavoritePayload) {
  if (input.id?.trim()) {
    return input.id.trim();
  }

  const artist = (input.artistName ?? "").trim().toLowerCase();
  const title = (input.albumTitle ?? "").trim().toLowerCase();
  if (!artist || !title) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "id or (artistName + albumTitle) is required.");
  }

  const base = `${artist}::${title}`;
  return `fav-${Buffer.from(base).toString("hex").slice(0, 32)}`;
}

function parseFavorite(input: FavoritePayload) {
  const albumTitle = input.albumTitle?.trim();
  const artistName = input.artistName?.trim();

  if (!albumTitle) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "albumTitle is required.");
  }
  if (!artistName) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "artistName is required.");
  }

  const hasCoordinates =
    typeof input.coordinates?.lng === "number" &&
    typeof input.coordinates?.lat === "number";

  return {
    albumId: normalizeAlbumId(input),
    albumTitle,
    artistName,
    releaseYear:
      typeof input.releaseYear === "number" && Number.isFinite(input.releaseYear)
        ? Math.trunc(input.releaseYear)
        : null,
    countryCode: input.countryCode?.trim().toUpperCase() ?? null,
    countryName: input.countryName?.trim() ?? null,
    cityName: input.cityName?.trim() ?? null,
    coordinates: hasCoordinates
      ? { lng: input.coordinates!.lng!, lat: input.coordinates!.lat! }
      : null,
  };
}

function rowToFavorite(row: FavoriteRow) {
  return {
    id: row.album_id,
    albumTitle: row.album_title,
    artistName: row.artist_name,
    releaseYear: row.release_year,
    countryCode: row.country_code ?? "XX",
    countryName: row.country_name ?? "Unknown",
    cityName: row.city_name ?? "Unknown",
    coordinates: {
      lng: row.lng ?? 0,
      lat: row.lat ?? 0,
    },
  };
}

export async function GET(request: Request) {
  try {
    const user = await getLocalAuthUser(request);

    const rows = await dbAll<FavoriteRow>(
      `select album_id, album_title, artist_name, release_year, country_code, country_name, city_name, lng, lat
       from user_favorites
       where user_id = ?
       order by created_at desc`,
      [user.id]
    );

    return NextResponse.json({ favorites: rows.map(rowToFavorite) }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    const body = (await request.json().catch(() => ({}))) as FavoritePayload | { items?: FavoritePayload[] };
    const items = Array.isArray((body as { items?: FavoritePayload[] }).items)
      ? (body as { items?: FavoritePayload[] }).items!
      : [body as FavoritePayload];

    for (const input of items) {
      const item = parseFavorite(input);
      await dbRun(
        `insert into user_favorites (
          user_id, album_id, album_title, artist_name, release_year,
          country_code, country_name, city_name, lng, lat, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        on conflict(user_id, album_id) do update set
          album_title = excluded.album_title,
          artist_name = excluded.artist_name,
          release_year = excluded.release_year,
          country_code = excluded.country_code,
          country_name = excluded.country_name,
          city_name = excluded.city_name,
          lng = excluded.lng,
          lat = excluded.lat`,
        [
          user.id,
          item.albumId,
          item.albumTitle,
          item.artistName,
          item.releaseYear,
          item.countryCode,
          item.countryName,
          item.cityName,
          item.coordinates?.lng ?? null,
          item.coordinates?.lat ?? null,
        ]
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    const body = (await request.json().catch(() => ({}))) as FavoritePayload;

    const albumId = normalizeAlbumId(body);

    await dbRun(
      `delete from user_favorites where user_id = ? and album_id = ?`,
      [user.id, albumId]
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
