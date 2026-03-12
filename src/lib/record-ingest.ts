import { randomUUID } from "node:crypto";

import { ApiHttpError } from "@/lib/api-error";
import {
  getArtistGeoFromCache,
  upsertArtistGeoCache,
  type ArtistGeoCacheRecord,
} from "@/lib/artist-geo-cache";
import { getCountryCoordinates } from "@/lib/country-centroid";
import { inferRegionFromCountryAndCity } from "@/lib/geo-region";
import { sanitizeGeoLabel } from "@/lib/geo-label";
import { dbGet, dbRun } from "@/lib/local-db";
import { MusicBrainzError, resolveArtistGeoById } from "@/lib/musicbrainz";
import { mapRowToUserRecord, type UserRecordRow } from "@/lib/record-mapper";
import type { UserRecord } from "@/lib/types";

export type ReleaseResolution = {
  id: string | null;
  title: string;
  date: string | null;
  year: number | null;
  artist: {
    id: string;
    name: string;
  };
};

export async function resolveArtistGeoWithCache(
  artistId: string,
  authToken?: string | null
): Promise<ArtistGeoCacheRecord> {
  const cached = await getArtistGeoFromCache(artistId);
  if (cached) {
    if (!cached.regionCode && cached.countryCode && cached.cityName) {
      const inferred = inferRegionFromCountryAndCity(cached.countryCode, cached.cityName);
      if (inferred.regionCode || inferred.regionName) {
        const enriched: ArtistGeoCacheRecord = {
          ...cached,
          regionCode: inferred.regionCode,
          regionName: inferred.regionName,
          geoGranularity: cached.cityName ? "city" : "region",
        };
        try {
          await upsertArtistGeoCache(
            enriched,
            getCountryCoordinates(enriched.countryCode, enriched.countryName)
          );
        } catch {
          // ignore cache enrichment failure
        }
        return enriched;
      }
    }
    return cached;
  }

  let resolvedArtist;
  try {
    resolvedArtist = await resolveArtistGeoById(artistId, authToken);
  } catch (err) {
    if (err instanceof MusicBrainzError && err.code === "RATE_LIMIT") {
      // Return a minimal record without coordinates; caller can decide to skip
      return {
        artistId,
        artistName: "Unknown",
        countryCode: null,
        countryName: null,
        cityName: null,
        regionCode: null,
        regionName: null,
        geoGranularity: "country",
      } as ArtistGeoCacheRecord;
    }
    throw err;
  }
  const inferredRegion =
    resolvedArtist.regionCode || resolvedArtist.regionName
      ? {
          regionCode: sanitizeGeoLabel(resolvedArtist.regionCode),
          regionName: sanitizeGeoLabel(resolvedArtist.regionName),
        }
      : inferRegionFromCountryAndCity(
          resolvedArtist.countryCode,
          sanitizeGeoLabel(resolvedArtist.cityName)
        );

  const cityName = sanitizeGeoLabel(resolvedArtist.cityName);
  const regionCode = sanitizeGeoLabel(inferredRegion.regionCode ?? null);
  const regionName = sanitizeGeoLabel(inferredRegion.regionName ?? null);

  const record: ArtistGeoCacheRecord = {
    artistId: resolvedArtist.artistId,
    artistName: resolvedArtist.artistName,
    countryCode: resolvedArtist.countryCode,
    countryName: resolvedArtist.countryName,
    cityName,
    regionCode,
    regionName,
    geoGranularity:
      resolvedArtist.geoGranularity ??
      (cityName ? "city" : regionCode ? "region" : "country"),
  };

  const cacheCoordinates = getCountryCoordinates(
    record.countryCode,
    record.countryName
  );

  try {
    await upsertArtistGeoCache(record, cacheCoordinates, resolvedArtist.rawPayload);
  } catch {
    // cache is best effort; avoid blocking ingest
  }

  return record;
}

type CreateUserRecordInput = {
  userId: string;
  release: ReleaseResolution;
  artistGeo: ArtistGeoCacheRecord;
  listenAt: string;
  score: number;
  personalTags: string[];
  coordinatesOverride?: {
    lng: number;
    lat: number;
  } | null;
};

export async function createUserRecord(
  input: CreateUserRecordInput
): Promise<UserRecord> {
  const coordinates =
    input.coordinatesOverride ??
    getCountryCoordinates(input.artistGeo.countryCode, input.artistGeo.countryName);

  const id = randomUUID();
  const personalTags = JSON.stringify(input.personalTags ?? []);

  await dbRun(
    `insert into user_records (
      id, user_id, album_mbid, album_title, release_date, release_year,
      listen_at, score, personal_tags, artist_id, artist_name,
      country_code, country_name, city_name, region_code, region_name, geo_granularity,
      lng, lat, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      id,
      input.userId,
      input.release.id,
      input.release.title,
      input.release.date,
      input.release.year,
      input.listenAt,
      input.score,
      personalTags,
      input.artistGeo.artistId,
      input.artistGeo.artistName,
      input.artistGeo.countryCode,
      input.artistGeo.countryName,
      input.artistGeo.cityName,
      input.artistGeo.regionCode ?? null,
      input.artistGeo.regionName ?? null,
      input.artistGeo.geoGranularity ?? (input.artistGeo.cityName ? "city" : input.artistGeo.regionCode ? "region" : "country"),
      coordinates?.lng ?? null,
      coordinates?.lat ?? null,
    ]
  );

  const data = await dbGet<UserRecordRow>(
    `select
      id, album_mbid, album_title, release_date, release_year, listen_at, score,
      personal_tags, artist_id, artist_name, country_code, country_name, city_name,
      region_code, region_name, geo_granularity, lng, lat
     from user_records
     where id = ?
     limit 1`,
    [id]
  );

  if (!data) {
    throw new ApiHttpError(
      500,
      "DATABASE_ERROR",
      "Failed to save record."
    );
  }

  return mapRowToUserRecord(data);
}
