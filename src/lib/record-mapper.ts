import { getCountryCoordinates } from "@/lib/country-centroid";
import { sanitizeGeoLabel } from "@/lib/geo-label";
import type { UserRecord } from "@/lib/types";

export type UserRecordRow = {
  id: string;
  album_mbid: string | null;
  album_title: string;
  release_date: string | null;
  release_year: number | null;
  listen_at: string;
  score: number;
  personal_tags: string[] | string | null;
  artist_id: string;
  artist_name: string;
  country_code: string | null;
  country_name: string | null;
  city_name: string | null;
  region_code?: string | null;
  region_name?: string | null;
  geo_granularity?: "city" | "region" | "country" | null;
  lng?: number | null;
  lat?: number | null;
};

function parseTags(value: UserRecordRow["personal_tags"]): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return [];
    }
  }
  return [];
}

export function mapRowToUserRecord(row: UserRecordRow): UserRecord {
  const cityName = sanitizeGeoLabel(row.city_name);
  const regionCode = sanitizeGeoLabel(row.region_code);
  const regionName = sanitizeGeoLabel(row.region_name);

  return {
    id: row.id,
    albumMbid: row.album_mbid,
    albumTitle: row.album_title,
    releaseDate: row.release_date,
    releaseYear: row.release_year,
    listenAt: row.listen_at,
    score: row.score,
    personalTags: parseTags(row.personal_tags),
    artistGeo: {
      artistId: row.artist_id,
      artistName: row.artist_name,
      countryCode: row.country_code,
      countryName: row.country_name,
      cityName,
      regionCode,
      regionName,
      geoGranularity: row.geo_granularity ?? (cityName ? "city" : regionCode ? "region" : "country"),
      coordinates:
        typeof row.lng === "number" && typeof row.lat === "number"
          ? { lng: row.lng, lat: row.lat }
          : getCountryCoordinates(row.country_code, row.country_name),
    },
  };
}