import { dbGet, dbRun } from "@/lib/local-db";
import { sanitizeGeoLabel } from "@/lib/geo-label";

export type ArtistGeoCacheRecord = {
  artistId: string;
  artistName: string;
  countryCode: string | null;
  countryName: string | null;
  cityName: string | null;
  regionCode?: string | null;
  regionName?: string | null;
  geoGranularity?: "city" | "region" | "country";
};

type ArtistGeoCacheRow = {
  artist_id: string;
  artist_name: string;
  country_code: string | null;
  country_name: string | null;
  city_name: string | null;
  region_code?: string | null;
  region_name?: string | null;
  geo_granularity?: "city" | "region" | "country" | null;
  lng: number | null;
  lat: number | null;
};

function rowToRecord(row: ArtistGeoCacheRow): ArtistGeoCacheRecord {
  const cityName = sanitizeGeoLabel(row.city_name);
  const regionCode = sanitizeGeoLabel(row.region_code);
  const regionName = sanitizeGeoLabel(row.region_name);

  return {
    artistId: row.artist_id,
    artistName: row.artist_name,
    countryCode: row.country_code,
    countryName: row.country_name,
    cityName,
    regionCode,
    regionName,
    geoGranularity: row.geo_granularity ?? (cityName ? "city" : regionCode ? "region" : "country"),
  };
}

export async function getArtistGeoFromCache(
  artistId: string
): Promise<ArtistGeoCacheRecord | null> {
  const data = await dbGet<ArtistGeoCacheRow>(
    `select artist_id, artist_name, country_code, country_name, city_name,
            region_code, region_name, geo_granularity, lng, lat
     from artist_geo_cache
     where artist_id = ?
     limit 1`,
    [artistId]
  );

  if (!data) {
    return null;
  }

  return rowToRecord(data);
}

export async function upsertArtistGeoCache(
  record: ArtistGeoCacheRecord,
  coordinates: { lng: number; lat: number } | null,
  rawPayload?: unknown
): Promise<void> {
  const cityName = sanitizeGeoLabel(record.cityName);
  const regionCode = sanitizeGeoLabel(record.regionCode);
  const regionName = sanitizeGeoLabel(record.regionName);
  const geoGranularity = record.geoGranularity ?? (cityName ? "city" : regionCode ? "region" : "country");

  await dbRun(
    `insert into artist_geo_cache (
      artist_id, artist_name, country_code, country_name, city_name,
      region_code, region_name, geo_granularity,
      lng, lat, raw_payload, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    on conflict(artist_id) do update set
      artist_name = excluded.artist_name,
      country_code = excluded.country_code,
      country_name = excluded.country_name,
      city_name = excluded.city_name,
      region_code = excluded.region_code,
      region_name = excluded.region_name,
      geo_granularity = excluded.geo_granularity,
      lng = excluded.lng,
      lat = excluded.lat,
      raw_payload = excluded.raw_payload,
      updated_at = datetime('now')`,
    [
      record.artistId,
      record.artistName,
      record.countryCode,
      record.countryName,
      cityName,
      regionCode,
      regionName,
      geoGranularity,
      coordinates?.lng ?? null,
      coordinates?.lat ?? null,
      rawPayload ? JSON.stringify(rawPayload) : null,
    ]
  );
}
