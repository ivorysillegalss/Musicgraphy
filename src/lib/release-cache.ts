import { dbGet, dbRun } from "@/lib/local-db";
import type { ReleaseResolution } from "@/lib/record-ingest";

function buildKey(artistName: string, albumTitle: string): string {
  return `${artistName.trim().toLowerCase()}||${albumTitle.trim().toLowerCase()}`;
}

type ReleaseCacheRow = {
  cache_key: string;
  album_mbid: string | null;
  album_title: string;
  release_date: string | null;
  release_year: number | null;
  artist_id: string;
  artist_name: string;
  not_found: number;
};

export async function getCachedRelease(
  artistName: string,
  albumTitle: string,
): Promise<ReleaseResolution | null> {
  const key = buildKey(artistName, albumTitle);
  const row = await dbGet<ReleaseCacheRow>(
    `select cache_key, album_mbid, album_title, release_date, release_year,
            artist_id, artist_name, not_found
     from release_search_cache
     where cache_key = ?
     limit 1`,
    [key]
  );

  if (!row) return null;

  // Cached as "not found" — don't retry
  if (row.not_found) {
    return { notFound: true } as ReleaseResolution & { notFound: true };
  }

  return {
    id: row.album_mbid,
    title: row.album_title,
    date: row.release_date,
    year: row.release_year,
    artist: {
      id: row.artist_id,
      name: row.artist_name,
    },
  };
}

export async function cacheRelease(
  artistName: string,
  albumTitle: string,
  release: ReleaseResolution,
): Promise<void> {
  const key = buildKey(artistName, albumTitle);

  await dbRun(
    `insert into release_search_cache (
      cache_key, album_mbid, album_title, release_date, release_year,
      artist_id, artist_name, not_found, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    on conflict(cache_key) do update set
      album_mbid = excluded.album_mbid,
      album_title = excluded.album_title,
      release_date = excluded.release_date,
      release_year = excluded.release_year,
      artist_id = excluded.artist_id,
      artist_name = excluded.artist_name,
      not_found = 0,
      updated_at = datetime('now')`,
    [
      key,
      release.id,
      release.title,
      release.date,
      release.year,
      release.artist.id,
      release.artist.name,
    ]
  );
}

export async function cacheNotFound(
  artistName: string,
  albumTitle: string,
): Promise<void> {
  const key = buildKey(artistName, albumTitle);

  await dbRun(
    `insert into release_search_cache (
      cache_key, album_mbid, album_title, release_date, release_year,
      artist_id, artist_name, not_found, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    on conflict(cache_key) do update set
      not_found = 1,
      updated_at = datetime('now')`,
    [key, null, albumTitle, null, null, "", "", ""]
  );
}
