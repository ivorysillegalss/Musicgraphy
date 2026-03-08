import { NextResponse } from "next/server";

import { ApiHttpError, handleApiError } from "@/lib/api-error";
import { getLocalAuthUser } from "@/lib/local-auth";
import { dbAll, dbGet, dbRun } from "@/lib/local-db";

type DiscoveryPoolManagePayload = {
  id?: string;
  albumTitle?: string;
  artistName?: string;
  releaseYear?: number;
  countryCode?: string;
  countryName?: string;
  cityName?: string;
  regionCode?: string;
  regionName?: string;
  geoGranularity?: "city" | "region" | "country";
  geoClusterKey?: string;
  lng?: number;
  lat?: number;
  enabled?: boolean;
  weight?: number;
};

type DiscoveryPoolRow = {
  id: string;
  album_title: string;
  artist_name: string;
  release_year: number;
  country_code: string;
  country_name: string;
  city_name: string;
  region_code: string | null;
  region_name: string | null;
  geo_granularity: "city" | "region" | "country";
  geo_cluster_key: string | null;
  lng: number;
  lat: number;
  enabled: number;
  weight: number;
  created_at: string;
};

function toItem(row: DiscoveryPoolRow) {
  return {
    id: row.id,
    album_title: row.album_title,
    artist_name: row.artist_name,
    release_year: row.release_year,
    country_code: row.country_code,
    country_name: row.country_name,
    city_name: row.city_name,
    region_code: row.region_code,
    region_name: row.region_name,
    geo_granularity: row.geo_granularity,
    geo_cluster_key: row.geo_cluster_key,
    lng: row.lng,
    lat: row.lat,
    enabled: Boolean(row.enabled),
    weight: row.weight,
    created_at: row.created_at,
  };
}

function getAdminEmails() {
  return (process.env.DISCOVERY_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function requireAdmin(email: string | null | undefined) {
  const admins = getAdminEmails();
  // If no admin list is configured, default to allow local management for simple deployment.
  if (admins.length === 0) {
    return;
  }

  if (!email || !admins.includes(email.toLowerCase())) {
    throw new ApiHttpError(403, "UNAUTHORIZED", "Only discovery admins can manage pool.");
  }
}

function parseCreatePayload(body: unknown) {
  const payload = body as DiscoveryPoolManagePayload;
  if (!payload.id?.trim()) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "id is required.");
  }
  if (!payload.albumTitle?.trim()) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "albumTitle is required.");
  }
  if (!payload.artistName?.trim()) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "artistName is required.");
  }
  if (!payload.countryCode?.trim()) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "countryCode is required.");
  }
  if (!payload.countryName?.trim()) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "countryName is required.");
  }
  if (typeof payload.releaseYear !== "number") {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "releaseYear must be number.");
  }
  if (typeof payload.lng !== "number" || typeof payload.lat !== "number") {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "lng/lat must be number.");
  }

  const weight = payload.weight ?? 1;
  if (!Number.isInteger(weight) || weight < 1 || weight > 10) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "weight must be integer in [1,10].");
  }

  const normalizedCountry = payload.countryCode.trim().toUpperCase();
  const normalizedCity = payload.cityName?.trim() || payload.countryName.trim();
  const normalizedRegionCode = payload.regionCode?.trim() || null;
  const normalizedRegionName = payload.regionName?.trim() || null;

  const geoGranularity = payload.geoGranularity ?? (normalizedCity ? "city" : normalizedRegionCode ? "region" : "country");
  const clusterCity = normalizedCity
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const clusterRegion = (normalizedRegionCode ?? "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const defaultCluster = clusterCity
    ? `${normalizedCountry.toLowerCase()}:${clusterRegion || "na"}:${clusterCity}`
    : clusterRegion
      ? `${normalizedCountry.toLowerCase()}:${clusterRegion}`
      : normalizedCountry.toLowerCase();

  return {
    id: payload.id.trim(),
    album_title: payload.albumTitle.trim(),
    artist_name: payload.artistName.trim(),
    release_year: Math.trunc(payload.releaseYear),
    country_code: normalizedCountry,
    country_name: payload.countryName.trim(),
    city_name: normalizedCity,
    region_code: normalizedRegionCode,
    region_name: normalizedRegionName,
    geo_granularity: geoGranularity,
    geo_cluster_key: payload.geoClusterKey?.trim() || defaultCluster,
    lng: payload.lng,
    lat: payload.lat,
    enabled: payload.enabled ?? true,
    weight,
  };
}

export async function GET(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    requireAdmin(user.email);

    const data = await dbAll<DiscoveryPoolRow>(
      `select
        id, album_title, artist_name, release_year, country_code, country_name,
        city_name, region_code, region_name, geo_granularity, geo_cluster_key,
        lng, lat, enabled, weight, created_at
       from discovery_pool
       order by created_at desc
       limit 1000`
    );

    return NextResponse.json({ items: data.map(toItem) }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    requireAdmin(user.email);

    const payload = parseCreatePayload(await request.json());

    await dbRun(
      `insert into discovery_pool (
        id, album_title, artist_name, release_year, country_code, country_name,
        city_name, region_code, region_name, geo_granularity, geo_cluster_key,
        lng, lat, enabled, weight, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      on conflict(id) do update set
        album_title = excluded.album_title,
        artist_name = excluded.artist_name,
        release_year = excluded.release_year,
        country_code = excluded.country_code,
        country_name = excluded.country_name,
        city_name = excluded.city_name,
        region_code = excluded.region_code,
        region_name = excluded.region_name,
        geo_granularity = excluded.geo_granularity,
        geo_cluster_key = excluded.geo_cluster_key,
        lng = excluded.lng,
        lat = excluded.lat,
        enabled = excluded.enabled,
        weight = excluded.weight`,
      [
        payload.id,
        payload.album_title,
        payload.artist_name,
        payload.release_year,
        payload.country_code,
        payload.country_name,
        payload.city_name,
        payload.region_code,
        payload.region_name,
        payload.geo_granularity,
        payload.geo_cluster_key,
        payload.lng,
        payload.lat,
        payload.enabled ? 1 : 0,
        payload.weight,
      ]
    );

    const item = await dbGet<DiscoveryPoolRow>(
      `select
        id, album_title, artist_name, release_year, country_code, country_name,
        city_name, region_code, region_name, geo_granularity, geo_cluster_key,
        lng, lat, enabled, weight, created_at
       from discovery_pool
       where id = ?
       limit 1`,
      [payload.id]
    );

    if (!item) {
      throw new ApiHttpError(500, "DATABASE_ERROR", "Save failed");
    }

    return NextResponse.json({ item: toItem(item) }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    requireAdmin(user.email);

    const body = (await request.json()) as DiscoveryPoolManagePayload;
    if (!body.id?.trim()) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "id is required.");
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") {
      patch.enabled = body.enabled ? 1 : 0;
    }
    if (typeof body.weight === "number") {
      const weight = Math.trunc(body.weight);
      if (!Number.isInteger(weight) || weight < 1 || weight > 10) {
        throw new ApiHttpError(400, "VALIDATION_ERROR", "weight must be integer in [1,10].");
      }
      patch.weight = weight;
    }
    if (typeof body.releaseYear === "number") {
      patch.release_year = Math.trunc(body.releaseYear);
    }

    if (Object.keys(patch).length === 0) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "No updatable fields provided.");
    }

    const setSql = Object.keys(patch)
      .map((key) => `${key} = ?`)
      .join(", ");
    const args = [...Object.values(patch), body.id.trim()] as Array<string | number | null>;

    await dbRun(`update discovery_pool set ${setSql} where id = ?`, args);

    const item = await dbGet<DiscoveryPoolRow>(
      `select
        id, album_title, artist_name, release_year, country_code, country_name,
        city_name, region_code, region_name, geo_granularity, geo_cluster_key,
        lng, lat, enabled, weight, created_at
       from discovery_pool
       where id = ?
       limit 1`,
      [body.id.trim()]
    );

    if (!item) {
      throw new ApiHttpError(404, "DATABASE_ERROR", "Update failed");
    }

    return NextResponse.json({ item: toItem(item) }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getLocalAuthUser(request);
    requireAdmin(user.email);

    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    if (!id) {
      throw new ApiHttpError(400, "VALIDATION_ERROR", "id query parameter is required.");
    }

    await dbRun(`delete from discovery_pool where id = ?`, [id]);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
