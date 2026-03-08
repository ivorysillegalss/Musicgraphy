"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";

import { motion, AnimatePresence } from "framer-motion";

import type { DiscoveryAlbum } from "@/lib/discovery-catalog";
import type { UserRecord } from "@/lib/types";
import { AlbumMarker, UserRecordMarker } from "@/components/ui/map-marker/album-marker";
import { AlbumArtImage } from "@/components/ui/album-art-image";
import { MemoizedGeographies } from "@/components/ui/memoized-geographies";
import { MapControls } from "@/components/ui/map-controls";
import { SearchOverlay } from "@/components/ui/search-overlay";

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeCompareValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function albumArtistKey(albumTitle: string, artistName: string) {
  return `${normalizeCompareValue(albumTitle)}::${normalizeCompareValue(artistName)}`;
}

function albumTitleKey(albumTitle: string) {
  return normalizeCompareValue(albumTitle);
}

function makeSeedSalt() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0].toString(36);
  }
  return Math.random().toString(36).slice(2);
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

function resolveMarkerCollisions<T extends { id: string; x: number; y: number; radius: number }>(
  markers: T[],
  opts: {
    width: number;
    height: number;
    iterations?: number;
    gapPx?: number;
  }
): Array<T & { x: number; y: number; anchorX: number; anchorY: number }> {
  const iterations = opts.iterations ?? 28;
  const gapPx = opts.gapPx ?? 2;

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

  for (let iter = 0; iter < iterations; iter += 1) {
    let moved = false;

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distSq = dx * dx + dy * dy;
        const minDist = a.radius + b.radius + gapPx;

        if (distSq >= minDist * minDist) {
          continue;
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

        a.x -= ux * overlap * 0.5;
        a.y -= uy * overlap * 0.5;
        b.x += ux * overlap * 0.5;
        b.y += uy * overlap * 0.5;
        moved = true;
      }
    }

    for (const node of nodes) {
      node.x += (node.anchorX - node.x) * 0.08;
      node.y += (node.anchorY - node.y) * 0.08;
    }

    if (!moved) {
      break;
    }
  }

  return nodes;
}

function toUserFeatureCollection(
  records: UserRecord[],
  yearRange: { min: number; max: number }
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: records
      .filter((record) => {
        const lng = record.artistGeo.coordinates?.lng;
        const lat = record.artistGeo.coordinates?.lat;
        if (lng === undefined || lat === undefined) {
          return false;
        }
        const year = getRecordYear(record);
        return year >= yearRange.min && year <= yearRange.max;
      })
      .map((record) => {
        const lng = record.artistGeo.coordinates?.lng;
        const lat = record.artistGeo.coordinates?.lat;
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lng!, lat!],
          },
          properties: {
            id: record.id,
            albumTitle: record.albumTitle,
            artistName: record.artistGeo.artistName,
            score: record.score,
            year: getRecordYear(record),
          },
        };
      }),
  };
}

function toDiscoveryFeatureCollection(albums: DiscoveryAlbum[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: albums
      .filter(album => album.coordinates && typeof album.coordinates.lng === 'number' && typeof album.coordinates.lat === 'number')
      .map((album) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [album.coordinates.lng, album.coordinates.lat],
        },
        properties: {
          id: album.id,
        },
      })),
  };
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
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    center: [number, number];
  } | null>(null);
  const panRafRef = useRef<number | null>(null);
  const pendingPanRef = useRef<{ dx: number; dy: number } | null>(null);

  const albumsRef = useRef<DiscoveryAlbum[]>([]);
  const favoritesRef = useRef(favorites);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const onToggleFavoriteRef = useRef(onToggleFavorite);
  const onMarkHeardRef = useRef(onMarkHeard);

  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshSalt, setRefreshSalt] = useState<string>(() => makeSeedSalt());
  const [isLoadingDiscovery, setIsLoadingDiscovery] = useState(false);
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
  const [layerVisibility, setLayerVisibility] = useState(() =>
    isAuthenticated
      ? { roam: true, heard: true, favorites: true }
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
    favoritesRef.current = favorites;
    isAuthenticatedRef.current = isAuthenticated;
    onToggleFavoriteRef.current = onToggleFavorite;
    onMarkHeardRef.current = onMarkHeard;
  }, [favorites, isAuthenticated, onMarkHeard, onToggleFavorite]);

  useEffect(() => {
    albumsRef.current = discoveryAlbums;
  }, [discoveryAlbums]);

  useEffect(() => {
    if (prevAuthRef.current === isAuthenticated) {
      return;
    }

    prevAuthRef.current = isAuthenticated;

    if (isAuthenticated) {
      setLayerVisibility({ roam: true, heard: true, favorites: true });
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
      setIsLoadingDiscovery(true);

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
          setDiscoveryAlbums((payload as DiscoveryResponse).albums ?? []);
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
        if (!cancelled) {
          setDiscoveryAlbums([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDiscovery(false);
        }
      }
    }

    void loadDiscoveryAlbums();

    return () => {
      cancelled = true;
    };
  }, [preferredCountries, refreshNonce, viewport, viewCenter, zoom, yearRange.max, yearRange.min]);

  const projection = useMemo<GeoProjection>(() => {
    return geoNaturalEarth1()
      .translate([SVG_WIDTH / 2, SVG_HEIGHT / 2])
      .scale(220 * zoom)
      .center(viewCenter);
  }, [viewCenter, zoom]);

  const pathBuilder = useMemo(() => geoPath(projection), [projection]);

  const filteredAlbums = useMemo(() => {
    let baseAlbums = discoveryAlbums;
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

  const visibleUserRecords = layerVisibility.heard ? filteredUserRecords : [];
  const visibleFavoriteAlbums = layerVisibility.favorites ? filteredFavoriteAlbums : [];

  const userFeatureCollection = useMemo(() => toUserFeatureCollection(visibleUserRecords, yearRange), [visibleUserRecords, yearRange]);

  const userMarkers = useMemo(() => {
    return userFeatureCollection.features
      .map((featurePoint) => {
        if (featurePoint.geometry.type !== "Point") {
          return null;
        }
        const coords = featurePoint.geometry.coordinates as [number, number];
        return {
          lng: coords[0],
          lat: coords[1],
          id: featurePoint.properties?.id as string,
          props: featurePoint.properties as {
            id: string;
            albumTitle: string;
            artistName: string;
            score: number;
            year: number;
          },
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [userFeatureCollection.features]);

  const userRecordById = useMemo(() => {
    const map = new Map<string, (typeof userMarkers)[number]>();
    for (const marker of userMarkers) {
      map.set(marker.props.id, marker);
    }
    return map;
  }, [userMarkers]);


  const discoveryMarkers = useMemo(() => {
    // Filter out items present in user records to avoid duplicate icons
    const safeUserRecords = userRecords || [];
    const safeFavorites = favorites || [];

    const recordSet = new Set(
      safeUserRecords.map(
        (r) => albumArtistKey(r.albumTitle, r.artistGeo.artistName)
      )
    );
    const recordTitleSet = new Set(
      safeUserRecords.map((r) => albumTitleKey(r.albumTitle))
    );
    const favoriteSet = new Set(
      safeFavorites.map((album) =>
        albumArtistKey(album.albumTitle, album.artistName)
      )
    );

    const sourceAlbums = layerVisibility.roam ? filteredAlbums : [];
    const filteredDiscovery = sourceAlbums.filter((album) => {
      const key = albumArtistKey(album.albumTitle, album.artistName);
      if (recordSet.has(key)) {
        return false;
      }
      if (favoriteSet.has(key)) {
        return false;
      }

      // If the title already exists in heard records, hide discovery duplicate even when artist aliases differ.
      return !recordTitleSet.has(albumTitleKey(album.albumTitle));
    });

    const collection = toDiscoveryFeatureCollection(filteredDiscovery);
    return collection.features
      .map((featurePoint) => {
        if (featurePoint.geometry.type !== "Point") {
          return null;
        }
        const coords = featurePoint.geometry.coordinates as [number, number];
        const id = String(featurePoint.properties?.id ?? "");
        return {
          lng: coords[0],
          lat: coords[1],
          id,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [filteredAlbums, layerVisibility.roam, favorites, userRecords]);

  const favoriteMarkers = useMemo(() => {
    return visibleFavoriteAlbums.map((album) => ({
      id: `favorite:${album.id}`,
      favoriteId: album.id,
      album,
      lng: album.coordinates.lng,
      lat: album.coordinates.lat,
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

  // Marker sizes adapt to zoom and density: fewer markers -> larger; more markers -> smaller and tighter
  const totalMarkers = discoveryMarkers.length + userMarkers.length + favoriteMarkers.length;
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
          };
        })
        .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker)),
    ];

    return resolveMarkerCollisions(combined, {
      width: SVG_WIDTH,
      height: SVG_HEIGHT,
      iterations: 34,
      gapPx: 3,
    });
  }, [discoveryMarkerSize, discoveryMarkers, favoriteMarkers, projection, selectedDiscovery?.id, userMarkerSize, userMarkers]);

  const jitteredUserMarkers = useMemo(
    () =>
      jitteredGlobalMarkers
        .filter((marker) => marker.layer === "user")
        .map((marker) => {
          const source = userRecordById.get(marker.sourceId);
          if (!source) return null;
          return {
            ...marker,
            props: source.props,
          };
        })
        .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker)),
    [jitteredGlobalMarkers, userRecordById]
  );

  const jitteredDiscoveryMarkers = useMemo(
    () =>
      jitteredGlobalMarkers
        .filter((marker) => marker.layer === "discovery")
        .map((marker) => {
          const source = discoveryMarkerById.get(marker.sourceId);
          if (!source) return null;
          return {
            ...marker,
            id: source.id,
          };
        })
        .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker)),
    [discoveryMarkerById, jitteredGlobalMarkers]
  );

  const jitteredFavoriteMarkers = useMemo(
    () =>
      jitteredGlobalMarkers
        .filter((marker) => marker.layer === "favorite")
        .map((marker) => {
          const source = favoriteMarkerById.get(marker.sourceId);
          if (!source) return null;
          return {
            ...marker,
            album: source.album,
            favoriteId: source.favoriteId,
          };
        })
        .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker)),
    [favoriteMarkerById, jitteredGlobalMarkers]
  );

  const selectedUserRecord = useMemo(
    () => userRecords.find((record) => record.id === selectedUserRecordId) ?? null,
    [selectedUserRecordId, userRecords]
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

  // Ensure selected discovery is in albumsRef so it renders
  useEffect(() => {
    if (selectedDiscovery && !albumsRef.current.some(a => a.id === selectedDiscovery.id)) {
      albumsRef.current = [...albumsRef.current, selectedDiscovery];
    }
  }, [selectedDiscovery]);

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
    const selectedTitle = albumTitleKey(selectedDiscovery.albumTitle);
    return userRecords.some((r) => {
      const key = albumArtistKey(r.albumTitle, r.artistGeo.artistName);
      if (key === selectedKey) {
        return true;
      }
      return albumTitleKey(r.albumTitle) === selectedTitle;
    }
    );
  }, [userRecords, selectedDiscovery]);

  return (
    <div className="relative w-full h-full">
      <div className="absolute left-6 top-24 z-10 flex flex-col gap-2 pointer-events-none">
        {isAuthenticated ? (
          <div className="pointer-events-auto self-start flex gap-1 rounded-full border border-white/10 bg-black/40 p-1 shadow-2xl backdrop-blur-xl transition-all duration-300">
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
                  key: "heard",
                  label: "听过",
                  active: layerVisibility.heard,
                  activeClass: "bg-emerald-500/20 text-emerald-200 shadow-[inset_0_1px_1px_rgba(52,211,153,0.2)] border-emerald-500/30",
                  indicatorClass: "bg-emerald-400"
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
                  className={`relative flex items-center shrink-0 justify-center rounded-full border border-transparent px-4 py-1.5 text-[13px] font-medium tracking-wide transition-all duration-300 ease-out ${
                    item.active
                      ? item.activeClass
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
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
        onRefresh={() => {
          setRefreshSalt(makeSeedSalt());
          setRefreshNonce((value) => value + 1);
        }}
        className="absolute right-6 top-1/2 -translate-y-1/2 z-20"
      />

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
          setSelectedDiscovery(album);
          setSelectedUserRecordId(null);
          if (album.coordinates && typeof album.coordinates.lng === 'number' && typeof album.coordinates.lat === 'number') {
            setViewCenter([album.coordinates.lng, album.coordinates.lat]);
            setZoom(6);
          }
        }}
        onSelectUserRecord={(record) => {
          setIsSearchOpen(false);
          setSearchArtist("");
          setSearchAlbum("");
          setSelectedUserRecordId(record.id);
          setSelectedDiscovery(null);
          
          // Handle both possible coordinate structures
          const lng = record.artistGeo.coordinates?.lng;
          const lat = record.artistGeo.coordinates?.lat;
          
          if (lng !== undefined && lat !== undefined) {
            setViewCenter([lng, lat]);
            setZoom(6);
          }
        }}
      />

      <div
        ref={mapContainerRef}
        className="w-full h-full bg-[#09090b] relative overflow-hidden"
      >
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
          <rect x={0} y={0} width={SVG_WIDTH} height={SVG_HEIGHT} fill="#09090b" />
          <MemoizedGeographies geographies={worldGeographies} pathBuilder={pathBuilder} />
        </svg>

        {/* Overlay Layer for Markers */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {jitteredDiscoveryMarkers.map((marker) => {
              // Check both albumsRef and filteredAlbums to ensure we find the album
              // This is important for search results that might not be in the initial pool
              const album = albumsRef.current.find((item) => item.id === marker.id) || 
                            filteredAlbums.find((item) => item.id === marker.id);
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
                      zoom={zoom}
                      size={discoveryMarkerSize}
                      isSelected={selectedDiscovery?.id === marker.id}
                      onClick={() => {
                        setSelectedUserRecordId(null);
                        setSelectedDiscovery(album);
                        if (album) {
                          setViewCenter([album.coordinates.lng, album.coordinates.lat]);
                          setZoom((prev) => Math.max(prev, 2.6));
                        }
                      }}
                    />
                </div>
              );
            })}

            {jitteredUserMarkers.map((marker) => (
              <div
                key={marker.props.id}
                className="absolute will-change-[top,left]"
                style={{
                  left: `${(marker.x / SVG_WIDTH) * 100}%`,
                  top: `${(marker.y / SVG_HEIGHT) * 100}%`,
                  transform: "translate(-50%, -50%)"
                }}
              >
                  <UserRecordMarker
                    data={{
                      id: marker.props.id,
                      albumTitle: marker.props.albumTitle,
                      artistName: marker.props.artistName,
                    }}
                    size={userMarkerSize}
                    onClick={() => {
                      setSelectedDiscovery(null);
                      setSelectedUserRecordId(marker.props.id);
                    }}
                  />
              </div>
            ))}

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
                    zoom={zoom}
                    size={discoveryMarkerSize}
                    isSelected={selectedDiscovery?.id === marker.favoriteId}
                    onClick={() => {
                      setSelectedUserRecordId(null);
                      setSelectedDiscovery(marker.album);
                      setViewCenter([marker.album.coordinates.lng, marker.album.coordinates.lat]);
                      setZoom((prev) => Math.max(prev, 2.6));
                    }}
                  />
                  <span className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-pink-500/90 px-1 text-[10px] font-bold text-white">
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
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="fixed top-24 right-6 z-[60] w-[320px] rounded-xl border border-white/10 bg-black/80 p-4 text-sm text-zinc-200 backdrop-blur-md shadow-2xl"
          >
            <div className="flex gap-4">
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-zinc-800 shadow-inner relative">
                <AlbumArtImage 
                  artist={selectedDiscovery.artistName}
                  album={selectedDiscovery.albumTitle}
                  className="absolute inset-0 w-full h-full"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate text-white text-base">{selectedDiscovery.albumTitle}</p>
                <p className="text-zinc-400 truncate text-xs uppercase tracking-wider mb-1">{selectedDiscovery.artistName}</p>
                <p className="text-zinc-500 text-xs">
                  {selectedDiscovery.releaseYear} · {selectedDiscovery.countryCode} / {selectedDiscovery.cityName}
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                 void onMarkHeardRef.current(selectedDiscovery);
              }}
              disabled={!isAuthenticatedRef.current}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelectedDiscoveryHeard 
                  ? "bg-red-900/80 hover:bg-red-800 text-red-100" 
                  : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {!isAuthenticatedRef.current ? "登录后可标记" : isSelectedDiscoveryHeard ? "Heard (Undo)" : "Mark Heard"}
            </button>
            <button
              type="button"
              onClick={() => onToggleFavoriteRef.current(selectedDiscovery)}
              className="flex-1 rounded-md bg-zinc-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-600"
            >
              {favoritesRef.current.some(f => 
                  f.id === selectedDiscovery.id || 
                  (f.albumTitle === selectedDiscovery.albumTitle && f.artistName === selectedDiscovery.artistName)
                ) ? "取消收藏" : "收藏"}
            </button>
          </div>
          </motion.div>
      ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
      {selectedUserRecord ? (
        <motion.div 
            key={`user-record-popup-${selectedUserRecord.id}`}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="fixed top-24 right-6 z-[60] w-[320px] rounded-xl border border-white/10 bg-black/80 p-4 text-sm text-zinc-200 backdrop-blur-md shadow-2xl"
        >
          <div className="flex gap-4 items-center">
            <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border-2 border-emerald-500 shadow-glow relative">
              <AlbumArtImage 
                artist={selectedUserRecord.artistGeo.artistName}
                album={selectedUserRecord.albumTitle}
                className="absolute inset-0 w-full h-full"
              />
            </div>
            <div>
              <p className="font-bold text-emerald-400">{selectedUserRecord.albumTitle}</p>
              <p className="text-zinc-400 text-xs uppercase tracking-wider">{selectedUserRecord.artistGeo.artistName}</p>
              <p className="text-zinc-500 text-xs mt-1">
                 评分 <span className="text-emerald-300 font-mono">{selectedUserRecord.score}</span> · {getRecordYear(selectedUserRecord)}
              </p>
            </div>
          </div>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </div>
  );
}
