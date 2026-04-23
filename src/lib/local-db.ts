import fs from "node:fs";
import path from "node:path";

import { createClient, type InArgs, type Client } from "@libsql/client";

let dbClient: Client | null = null;
let initPromise: Promise<void> | null = null;

function getDbPath() {
  const configured = process.env.LOCAL_DB_PATH?.trim();
  if (configured) {
    return configured;
  }
  return path.join(process.cwd(), "data", "dream.db");
}

function ensureDbDirectory(dbPath: string) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
}

function getClient() {
  if (dbClient) {
    return dbClient;
  }

  const dbPath = getDbPath();
  ensureDbDirectory(dbPath);

  dbClient = createClient({
    url: `file:${dbPath}`,
  });

  return dbClient;
}

async function initializeSchema() {
  const client = getClient();

  await client.batch(
    [
      `create table if not exists users (
        id text primary key,
        email text,
        mb_token text,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now'))
      )`,
      `create table if not exists artist_geo_cache (
        artist_id text primary key,
        artist_name text not null,
        country_code text,
        country_name text,
        city_name text,
        region_code text,
        region_name text,
        geo_granularity text not null default 'country',
        lng real,
        lat real,
        raw_payload text,
        updated_at text not null default (datetime('now'))
      )`,
      `create table if not exists user_records (
        id text primary key,
        user_id text not null,
        album_mbid text,
        album_title text not null,
        release_date text,
        release_year integer,
        listen_at text not null,
        score integer not null,
        personal_tags text not null default '[]',
        artist_id text not null,
        artist_name text not null,
        country_code text,
        country_name text,
        city_name text,
        region_code text,
        region_name text,
        geo_granularity text not null default 'country',
        lng real,
        lat real,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now'))
      )`,
      `create index if not exists idx_user_records_user_listen on user_records(user_id, listen_at desc)`,
      `create index if not exists idx_user_records_album_artist on user_records(user_id, album_title, artist_name)`,
      `create table if not exists discovery_pool (
        id text primary key,
        album_title text not null,
        album_search_title text,
        artist_name text not null,
        artist_search_name text,
        release_year integer not null,
        country_code text not null,
        country_name text not null,
        city_name text not null,
        region_code text,
        region_name text,
        geo_granularity text not null default 'country',
        geo_cluster_key text,
        lng real not null,
        lat real not null,
        enabled integer not null default 1,
        weight integer not null default 1,
        created_at text not null default (datetime('now'))
      )`,
      `create index if not exists idx_discovery_pool_enabled on discovery_pool(enabled)`,
      `create index if not exists idx_discovery_pool_geo_cluster on discovery_pool(geo_cluster_key)`,
      `create index if not exists idx_discovery_pool_release_country on discovery_pool(release_year, country_code)`,
      `create table if not exists user_favorites (
        user_id text not null,
        album_id text not null,
        album_title text not null,
        artist_name text not null,
        release_year integer,
        country_code text,
        country_name text,
        city_name text,
        lng real,
        lat real,
        created_at text not null default (datetime('now')),
        primary key (user_id, album_id)
      )`,
      `create index if not exists idx_user_favorites_user_created on user_favorites(user_id, created_at desc)`,
      `create table if not exists album_cover_cache (
        cache_key text primary key,
        artist_name text,
        album_title text,
        source text,
        cover_url text,
        candidates_json text not null default '[]',
        found integer not null default 0,
        updated_at text not null default (datetime('now'))
      )`,
      `create index if not exists idx_album_cover_cache_updated_at on album_cover_cache(updated_at desc)`,
      `insert or ignore into users (id, email) values ('local-user', 'local@localhost')`,
    ],
    "write"
  );

  await ensureGeoSchemaCompatibility(client);
}

async function hasColumn(client: Client, table: string, column: string) {
  const result = await client.execute(`pragma table_info(${table})`);
  return (result.rows ?? []).some((row) => {
    const name = (row as { name?: unknown }).name;
    return typeof name === "string" && name === column;
  });
}

async function ensureColumn(client: Client, table: string, column: string, definition: string) {
  if (await hasColumn(client, table, column)) {
    return;
  }
  await client.execute(`alter table ${table} add column ${column} ${definition}`);
}

async function ensureGeoSchemaCompatibility(client: Client) {
  await ensureColumn(client, "discovery_pool", "region_code", "text");
  await ensureColumn(client, "discovery_pool", "region_name", "text");
  await ensureColumn(client, "discovery_pool", "geo_granularity", "text not null default 'country'");
  await ensureColumn(client, "discovery_pool", "geo_cluster_key", "text");
  await ensureColumn(client, "discovery_pool", "album_search_title", "text");
  await ensureColumn(client, "discovery_pool", "artist_search_name", "text");

  await ensureColumn(client, "artist_geo_cache", "region_code", "text");
  await ensureColumn(client, "artist_geo_cache", "region_name", "text");
  await ensureColumn(client, "artist_geo_cache", "geo_granularity", "text not null default 'country'");

  await ensureColumn(client, "user_records", "region_code", "text");
  await ensureColumn(client, "user_records", "region_name", "text");
  await ensureColumn(client, "user_records", "geo_granularity", "text not null default 'country'");

  await ensureColumn(client, "users", "mb_oauth_access_token", "text");
  await ensureColumn(client, "users", "mb_oauth_refresh_token", "text");
  await ensureColumn(client, "users", "mb_oauth_token_type", "text");
  await ensureColumn(client, "users", "mb_oauth_scope", "text");
  await ensureColumn(client, "users", "mb_oauth_expires_at", "text");
  await ensureColumn(client, "users", "mb_oauth_state", "text");
  await ensureColumn(client, "users", "mb_oauth_state_expires_at", "text");
  await ensureColumn(client, "users", "mb_oauth_connected_at", "text");

  await client.batch(
    [
      `create index if not exists idx_discovery_pool_geo_cluster on discovery_pool(geo_cluster_key)`,
      `create index if not exists idx_discovery_pool_release_country on discovery_pool(release_year, country_code)`,
      `create index if not exists idx_users_mb_oauth_state on users(mb_oauth_state)`,
    ],
    "write"
  );
}

async function ensureInitialized() {
  if (!initPromise) {
    initPromise = initializeSchema();
  }
  await initPromise;
}

export async function dbAll<T extends Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
  await ensureInitialized();
  const result = await getClient().execute({ sql, args });
  return (result.rows ?? []) as unknown as T[];
}

export async function dbGet<T extends Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T | null> {
  const rows = await dbAll<T>(sql, args);
  return rows[0] ?? null;
}

export async function dbRun(sql: string, args: InArgs = []) {
  await ensureInitialized();
  return getClient().execute({ sql, args });
}
