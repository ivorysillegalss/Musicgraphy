"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";

import { motion, AnimatePresence } from "framer-motion";

import type { DiscoveryAlbum } from "@/lib/discovery-catalog";
import type { UserRecord } from "@/lib/types";
import { AlbumMarker } from "@/components/ui/map-marker/album-marker";
import { AlbumArtImage } from "@/components/ui/album-art-image";
import { MemoizedGeographies } from "@/components/ui/memoized-geographies";
import { MapControls } from "@/components/ui/map-controls";
import { SearchOverlay } from "@/components/ui/search-overlay";
import { sanitizeGeoLabel } from "@/lib/geo-label";
import { Search, X } from "lucide-react";

type WorldMapProps = {
  userRecords: UserRecord[];
  isAuthenticated: boolean;
  userId?: string;
  favorites: DiscoveryAlbum[];
  preferredCountries: string[];
  yearRange: {
    min: number;
    max: number;
  };
  externalSelection?:
    | { type: "discovery"; album: DiscoveryAlbum }
    | { type: "user"; record: UserRecord }
    | null;
  onExternalSelectionHandled?: () => void;
  onToggleFavorite: (album: DiscoveryAlbum) => void;
  onMarkHeard: (album: DiscoveryAlbum) => Promise<void>;
};

const SVG_WIDTH = 1200;
const SVG_HEIGHT = 620;
const MAX_DISCOVERY_SIZE = 96;
const MAX_USER_SIZE = 72;

const COLLISION_TUNING = {
  gapPx: 3,
  baseIterations: 30,
  maxIterations: 42,
  baseClusterIterations: 10,
  maxClusterIterations: 16,
  minDisplacementPx: 16,
  maxDisplacementPx: 36,
};

const COLLISION_PRESET_STORAGE_KEY = "dream.collision.tuning.v1";

type CollisionTweakState = {
  iterationsOffset: number;
  clusterIterationsOffset: number;
  gapPx: number;
  maxDisplacementOffset: number;
};

// Shipping baseline tuned for dense metro clusters while keeping geo drift bounded.
const SHIPPING_COLLISION_TWEAKS: CollisionTweakState = {
  iterationsOffset: 4,
  clusterIterationsOffset: 2,
  gapPx: 3.25,
  maxDisplacementOffset: 4,
};

function sanitizeCollisionTweaks(
  value: Partial<CollisionTweakState> | null | undefined
): CollisionTweakState {
  return {
    iterationsOffset: Math.round(clamp(Number(value?.iterationsOffset ?? 0), -10, 18)),
    clusterIterationsOffset: Math.round(clamp(Number(value?.clusterIterationsOffset ?? 0), -6, 12)),
    gapPx: clamp(Number(value?.gapPx ?? COLLISION_TUNING.gapPx), 1, 8),
    maxDisplacementOffset: Math.round(clamp(Number(value?.maxDisplacementOffset ?? 0), -12, 20)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeCompareValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function albumArtistKey(albumTitle: string, artistName: string) {
  return `${normalizeCompareValue(albumTitle)}::${normalizeCompareValue(artistName)}`;
}

function isSameAlbumSelection(a: DiscoveryAlbum, b: DiscoveryAlbum) {
  if (a.id && b.id && a.id === b.id) return true;
  return albumArtistKey(a.albumTitle, a.artistName) === albumArtistKey(b.albumTitle, b.artistName);
}

function artistNameKey(artistName: string) {
  return normalizeCompareValue(artistName);
}

function pickOneAlbumPerArtist(
  albums: DiscoveryAlbum[],
  seed: string,
  selectedDiscovery: DiscoveryAlbum | null
) {
  const groups = new Map<string, DiscoveryAlbum[]>();

  for (const album of albums) {
    const key = artistNameKey(album.artistName);
    const list = groups.get(key) ?? [];
    list.push(album);
    groups.set(key, list);
  }

  const picked: DiscoveryAlbum[] = [];
  for (const [artistKey, list] of groups.entries()) {
    if (list.length === 0) continue;

    if (selectedDiscovery && artistNameKey(selectedDiscovery.artistName) === artistKey) {
      const selectedInGroup = list.find((album) => isSameAlbumSelection(album, selectedDiscovery));
      if (selectedInGroup) {
        picked.push(selectedInGroup);
        continue;
      }
    }

    const sorted = [...list].sort((a, b) => {
      const byTitle = a.albumTitle.localeCompare(b.albumTitle);
      if (byTitle !== 0) return byTitle;
      return a.id.localeCompare(b.id);
    });

    const index = hashStringToInt(`${seed}:${artistKey}`) % sorted.length;
    picked.push(sorted[index]);
  }

  return picked;
}

function normalizeClusterPart(value: string | null | undefined) {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function hasMeaningfulCityLabel(input: {
  cityName?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
}) {
  const city = normalizeClusterPart(sanitizeGeoLabel(input.cityName));
  if (!city) return false;

  const countryCode = normalizeClusterPart(input.countryCode);
  const countryName = normalizeClusterPart(sanitizeGeoLabel(input.countryName));

  if (countryCode && city === countryCode) return false;
  if (countryName && city === countryName) return false;
  return true;
}

function inferEffectiveGeoGranularity(input: {
  cityName?: string | null;
  regionCode?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  geoGranularity?: "city" | "region" | "country";
}) {
  if (hasMeaningfulCityLabel(input)) {
    return "city" as const;
  }

  const region = normalizeClusterPart(sanitizeGeoLabel(input.regionCode));
  if (region) {
    return "region" as const;
  }

  return "country" as const;
}

function buildGeoClusterKey(input: {
  countryCode?: string | null;
  countryName?: string | null;
  regionCode?: string | null;
  cityName?: string | null;
  geoClusterKey?: string | null;
  geoGranularity?: "city" | "region" | "country";
}) {
  const country = normalizeClusterPart(input.countryCode) || "xx";
  const effectiveGranularity = inferEffectiveGeoGranularity(input);

  if (effectiveGranularity === "country") {
    return country;
  }

  const region = normalizeClusterPart(sanitizeGeoLabel(input.regionCode));
  if (effectiveGranularity === "region") {
    return region ? `${country}:${region}` : country;
  }

  const city = hasMeaningfulCityLabel(input)
    ? normalizeClusterPart(sanitizeGeoLabel(input.cityName))
    : "";

  if (city) return `${country}:${region || "na"}:${city}`;
  if (region) return `${country}:${region}`;
  return country;
}

function getCollisionProfile(zoom: number, density: number, totalMarkers: number) {
  const zoomStrength = clamp((zoom - 1) / 5.5, 0, 1);
  const densityStrength = clamp((density - 1) / 7, 0, 1);
  const markerStrength = clamp(totalMarkers / 120, 0, 1);
  const pressure = clamp(zoomStrength * 0.45 + densityStrength * 0.35 + markerStrength * 0.2, 0, 1);

  return {
    gapPx: COLLISION_TUNING.gapPx,
    iterations: Math.round(
      24 + (34 - 24) * pressure
    ),
    clusterIterations: Math.round(
      8 + (14 - 8) * pressure
    ),
    maxDisplacementPx: clamp(12 + zoom * 2.4 + densityStrength * 2.2, 14, 28),
  };
}

function makeSeedSalt() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0].toString(36);
  }
  return Math.random().toString(36).slice(2);
}

function normalizeLongitude(lng: number) {
  return ((lng + 540) % 360) - 180;
}

function shortestLongitudeDistance(a: number, b: number) {
  const aNorm = normalizeLongitude(a);
  const bNorm = normalizeLongitude(b);
  const raw = Math.abs(aNorm - bNorm);
  return Math.min(raw, 360 - raw);
}

function isAlbumInViewport(album: DiscoveryAlbum, viewport: DiscoveryViewport) {
  const lng = album.coordinates?.lng;
  const lat = album.coordinates?.lat;
  if (typeof lng !== "number" || typeof lat !== "number") {
    return false;
  }

  const lngCenter = (viewport.west + viewport.east) / 2;
  const lngHalfSpan = Math.max(0, (viewport.east - viewport.west) / 2);
  const latCenter = (viewport.south + viewport.north) / 2;
  const latHalfSpan = Math.max(0, (viewport.north - viewport.south) / 2);

  // Small geographic buffer prevents flicker near the viewport edge during quick pans/zooms.
  const lngBuffer = Math.max(1.5, lngHalfSpan * 0.04);
  const latBuffer = Math.max(1, latHalfSpan * 0.04);

  const lngVisible = shortestLongitudeDistance(lng, lngCenter) <= lngHalfSpan + lngBuffer;
  const latVisible = Math.abs(lat - latCenter) <= latHalfSpan + latBuffer;
  return lngVisible && latVisible;
}

type DiscoveryViewport = {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
};

type DiscoveryResponse = {
  albums: DiscoveryAlbum[];
};

type ApiErrorPayload = {
  error?:
    | string
    | {
        code?: string;
        message?: string;
        details?: unknown;
      };
};

function parseApiErrorMessage(payload: unknown, fallback: string) {
  const typed = payload as ApiErrorPayload;
  if (!typed?.error) {
    return fallback;
  }
  if (typeof typed.error === "string") {
    return typed.error;
  }
  return typed.error.message ?? fallback;
}

function getRecordYear(record: UserRecord) {
  if (record.releaseYear) {
    return record.releaseYear;
  }
  return new Date(record.listenAt).getFullYear();
}

// Deterministic hash to keep jitter stable between renders
function hashStringToInt(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function scatterCountryPoint(lng: number, lat: number, seed: string) {
  const hash = hashStringToInt(seed || "country-seed");
  const angle = ((hash % 360) * Math.PI) / 180;
  const radiusLng = 1.6 + ((hash >>> 7) % 260) / 100; // 1.6 ~ 4.2 deg
  const radiusLat = radiusLng * 0.58;

  return {
    lng: clamp(lng + Math.cos(angle) * radiusLng, -180, 180),
    lat: clamp(lat + Math.sin(angle) * radiusLat, -85, 85),
  };
}

function resolveMarkerCollisions<T extends { id: string; x: number; y: number; radius: number; clusterKey?: string }>(
  markers: T[],
  opts: {
    width: number;
    height: number;
    iterations?: number;
    clusterIterations?: number;
    gapPx?: number;
    maxDisplacementPx?: number;
  }
): Array<T & { x: number; y: number; anchorX: number; anchorY: number }> {
  if (markers.length <= 1) {
    return markers.map((marker) => ({
      ...marker,
      x: marker.x,
      y: marker.y,
      anchorX: marker.x,
      anchorY: marker.y,
    }));
  }

  const iterations = opts.iterations ?? 28;
  const clusterIterations = opts.clusterIterations ?? 10;
  const gapPx = opts.gapPx ?? 2;
  const maxDisplacementPx = opts.maxDisplacementPx ?? 28;

  const nodes = markers.map((marker) => ({
    ...marker,
    x: marker.x,
    y: marker.y,
    anchorX: marker.x,
    anchorY: marker.y,
  }));

  const nudgeFromId = (id: string) => {
    const hash = hashStringToInt(id || "seed");
    const angle = ((hash % 360) * Math.PI) / 180;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  };

  const clampNodeOffset = (node: { x: number; y: number; anchorX: number; anchorY: number }) => {
    const dx = node.x - node.anchorX;
    const dy = node.y - node.anchorY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= maxDisplacementPx || dist < 0.0001) return;
    const ratio = maxDisplacementPx / dist;
    node.x = node.anchorX + dx * ratio;
    node.y = node.anchorY + dy * ratio;
  };

  const resolveOverlap = (
    a: { id: string; x: number; y: number; radius: number },
    b: { id: string; x: number; y: number; radius: number },
    pushStrength: number
  ) => {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let distSq = dx * dx + dy * dy;
    const minDist = a.radius + b.radius + gapPx;

    if (distSq >= minDist * minDist) {
      return false;
    }

    if (distSq < 0.0001) {
      const nudge = nudgeFromId(`${a.id}:${b.id}`);
      dx = nudge.x;
      dy = nudge.y;
      distSq = 1;
    }

    const dist = Math.sqrt(distSq);
    const overlap = minDist - dist;
    const ux = dx / dist;
    const uy = dy / dist;

    a.x -= ux * overlap * pushStrength;
    a.y -= uy * overlap * pushStrength;
    b.x += ux * overlap * pushStrength;
    b.y += uy * overlap * pushStrength;
    return true;
  };

  // Deterministic cluster slotting keeps same-region markers separated and visually stable.
  const byCluster = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const key = node.clusterKey?.trim() || `single:${node.id}`;
    const list = byCluster.get(key) ?? [];
    list.push(node);
    byCluster.set(key, list);
  }

  const GOLDEN_ANGLE = 2.399963229728653;
  for (const [key, clusterNodes] of byCluster.entries()) {
    if (clusterNodes.length <= 1) continue;

    const sorted = [...clusterNodes].sort(
      (a, b) => hashStringToInt(`${key}:${a.id}`) - hashStringToInt(`${key}:${b.id}`)
    );
    const centerX = sorted.reduce((sum, node) => sum + node.anchorX, 0) / sorted.length;
    const centerY = sorted.reduce((sum, node) => sum + node.anchorY, 0) / sorted.length;
    const maxRadius = sorted.reduce((max, node) => Math.max(max, node.radius), 0);
    const spacing = maxRadius * 2 + gapPx + 1;
    const rotation = ((hashStringToInt(key) % 360) * Math.PI) / 180;

    for (let index = 0; index < sorted.length; index += 1) {
      const node = sorted[index];
      if (index === 0) {
        node.x = centerX;
        node.y = centerY;
      } else {
        const angle = rotation + index * GOLDEN_ANGLE;
        const radius = Math.sqrt(index) * spacing;
        node.x = centerX + Math.cos(angle) * radius;
        node.y = centerY + Math.sin(angle) * radius;
      }

      // Use slot positions as anchors so zooming does not cause violent re-shuffling.
      node.anchorX = node.x;
      node.anchorY = node.y;
    }
  }

  // Phase 1: prioritize small local spread inside the same city/region cluster.
  for (let iter = 0; iter < clusterIterations; iter += 1) {
    let moved = false;

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (!a.clusterKey || !b.clusterKey || a.clusterKey !== b.clusterKey) {
          continue;
        }
        moved = resolveOverlap(a, b, 0.54) || moved;
      }
    }

    for (const node of nodes) {
      node.x += (node.anchorX - node.x) * 0.14;
      node.y += (node.anchorY - node.y) * 0.14;
      clampNodeOffset(node);
    }

    if (!moved) {
      break;
    }
  }

  // Phase 2: global collision pass while preserving anchor semantics.
  for (let iter = 0; iter < iterations; iter += 1) {
    let moved = false;

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        moved = resolveOverlap(a, b, 0.5) || moved;
      }
    }

    for (const node of nodes) {
      node.x += (node.anchorX - node.x) * 0.12;
      node.y += (node.anchorY - node.y) * 0.12;
      clampNodeOffset(node);
    }

    if (!moved) {
      break;
    }
  }

  // Final guardrail: ensure same-region nodes do not end up visually stacked.
  for (let iter = 0; iter < 12; iter += 1) {
    let moved = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (!a.clusterKey || !b.clusterKey || a.clusterKey !== b.clusterKey) {
          continue;
        }
        moved = resolveOverlap(a, b, 0.64) || moved;
      }
    }

    for (const node of nodes) {
      clampNodeOffset(node);
    }

    if (!moved) {
      break;
    }
  }

  return nodes;
}

export function WorldMap({
  userRecords,
  isAuthenticated,
  userId,
  favorites,
  preferredCountries,
  yearRange,
  externalSelection,
  onExternalSelectionHandled,
  onToggleFavorite,
  onMarkHeard,
}: WorldMapProps) {
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    center: [number, number];
  } | null>(null);
  const panRafRef = useRef<number | null>(null);
  const pendingPanRef = useRef<{ dx: number; dy: number } | null>(null);

  const favoritesRef = useRef(favorites);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const onToggleFavoriteRef = useRef(onToggleFavorite);
  const onMarkHeardRef = useRef(onMarkHeard);

  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshSalt, setRefreshSalt] = useState<string>(() => makeSeedSalt());
  const [discoveryAlbums, setDiscoveryAlbums] = useState<DiscoveryAlbum[]>([]);
  const [viewport, setViewport] = useState<DiscoveryViewport | null>(null);
  const [worldGeographies, setWorldGeographies] = useState<GeoJSON.Feature[]>([]);
  const [viewCenter, setViewCenter] = useState<[number, number]>([20, 20]);
  const [zoom, setZoom] = useState(1.45);
  const [selectedDiscovery, setSelectedDiscovery] = useState<DiscoveryAlbum | null>(null);
  const [selectedUserRecordId, setSelectedUserRecordId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchArtist, setSearchArtist] = useState("");
  const [searchAlbum, setSearchAlbum] = useState("");
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(true);
  const [isCollisionPanelOpen, setIsCollisionPanelOpen] = useState(false);
  const [collisionTweaks, setCollisionTweaks] = useState<CollisionTweakState>(
    SHIPPING_COLLISION_TWEAKS
  );
  const [collisionPresetInput, setCollisionPresetInput] = useState("");
  const [collisionPresetStatus, setCollisionPresetStatus] = useState<string | null>(null);
  const [layerVisibility, setLayerVisibility] = useState(() =>
    isAuthenticated
      ? { roam: true, heard: false, favorites: true }
      : { roam: true, heard: false, favorites: false }
  );

  const prevAuthRef = useRef(isAuthenticated);

  const lastDiscoveryFetchRef = useRef<{
    center: [number, number];
    zoom: number;
    nonce: number;
    salt: string;
    minYear: number;
    maxYear: number;
    countriesSignature: string;
  } | null>(null);

  // userFeatureCollection is now defined below filteredUserRecords

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    try {
      const raw = window.localStorage.getItem(COLLISION_PRESET_STORAGE_KEY);
      if (!raw) {
        setCollisionPresetInput(JSON.stringify(SHIPPING_COLLISION_TWEAKS, null, 2));
        return;
      }
      const parsed = JSON.parse(raw) as Partial<CollisionTweakState>;
      const next = sanitizeCollisionTweaks(parsed);
      setCollisionTweaks(next);
      setCollisionPresetInput(JSON.stringify(next, null, 2));
      setCollisionPresetStatus("Loaded saved preset.");
    } catch {
      setCollisionPresetInput(JSON.stringify(SHIPPING_COLLISION_TWEAKS, null, 2));
      setCollisionPresetStatus("Preset parse failed, using shipping baseline.");
    }
  }, []);

  useEffect(() => {
    favoritesRef.current = favorites;
    isAuthenticatedRef.current = isAuthenticated;
    onToggleFavoriteRef.current = onToggleFavorite;
    onMarkHeardRef.current = onMarkHeard;
  }, [favorites, isAuthenticated, onMarkHeard, onToggleFavorite]);

  useEffect(() => {
    if (prevAuthRef.current === isAuthenticated) {
      return;
    }

    prevAuthRef.current = isAuthenticated;

    if (isAuthenticated) {
      setLayerVisibility({ roam: true, heard: false, favorites: true });
    } else {
      setLayerVisibility({ roam: true, heard: false, favorites: false });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorldGeometry() {
      const response = await fetch("/world-110m.json", { cache: "force-cache" });
      const topo = (await response.json()) as {
        objects: Record<string, object>;
      };

      const key = Object.keys(topo.objects)[0];
      const world = feature(topo as never, topo.objects[key] as never) as
        | GeoJSON.Feature
        | GeoJSON.FeatureCollection;
      const features =
        world.type === "FeatureCollection" ? world.features : [world];

      if (!cancelled) {
        setWorldGeographies(features);
      }
    }

    void loadWorldGeometry();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (panRafRef.current !== null) {
        cancelAnimationFrame(panRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const lngSpan = 240 / zoom;
    const latSpan = 120 / zoom;

    setViewport({
      west: viewCenter[0] - lngSpan / 2,
      east: viewCenter[0] + lngSpan / 2,
      south: Math.max(-85, viewCenter[1] - latSpan / 2),
      north: Math.min(85, viewCenter[1] + latSpan / 2),
      zoom,
    });
  }, [viewCenter, zoom]);

  useEffect(() => {
    if (!viewport) {
      return;
    }

    const activeViewport = viewport;

    // Skip refetch on small zoom or pan changes to keep markers stable while zooming
    const last = lastDiscoveryFetchRef.current;
    const centerLng = viewCenter[0];
    const centerLat = viewCenter[1];
    const smallMove =
      last &&
      Math.abs(centerLng - last.center[0]) < 0.8 &&
      Math.abs(centerLat - last.center[1]) < 0.8;
    const smallZoom = last && Math.abs(zoom - last.zoom) < 0.2;
    const yearUnchanged =
      last &&
      last.minYear === yearRange.min &&
      last.maxYear === yearRange.max;
    const countriesSignature = preferredCountries.slice().sort().join(",");
    const countriesUnchanged = last && last.countriesSignature === countriesSignature;

    // Allow refreshNonce to force a refetch even if movement/zoom is small.
    // Also refetch whenever year range or preferred countries change.
    if (
      last &&
      smallMove &&
      smallZoom &&
      last.nonce === refreshNonce &&
      last.salt === refreshSalt &&
      yearUnchanged &&
      countriesUnchanged
    ) {
      return;
    }

    let cancelled = false;

    async function loadDiscoveryAlbums() {
      try {
        const params = new URLSearchParams({
          west: String(activeViewport.west),
          south: String(activeViewport.south),
          east: String(activeViewport.east),
          north: String(activeViewport.north),
          zoom: String(activeViewport.zoom),
          minYear: String(yearRange.min),
          maxYear: String(yearRange.max),
          seed: `${refreshNonce}-${Math.round(centerLng * 100)}-${Math.round(centerLat * 100)}-${refreshSalt}`,
        });

        if (preferredCountries.length > 0) {
          params.set("countries", preferredCountries.join(","));
        }

        const response = await fetch(`/api/discovery?${params.toString()}`, {
          cache: "no-store",
        });

        const payload = (await response.json()) as DiscoveryResponse | ApiErrorPayload;
        if (!response.ok) {
          throw new Error(parseApiErrorMessage(payload, "加载随机专辑失败"));
        }

        if (!cancelled) {
          const incoming = (payload as DiscoveryResponse).albums ?? [];
          setDiscoveryAlbums((prev) => {
            const merged = new Map<string, DiscoveryAlbum>();

            for (const album of incoming) {
              merged.set(album.id, album);
            }

            // Keep any previously visible markers so rapid position switching does not blink them out.
            for (const album of prev) {
              if (!merged.has(album.id) && isAlbumInViewport(album, activeViewport)) {
                merged.set(album.id, album);
              }
            }

            return Array.from(merged.values()).slice(0, 20);
          });
          lastDiscoveryFetchRef.current = {
            center: [centerLng, centerLat],
            zoom,
            nonce: refreshNonce,
            salt: refreshSalt,
            minYear: yearRange.min,
            maxYear: yearRange.max,
            countriesSignature,
          };
        }
      } catch {
        // Keep current markers on transient request failure to avoid abrupt disappear/reappear flicker.
      }
    }

    void loadDiscoveryAlbums();

    return () => {
      cancelled = true;
    };
  }, [preferredCountries, refreshNonce, refreshSalt, viewport, viewCenter, zoom, yearRange.max, yearRange.min]);

  const projection = useMemo<GeoProjection>(() => {
    return geoNaturalEarth1()
      .translate([SVG_WIDTH / 2, SVG_HEIGHT / 2])
      .scale(220 * zoom)
      .center(viewCenter);
  }, [viewCenter, zoom]);

  const pathBuilder = useMemo(() => geoPath(projection), [projection]);

  const filteredAlbums = useMemo(() => {
    let baseAlbums = discoveryAlbums.filter(
      (album) =>
        album.releaseYear >= yearRange.min &&
        album.releaseYear <= yearRange.max
    );
    const selectedInYearRange =
      selectedDiscovery &&
      selectedDiscovery.releaseYear >= yearRange.min &&
      selectedDiscovery.releaseYear <= yearRange.max;

    if (selectedInYearRange && selectedDiscovery && !baseAlbums.some((a) => a.id === selectedDiscovery.id)) {
      baseAlbums = [...baseAlbums, selectedDiscovery];
    }

    const artistTerm = searchArtist.trim().toLowerCase();
    const albumTerm = searchAlbum.trim().toLowerCase();
    if (!artistTerm && !albumTerm) return baseAlbums;

    return baseAlbums.filter((album) => {
      const matchArtist = artistTerm ? album.artistName.toLowerCase().includes(artistTerm) : true;
      const matchAlbum = albumTerm ? album.albumTitle.toLowerCase().includes(albumTerm) : true;
      return matchArtist && matchAlbum;
    });
  }, [discoveryAlbums, searchArtist, searchAlbum, selectedDiscovery, yearRange.max, yearRange.min]);

  useEffect(() => {
    if (!selectedDiscovery) {
      return;
    }

    if (
      selectedDiscovery.releaseYear < yearRange.min ||
      selectedDiscovery.releaseYear > yearRange.max
    ) {
      setSelectedDiscovery(null);
    }
  }, [selectedDiscovery, yearRange.max, yearRange.min]);

  const filteredUserRecords = useMemo(() => {
    const artistTerm = searchArtist.trim().toLowerCase();
    const albumTerm = searchAlbum.trim().toLowerCase();
    if (!artistTerm && !albumTerm) return userRecords;

    return userRecords.filter((r) => {
      const matchArtist = artistTerm ? r.artistGeo.artistName.toLowerCase().includes(artistTerm) : true;
      const matchAlbum = albumTerm ? r.albumTitle.toLowerCase().includes(albumTerm) : true;
      return matchArtist && matchAlbum;
    });
  }, [userRecords, searchArtist, searchAlbum]);

  const filteredFavoriteAlbums = useMemo(() => {
    const artistTerm = searchArtist.trim().toLowerCase();
    const albumTerm = searchAlbum.trim().toLowerCase();

    return favorites.filter((album) => {
      if (
        album.releaseYear < yearRange.min ||
        album.releaseYear > yearRange.max ||
        !album.coordinates ||
        typeof album.coordinates.lng !== "number" ||
        typeof album.coordinates.lat !== "number"
      ) {
        return false;
      }

      const matchArtist = artistTerm
        ? album.artistName.toLowerCase().includes(artistTerm)
        : true;
      const matchAlbum = albumTerm
        ? album.albumTitle.toLowerCase().includes(albumTerm)
        : true;
      return matchArtist && matchAlbum;
    });
  }, [favorites, searchArtist, searchAlbum, yearRange.max, yearRange.min]);

  const visibleUserRecords = useMemo(() => {
    const base = layerVisibility.heard ? filteredUserRecords : [];
    if (selectedUserRecordId && !base.some(r => r.id === selectedUserRecordId)) {
      const rec = userRecords.find(r => r.id === selectedUserRecordId);
      if (rec) return [...base, rec];
    }
    return base;
  }, [filteredUserRecords, layerVisibility.heard, selectedUserRecordId, userRecords]);

  const visibleFavoriteAlbums = useMemo(
    () => (layerVisibility.favorites ? filteredFavoriteAlbums : []),
    [filteredFavoriteAlbums, layerVisibility.favorites]
  );

  const userMarkers = useMemo(() => {
    return visibleUserRecords
      .map((record) => {
        const lng = record.artistGeo.coordinates?.lng;
        const lat = record.artistGeo.coordinates?.lat;
        if (lng === undefined || lat === undefined) {
          return null;
        }

        const granularity = record.artistGeo.geoGranularity ?? "city";
        const displayCoords =
          granularity === "country"
            ? scatterCountryPoint(lng, lat, `${record.id}:${record.artistGeo.countryCode ?? "xx"}`)
            : { lng, lat };

        const year = getRecordYear(record);
        if (year < yearRange.min || year > yearRange.max) {
          return null;
        }

        return {
          lng: displayCoords.lng,
          lat: displayCoords.lat,
          id: record.id,
          props: {
            id: record.id,
            albumTitle: record.albumTitle,
            artistName: record.artistGeo.artistName,
            score: record.score,
            year,
            geoClusterKey: buildGeoClusterKey({
              countryCode: record.artistGeo.countryCode,
              countryName: record.artistGeo.countryName,
              regionCode: record.artistGeo.regionCode,
              cityName: record.artistGeo.cityName,
              geoGranularity: record.artistGeo.geoGranularity,
            }),
          },
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [visibleUserRecords, yearRange.max, yearRange.min]);

  const userRecordById = useMemo(() => {
    const map = new Map<string, (typeof userMarkers)[number]>();
    for (const marker of userMarkers) {
      map.set(marker.props.id, marker);
    }
    return map;
  }, [userMarkers]);

  const heardAlbumKeySet = useMemo(
    () => new Set(userRecords.map((record) => albumArtistKey(record.albumTitle, record.artistGeo.artistName))),
    [userRecords]
  );
  const favoriteAlbumKeySet = useMemo(
    () => new Set(favorites.map((album) => albumArtistKey(album.albumTitle, album.artistName))),
    [favorites]
  );


  const discoveryMarkers = useMemo(() => {
    let sourceAlbums = layerVisibility.roam ? filteredAlbums : [];
    if (selectedDiscovery && !sourceAlbums.some(a => a.id === selectedDiscovery.id)) {
      sourceAlbums = [...sourceAlbums, selectedDiscovery];
    }

    const filteredDiscovery = sourceAlbums.filter((album) => {
      const key = albumArtistKey(album.albumTitle, album.artistName);
      
      if (selectedDiscovery && album.id === selectedDiscovery.id) {
        const isHeard = heardAlbumKeySet.has(key);
        const isFav = favoriteAlbumKeySet.has(key);
        
        const willBeRenderedAsHeard = isHeard && layerVisibility.heard;
        const willBeRenderedAsFav = isFav && layerVisibility.favorites;
        
        if (!willBeRenderedAsHeard && !willBeRenderedAsFav) {
          return true;
        }
      }

      if (heardAlbumKeySet.has(key)) {
        return false;
      }
      if (favoriteAlbumKeySet.has(key)) {
        return false;
      }

      return true;
    });

    const artistDedupedDiscovery = pickOneAlbumPerArtist(
      filteredDiscovery,
      `${refreshNonce}:${refreshSalt}`,
      selectedDiscovery
    );

    return artistDedupedDiscovery
      .map((album) => {
        if (
          typeof album.coordinates?.lng !== "number" ||
          typeof album.coordinates?.lat !== "number"
        ) {
          return null;
        }
        return {
          lng: album.coordinates.lng,
          lat: album.coordinates.lat,
          id: album.id,
          clusterKey: buildGeoClusterKey({
            countryCode: album.countryCode,
            countryName: album.countryName,
            regionCode: album.regionCode,
            cityName: album.cityName,
            geoClusterKey: album.geoClusterKey,
            geoGranularity: album.geoGranularity,
          }),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [
    favoriteAlbumKeySet,
    filteredAlbums,
    heardAlbumKeySet,
    layerVisibility.roam,
    layerVisibility.heard,
    layerVisibility.favorites,
    refreshNonce,
    refreshSalt,
    selectedDiscovery,
  ]);

  const favoriteMarkers = useMemo(() => {
    return visibleFavoriteAlbums.map((album) => ({
      id: `favorite:${album.id}`,
      favoriteId: album.id,
      album,
      lng: album.coordinates.lng,
      lat: album.coordinates.lat,
      clusterKey: buildGeoClusterKey({
        countryCode: album.countryCode,
        countryName: album.countryName,
        regionCode: album.regionCode,
        cityName: album.cityName,
        geoClusterKey: album.geoClusterKey,
        geoGranularity: album.geoGranularity,
      }),
    }));
  }, [visibleFavoriteAlbums]);

  const favoriteMarkerById = useMemo(() => {
    const map = new Map<string, (typeof favoriteMarkers)[number]>();
    for (const marker of favoriteMarkers) {
      map.set(marker.favoriteId, marker);
    }
    return map;
  }, [favoriteMarkers]);

  const discoveryMarkerById = useMemo(() => {
    const map = new Map<string, (typeof discoveryMarkers)[number]>();
    for (const marker of discoveryMarkers) {
      map.set(marker.id, marker);
    }
    return map;
  }, [discoveryMarkers]);

  const discoveryAlbumById = useMemo(() => {
    const map = new Map<string, DiscoveryAlbum>();
    for (const album of filteredAlbums) {
      map.set(album.id, album);
    }
    return map;
  }, [filteredAlbums]);

  // Marker sizes adapt to zoom and density: fewer markers -> larger; more markers -> smaller and tighter
  // We use the base count across all filtered lists BEFORE layer toggles are considered,
  // so that icons maintain a stable size even as layers are toggled on and off.
  const targetTotalMarkers = useMemo(() => {
    let roamCount = 0;
    for (const album of filteredAlbums) {
      const key = albumArtistKey(album.albumTitle, album.artistName);
      if (heardAlbumKeySet.has(key)) continue;
      if (favoriteAlbumKeySet.has(key)) continue;
      roamCount++;
    }
    return roamCount + filteredFavoriteAlbums.length;
  }, [filteredAlbums, filteredFavoriteAlbums.length, heardAlbumKeySet, favoriteAlbumKeySet]);

  const totalMarkers = targetTotalMarkers;
  
  const density = Math.max(1, Math.sqrt(totalMarkers || 1));
  const zoomScale = 0.9 + zoom * 0.3; // grow with zoom

  const discoveryMarkerSize = useMemo(() => {
    const base = 44 * zoomScale;
    const size = base / (1 + (density - 1) * 0.28);
    return clamp(size, 34, MAX_DISCOVERY_SIZE);
  }, [zoomScale, density]);

  const userMarkerSize = useMemo(() => {
    const base = 34 * zoomScale;
    const size = base / (1 + (density - 1) * 0.25);
    return clamp(size, 26, MAX_USER_SIZE);
  }, [zoomScale, density]);

  const collisionProfile = useMemo(() => {
    const base = getCollisionProfile(zoom, density, totalMarkers);
    return {
      iterations: clamp(
        base.iterations + collisionTweaks.iterationsOffset,
        COLLISION_TUNING.baseIterations - 10,
        COLLISION_TUNING.maxIterations + 18
      ),
      clusterIterations: clamp(
        base.clusterIterations + collisionTweaks.clusterIterationsOffset,
        4,
        COLLISION_TUNING.maxClusterIterations + 12
      ),
      gapPx: clamp(collisionTweaks.gapPx, 1, 8),
      maxDisplacementPx: clamp(
        base.maxDisplacementPx + collisionTweaks.maxDisplacementOffset,
        12,
        52
      ),
    };
  }, [zoom, density, totalMarkers, collisionTweaks]);

  const activeCollisionPresetJson = useMemo(
    () => JSON.stringify(collisionTweaks, null, 2),
    [collisionTweaks]
  );

  async function copyCollisionPreset() {
    try {
      await navigator.clipboard.writeText(activeCollisionPresetJson);
      setCollisionPresetStatus("Preset JSON copied.");
    } catch {
      setCollisionPresetStatus("Copy failed.");
    }
  }

  function saveCollisionPreset() {
    try {
      window.localStorage.setItem(COLLISION_PRESET_STORAGE_KEY, activeCollisionPresetJson);
      setCollisionPresetStatus("Preset saved.");
    } catch {
      setCollisionPresetStatus("Save failed.");
    }
  }

  function clearSavedCollisionPreset() {
    try {
      window.localStorage.removeItem(COLLISION_PRESET_STORAGE_KEY);
      setCollisionPresetStatus("Saved preset cleared.");
    } catch {
      setCollisionPresetStatus("Clear failed.");
    }
  }

  function applyCollisionPresetFromInput() {
    try {
      const parsed = JSON.parse(collisionPresetInput) as Partial<CollisionTweakState>;
      const sanitized = sanitizeCollisionTweaks(parsed);
      setCollisionTweaks(sanitized);
      setCollisionPresetInput(JSON.stringify(sanitized, null, 2));
      setCollisionPresetStatus("Preset applied.");
    } catch {
      setCollisionPresetStatus("Invalid preset JSON.");
    }
  }

  const jitteredGlobalMarkers = useMemo(() => {
    const VIEWPORT_BUFFER_PX = 80;

    const combined = [
      ...userMarkers
        .map((marker) => {
          const projected = projection([marker.lng, marker.lat]);
          if (!projected) return null;
          if (
            projected[0] < -VIEWPORT_BUFFER_PX ||
            projected[0] > SVG_WIDTH + VIEWPORT_BUFFER_PX ||
            projected[1] < -VIEWPORT_BUFFER_PX ||
            projected[1] > SVG_HEIGHT + VIEWPORT_BUFFER_PX
          ) {
            return null;
          }
          return {
            id: `user:${marker.props.id}`,
            sourceId: marker.props.id,
            layer: "user" as const,
            x: projected[0],
            y: projected[1],
            radius: userMarkerSize / 2,
            clusterKey: marker.props.geoClusterKey,
          };
        })
        .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker)),
      ...discoveryMarkers
        .map((marker) => {
          const projected = projection([marker.lng, marker.lat]);
          if (!projected) return null;
          if (
            projected[0] < -VIEWPORT_BUFFER_PX ||
            projected[0] > SVG_WIDTH + VIEWPORT_BUFFER_PX ||
            projected[1] < -VIEWPORT_BUFFER_PX ||
            projected[1] > SVG_HEIGHT + VIEWPORT_BUFFER_PX
          ) {
            return null;
          }
          const selectedMultiplier = selectedDiscovery?.id === marker.id ? 1.4 : 1;
          return {
            id: `discovery:${marker.id}`,
            sourceId: marker.id,
            layer: "discovery" as const,
            x: projected[0],
            y: projected[1],
            radius: (discoveryMarkerSize * selectedMultiplier) / 2,
            clusterKey: marker.clusterKey,
          };
        })
        .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker)),
      ...favoriteMarkers
        .map((marker) => {
          const projected = projection([marker.lng, marker.lat]);
          if (!projected) return null;
          if (
            projected[0] < -VIEWPORT_BUFFER_PX ||
            projected[0] > SVG_WIDTH + VIEWPORT_BUFFER_PX ||
            projected[1] < -VIEWPORT_BUFFER_PX ||
            projected[1] > SVG_HEIGHT + VIEWPORT_BUFFER_PX
          ) {
            return null;
          }
          const selectedMultiplier = selectedDiscovery?.id === marker.favoriteId ? 1.4 : 1;
          return {
            id: `favorite:${marker.favoriteId}`,
            sourceId: marker.favoriteId,
            layer: "favorite" as const,
            x: projected[0],
            y: projected[1],
            radius: (discoveryMarkerSize * selectedMultiplier) / 2,
            clusterKey: marker.clusterKey,
          };
        })
        .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker)),
    ];

    return resolveMarkerCollisions(combined, {
      width: SVG_WIDTH,
      height: SVG_HEIGHT,
      iterations: collisionProfile.iterations,
      clusterIterations: collisionProfile.clusterIterations,
      gapPx: collisionProfile.gapPx,
      maxDisplacementPx: collisionProfile.maxDisplacementPx,
    });
  }, [collisionProfile, discoveryMarkerSize, discoveryMarkers, favoriteMarkers, projection, selectedDiscovery?.id, userMarkerSize, userMarkers]);

  const jitteredMarkerBuckets = useMemo(() => {
    const users: Array<{
      id: string;
      sourceId: string;
      layer: "user";
      x: number;
      y: number;
      radius: number;
      anchorX: number;
      anchorY: number;
      clusterKey?: string;
      props: (typeof userMarkers)[number]["props"];
    }> = [];
    const discoveries: Array<{
      id: string;
      sourceId: string;
      layer: "discovery";
      x: number;
      y: number;
      radius: number;
      anchorX: number;
      anchorY: number;
      clusterKey?: string;
    }> = [];
    const favoritesBucket: Array<{
      id: string;
      sourceId: string;
      layer: "favorite";
      x: number;
      y: number;
      radius: number;
      anchorX: number;
      anchorY: number;
      clusterKey?: string;
      album: (typeof favoriteMarkers)[number]["album"];
      favoriteId: string;
    }> = [];

    for (const marker of jitteredGlobalMarkers) {
      if (marker.layer === "user") {
        const source = userRecordById.get(marker.sourceId);
        if (source) {
          users.push({ ...marker, layer: "user", props: source.props });
        }
        continue;
      }

      if (marker.layer === "discovery") {
        const source = discoveryMarkerById.get(marker.sourceId);
        if (source) {
          discoveries.push({ ...marker, layer: "discovery", id: source.id });
        }
        continue;
      }

      const source = favoriteMarkerById.get(marker.sourceId);
      if (source) {
        favoritesBucket.push({
          ...marker,
          layer: "favorite",
          album: source.album,
          favoriteId: source.favoriteId,
        });
      }
    }

    return {
      users,
      discoveries,
      favorites: favoritesBucket,
    };
  }, [discoveryMarkerById, favoriteMarkerById, jitteredGlobalMarkers, userRecordById]);

  const jitteredDiscoveryMarkers = jitteredMarkerBuckets.discoveries;
  const jitteredFavoriteMarkers = jitteredMarkerBuckets.favorites;

  const userRecordByRecordId = useMemo(() => {
    const map = new Map<string, UserRecord>();
    for (const record of userRecords) {
      map.set(record.id, record);
    }
    return map;
  }, [userRecords]);

  const selectedUserRecord = useMemo(
    () => (selectedUserRecordId ? userRecordByRecordId.get(selectedUserRecordId) ?? null : null),
    [selectedUserRecordId, userRecordByRecordId]
  );

  // Respond to external selection (e.g., from Library drawer)
  useEffect(() => {
    if (!externalSelection) return;

    if (externalSelection.type === "discovery") {
      const album = externalSelection.album;
      setSelectedDiscovery(album);
      setSelectedUserRecordId(null);
      if (album.coordinates) {
        setViewCenter([album.coordinates.lng, album.coordinates.lat]);
        setZoom((prev) => Math.max(prev, 2.6));
      }
    } else if (externalSelection.type === "user") {
      const record = externalSelection.record;
      setSelectedUserRecordId(record.id);
      setSelectedDiscovery(null);
      const lng = record.artistGeo.coordinates?.lng;
      const lat = record.artistGeo.coordinates?.lat;
      if (lng !== undefined && lat !== undefined) {
        setViewCenter([lng, lat]);
        setZoom((prev) => Math.max(prev, 2.6));
      }
    }

    onExternalSelectionHandled?.();
  }, [externalSelection, onExternalSelectionHandled]);

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    if (event.cancelable) {
      event.preventDefault();
    }
    const delta = event.deltaY > 0 ? -0.12 : 0.12;
    setZoom((prev) => Math.min(8, Math.max(1, prev + delta)));
  }

  function handleMouseDown(event: React.MouseEvent<SVGSVGElement>) {
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      center: viewCenter,
    };
  }

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    if (!dragStateRef.current) {
      return;
    }

    pendingPanRef.current = {
      dx: event.clientX - dragStateRef.current.startX,
      dy: event.clientY - dragStateRef.current.startY,
    };

    if (panRafRef.current !== null) return;

    panRafRef.current = requestAnimationFrame(() => {
      panRafRef.current = null;
      if (!dragStateRef.current || !pendingPanRef.current) return;

      const { dx, dy } = pendingPanRef.current;
      const nextLng = dragStateRef.current.center[0] - dx * (0.16 / zoom);
      const nextLat = dragStateRef.current.center[1] + dy * (0.12 / zoom);

      setViewCenter([
        ((nextLng + 540) % 360) - 180,
        Math.max(-75, Math.min(75, nextLat)),
      ]);

      pendingPanRef.current = null;
    });
  }

  function handleMouseUp() {
    dragStateRef.current = null;
    if (panRafRef.current !== null) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    }
    pendingPanRef.current = null;
  }

  const isSelectedDiscoveryHeard = useMemo(() => {
    if (!selectedDiscovery) return false;
    const selectedKey = albumArtistKey(selectedDiscovery.albumTitle, selectedDiscovery.artistName);
    return userRecords.some((r) => albumArtistKey(r.albumTitle, r.artistGeo.artistName) === selectedKey);
  }, [userRecords, selectedDiscovery]);

  function toggleDiscoverySelection(album: DiscoveryAlbum, focus = true) {
    setSelectedDiscovery(album);
    setSelectedUserRecordId(null);

    if (focus && album.coordinates) {
      setViewCenter([album.coordinates.lng, album.coordinates.lat]);
      setZoom((prev) => Math.max(prev, 2.6));
    }
  }

  function toggleUserRecordSelection(recordId: string, focus = true) {
    setSelectedDiscovery(null);
    setSelectedUserRecordId(recordId);

    if (!focus) {
      return;
    }

    const record = userRecordByRecordId.get(recordId);
    const lng = record?.artistGeo.coordinates?.lng;
    const lat = record?.artistGeo.coordinates?.lat;
    if (lng !== undefined && lat !== undefined) {
      setViewCenter([lng, lat]);
      setZoom((prev) => Math.max(prev, 2.6));
    }
  }

  return (
    <div className="relative w-full h-full">
      <div className="absolute left-6 top-24 z-10 flex flex-col gap-2 pointer-events-none">
        {isAuthenticated ? (
          <div className="pointer-events-auto self-start flex gap-1 rounded-full border border-white/[0.06] bg-black/50 p-1 shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-300">
            <button
              onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
              title="切换图层面板"
              className="group flex items-center justify-center rounded-full px-3 py-1.5 text-[13px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-70 group-hover:opacity-100"
              >
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              <svg
                className={`ml-1 h-3.5 w-3.5 transition-transform duration-300 ${isFiltersExpanded ? "" : "rotate-90"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div
              className={`flex items-center overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                isFiltersExpanded ? "max-w-[400px] gap-1 opacity-100 px-1" : "max-w-0 gap-0 opacity-0 px-0"
              }`}
            >
              {[
                {
                  key: "roam",
                  label: "漫游",
                  active: layerVisibility.roam,
                  activeClass: "bg-cyan-500/20 text-cyan-200 shadow-[inset_0_1px_1px_rgba(34,211,238,0.2)] border-cyan-500/30",
                  indicatorClass: "bg-cyan-400"
                },
                {
                  key: "favorites",
                  label: "喜欢",
                  active: layerVisibility.favorites,
                  activeClass: "bg-pink-500/20 text-pink-200 shadow-[inset_0_1px_1px_rgba(244,114,182,0.2)] border-pink-500/30",
                  indicatorClass: "bg-pink-400"
                },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    setLayerVisibility((prev) => ({
                      ...prev,
                      [item.key]: !prev[item.key as keyof typeof prev],
                    }))
                  }
                  className={`relative flex items-center shrink-0 justify-center rounded-full border border-transparent px-4 py-1.5 text-xs font-medium tracking-wide transition-all duration-300 ease-out ${
                    item.active
                      ? item.activeClass
                      : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                  }`}
                >
                  {item.label}
                  {item.active && (
                    <span
                      className={`absolute -bottom-[1px] left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-t-full opacity-60 ${item.indicatorClass}`}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <MapControls
        zoom={zoom}
        onZoomChange={setZoom}
        onSearchClick={() => setIsSearchOpen(true)}
        showSearch={!!userId}
        onRefresh={() => {
          setRefreshSalt(makeSeedSalt());
          setRefreshNonce((value) => value + 1);
        }}
        className="absolute right-6 top-1/2 -translate-y-1/2 z-20"
      />

      {!isSearchOpen ? (
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="absolute right-24 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/[0.08] bg-black/50 px-3.5 py-2 text-xs font-medium text-zinc-300 backdrop-blur-xl transition-all hover:bg-white/[0.06] hover:text-white hover:border-white/20 shadow-2xl shadow-black/30 active:scale-95"
          title="Search artists or albums"
        >
          <span className="inline-flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />
            Search artists/albums
          </span>
        </button>
      ) : null}

      {process.env.NODE_ENV !== "production" ? (
        <div className="absolute right-6 top-24 z-30 pointer-events-auto">
          {!isCollisionPanelOpen ? (
            <button
              onClick={() => setIsCollisionPanelOpen(true)}
              className="rounded-full border border-amber-500/40 bg-black/60 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-amber-200 shadow-lg backdrop-blur hover:bg-black/75"
            >
              Collision Tuning
            </button>
          ) : (
            <div className="w-[320px] rounded-xl border border-white/15 bg-black/75 p-3 text-zinc-200 shadow-2xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-200">
                  Collision Tuning
                </p>
                <button
                  onClick={() => setIsCollisionPanelOpen(false)}
                  className="text-[10px] text-zinc-400 hover:text-zinc-100"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3 text-[11px]">
                <label className="block">
                  <div className="mb-1 flex items-center justify-between">
                    <span>Iterations Offset</span>
                    <span className="text-cyan-300">{collisionTweaks.iterationsOffset}</span>
                  </div>
                  <input
                    type="range"
                    min={-10}
                    max={18}
                    step={1}
                    value={collisionTweaks.iterationsOffset}
                    onChange={(e) =>
                      setCollisionTweaks((prev) => ({
                        ...prev,
                        iterationsOffset: Number(e.target.value),
                      }))
                    }
                    className="w-full"
                  />
                </label>

                <label className="block">
                  <div className="mb-1 flex items-center justify-between">
                    <span>Cluster Iterations Offset</span>
                    <span className="text-cyan-300">{collisionTweaks.clusterIterationsOffset}</span>
                  </div>
                  <input
                    type="range"
                    min={-6}
                    max={12}
                    step={1}
                    value={collisionTweaks.clusterIterationsOffset}
                    onChange={(e) =>
                      setCollisionTweaks((prev) => ({
                        ...prev,
                        clusterIterationsOffset: Number(e.target.value),
                      }))
                    }
                    className="w-full"
                  />
                </label>

                <label className="block">
                  <div className="mb-1 flex items-center justify-between">
                    <span>Gap Px</span>
                    <span className="text-cyan-300">{collisionTweaks.gapPx.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    step={0.25}
                    value={collisionTweaks.gapPx}
                    onChange={(e) =>
                      setCollisionTweaks((prev) => ({
                        ...prev,
                        gapPx: Number(e.target.value),
                      }))
                    }
                    className="w-full"
                  />
                </label>

                <label className="block">
                  <div className="mb-1 flex items-center justify-between">
                    <span>Displacement Offset</span>
                    <span className="text-cyan-300">{collisionTweaks.maxDisplacementOffset}</span>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={20}
                    step={1}
                    value={collisionTweaks.maxDisplacementOffset}
                    onChange={(e) =>
                      setCollisionTweaks((prev) => ({
                        ...prev,
                        maxDisplacementOffset: Number(e.target.value),
                      }))
                    }
                    className="w-full"
                  />
                </label>
              </div>

              <div className="mt-3 space-y-2 text-[10px] text-zinc-400">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    Active: {collisionProfile.iterations}/{collisionProfile.clusterIterations} / gap {collisionProfile.gapPx.toFixed(1)} / disp {collisionProfile.maxDisplacementPx.toFixed(0)}
                  </span>
                  <button
                    onClick={() => {
                      setCollisionTweaks(SHIPPING_COLLISION_TWEAKS);
                      setCollisionPresetInput(JSON.stringify(SHIPPING_COLLISION_TWEAKS, null, 2));
                      setCollisionPresetStatus("Shipping baseline applied.");
                    }}
                    className="rounded bg-white/10 px-2 py-1 text-zinc-200 hover:bg-white/20"
                  >
                    Baseline
                  </button>
                </div>

                <textarea
                  value={collisionPresetInput}
                  onChange={(e) => setCollisionPresetInput(e.target.value)}
                  className="h-24 w-full resize-none rounded border border-white/15 bg-black/45 p-2 font-mono text-[10px] text-zinc-200"
                />

                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => void copyCollisionPreset()}
                    className="rounded bg-white/10 px-2 py-1 text-zinc-200 hover:bg-white/20"
                  >
                    Copy
                  </button>
                  <button
                    onClick={saveCollisionPreset}
                    className="rounded bg-white/10 px-2 py-1 text-zinc-200 hover:bg-white/20"
                  >
                    Save
                  </button>
                  <button
                    onClick={applyCollisionPresetFromInput}
                    className="rounded bg-cyan-500/20 px-2 py-1 text-cyan-200 hover:bg-cyan-500/30"
                  >
                    Apply
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    onClick={clearSavedCollisionPreset}
                    className="rounded bg-white/5 px-2 py-1 text-zinc-300 hover:bg-white/15"
                  >
                    Clear Saved
                  </button>
                  {collisionPresetStatus ? <span>{collisionPresetStatus}</span> : null}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => {
          setIsSearchOpen(false);
          setSearchArtist("");
          setSearchAlbum("");
        }}
        artistQuery={searchArtist}
        albumQuery={searchAlbum}
        onArtistQueryChange={setSearchArtist}
        onAlbumQueryChange={setSearchAlbum}
        userRecords={userRecords}
        userId={userId}
        onSelectDiscovery={(album) => {
          setIsSearchOpen(false);
          setSearchArtist("");
          setSearchAlbum("");
          toggleDiscoverySelection(album, true);
        }}
        onSelectUserRecord={(record) => {
          setIsSearchOpen(false);
          setSearchArtist("");
          setSearchAlbum("");
          toggleUserRecordSelection(record.id, true);
        }}
      />

      <div className="w-full h-full bg-[#0c0c0c] relative overflow-hidden">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid slice"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <rect x={0} y={0} width={SVG_WIDTH} height={SVG_HEIGHT} fill="#0c0c0c" />
          <MemoizedGeographies geographies={worldGeographies} pathBuilder={pathBuilder} />
        </svg>

        {/* Overlay Layer for Markers */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {jitteredDiscoveryMarkers.map((marker) => {
              const album = discoveryAlbumById.get(marker.id);
              if (!album) return null;

              // Use standard div for positioning. Only animate entry if critical, but for performance
              // on large sets, removing AnimatePresence/motion for individual markers is better.
              // Here we keep it simple: just position.
              return (
                <div
                  key={marker.id}
                  className="absolute will-change-[top,left]"
                  style={{
                    left: `${(marker.x / SVG_WIDTH) * 100}%`,
                    top: `${(marker.y / SVG_HEIGHT) * 100}%`,
                    transform: "translate(-50%, -50%)"
                  }}
                >
                    <AlbumMarker
                      data={album}
                      size={discoveryMarkerSize}
                      isSelected={selectedDiscovery?.id === marker.id}
                      onClick={() => {
                        toggleDiscoverySelection(album, true);
                      }}
                    />
                </div>
              );
            })}

            {jitteredFavoriteMarkers.map((marker) => (
              <div
                key={`fav-${marker.favoriteId}`}
                className="absolute will-change-[top,left]"
                style={{
                  left: `${(marker.x / SVG_WIDTH) * 100}%`,
                  top: `${(marker.y / SVG_HEIGHT) * 100}%`,
                  transform: "translate(-50%, -50%)"
                }}
              >
                <div className="relative">
                  <AlbumMarker
                    data={marker.album}
                    size={discoveryMarkerSize}
                    isSelected={selectedDiscovery ? isSameAlbumSelection(selectedDiscovery, marker.album) : false}
                    onClick={() => {
                      toggleDiscoverySelection(marker.album, true);
                    }}
                  />
                  <span className="pointer-events-none absolute -right-1.5 -top-1.5 rounded-full bg-[#8a4a5a]/80 px-1.5 text-[9px] font-bold text-white ring-1 ring-white/10">
                    ♥
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {selectedDiscovery ? (
          <motion.div
            key={`discovery-popup-${selectedDiscovery.id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 left-3 right-3 z-[60] w-auto rounded-lg border border-white/[0.06] bg-[#141414] p-4 shadow-xl shadow-black/40 sm:bottom-auto sm:left-6 sm:right-auto sm:top-40 sm:w-[300px]"
          >
            <button
              type="button"
              aria-label="Close popup"
              onClick={() => setSelectedDiscovery(null)}
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.06] bg-[#1c1c1c] text-[#5a5854] transition-all hover:bg-[#242424] hover:text-[#ece8e1]"
            >
              <X className="h-2.5 w-2.5" strokeWidth={2} />
            </button>
            <div className="flex gap-3">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-black/40 relative border border-white/[0.04]">
                <AlbumArtImage
                  artist={selectedDiscovery.artistName}
                  album={selectedDiscovery.albumTitle}
                  className="absolute inset-0 w-full h-full"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-serif font-semibold truncate text-[#ece8e1] text-sm">{selectedDiscovery.albumTitle}</p>
                <p className="text-[#5a5854] truncate text-xs mt-0.5">{selectedDiscovery.artistName}</p>
                <p className="text-[#5a5854] text-[10px] mt-1 tabular-nums font-mono">
                  {selectedDiscovery.releaseYear} · {selectedDiscovery.countryCode}/{selectedDiscovery.cityName}
                </p>
              </div>
            </div>

            <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                 void onMarkHeardRef.current(selectedDiscovery);
              }}
              disabled={!isAuthenticatedRef.current}
              className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isSelectedDiscoveryHeard
                  ? "bg-[#8a4a5a]/20 text-[#8a4a5a]/80 hover:bg-[#8a4a5a]/30"
                  : "bg-[#4a8a6a]/20 text-[#4a8a6a]/80 hover:bg-[#4a8a6a]/30 border border-[#4a8a6a]/10"
              }`}
            >
              {!isAuthenticatedRef.current ? "Login to mark" : isSelectedDiscoveryHeard ? "Heard (Undo)" : "Mark Heard"}
            </button>
            <button
              type="button"
              onClick={() => onToggleFavoriteRef.current(selectedDiscovery)}
              className="flex-1 rounded-md bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-[#5a5854] transition-all hover:bg-white/[0.06] hover:text-[#ece8e1] border border-white/[0.04]"
            >
              {favoritesRef.current.some(f =>
                  f.id === selectedDiscovery.id ||
                  (f.albumTitle === selectedDiscovery.albumTitle && f.artistName === selectedDiscovery.artistName)
                ) ? "Unfavorite" : "Favorite"}
            </button>
          </div>
          </motion.div>
      ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
      {selectedUserRecord ? (
        <motion.div
            key={`user-record-popup-${selectedUserRecord.id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 left-3 right-3 z-[60] w-auto rounded-lg border border-white/[0.06] bg-[#141414] p-4 shadow-xl shadow-black/40 sm:bottom-auto sm:left-6 sm:right-auto sm:top-40 sm:w-[300px]"
        >
          <button
            type="button"
            aria-label="Close popup"
            onClick={() => setSelectedUserRecordId(null)}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.06] bg-[#1c1c1c] text-[#5a5854] transition-all hover:bg-[#242424] hover:text-[#ece8e1]"
          >
            <X className="h-2.5 w-2.5" strokeWidth={2} />
          </button>
          <div className="flex gap-3 items-center">
            <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full ring-2 ring-[#4a8a6a]/50 ring-offset-1 ring-offset-[#0c0c0c] relative">
              <AlbumArtImage
                artist={selectedUserRecord.artistGeo.artistName}
                album={selectedUserRecord.albumTitle}
                className="absolute inset-0 w-full h-full"
              />
            </div>
            <div>
              <p className="font-serif font-semibold text-sm text-[#4a8a6a]/90">{selectedUserRecord.albumTitle}</p>
              <p className="text-[#5a5854] text-xs mt-0.5">{selectedUserRecord.artistGeo.artistName}</p>
              <p className="text-[#5a5854] text-[10px] mt-0.5 tabular-nums font-mono">
                  {getRecordYear(selectedUserRecord)}
              </p>
            </div>
          </div>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </div>
  );
}
