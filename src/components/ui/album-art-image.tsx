"use client";

import { useEffect, useState } from "react";
import { getAlbumCoverUrl } from "@/lib/assets/covers";

// Simple in-memory cache to avoid redundant API calls
const CACHE = new Map<string, string>();
const CANDIDATE_CACHE = new Map<string, string[]>();
const PENDING = new Map<string, Promise<string | null>>();
const NO_COVER_SENTINEL = "__no_cover__";

type CoverLookupResponse = {
  found?: boolean;
  source?: "itunes" | "coverartarchive" | "deezer" | null;
  coverUrl?: string | null;
  candidates?: string[];
};

async function fetchItunesCover(artist: string, albumName: string): Promise<string | null> {
  const cacheKey = `${artist}:${albumName}`;
  if (CACHE.has(cacheKey)) {
    const cached = CACHE.get(cacheKey)!;
    return cached === NO_COVER_SENTINEL ? null : cached;
  }
  if (PENDING.has(cacheKey)) {
    return PENDING.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const query = new URLSearchParams({ artist, album: albumName });
      const res = await fetch(`/api/itunes-proxy?${query.toString()}`);
      if (!res.ok) throw new Error("Album cover API error");

      const data = (await res.json()) as CoverLookupResponse;
      const candidates = Array.from(new Set(data.candidates ?? [])).filter(Boolean);
      if (data.found && data.coverUrl) {
        CACHE.set(cacheKey, data.coverUrl);
        CANDIDATE_CACHE.set(cacheKey, candidates.length > 0 ? candidates : [data.coverUrl]);
        return data.coverUrl;
      }
    } catch (e) {
      console.error("Album cover fetch error", e);
    }
    CACHE.set(cacheKey, NO_COVER_SENTINEL);
    CANDIDATE_CACHE.set(cacheKey, []);
    return null;
  })();

  PENDING.set(cacheKey, promise);
  try {
    const result = await promise;
    return result;
  } finally {
    PENDING.delete(cacheKey);
  }
}

type AlbumArtImageProps = {
  artist: string;
  album: string;
  className?: string; // Additional classes for the img element
  width?: string | number;
  height?: string | number;
};

export function AlbumArtImage({ artist, album, className, width, height }: AlbumArtImageProps) {
  const cacheKey = `${artist}:${album}`;
  const initialCached = CACHE.get(cacheKey);
  const [src, setSrc] = useState<string | null>(
    initialCached && initialCached !== NO_COVER_SENTINEL ? initialCached : null
  );
  const [candidateUrls, setCandidateUrls] = useState<string[]>(CANDIDATE_CACHE.get(cacheKey) ?? []);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [hasError, setHasError] = useState(false);

  // Fallback to local deterministic "initials" generator
  // Note: getAlbumCoverUrl takes (artist, album, size)
  const fallbackUrl = getAlbumCoverUrl(artist, album, "medium");

  useEffect(() => {
    let active = true;

    async function loadCover() {
      setHasError(false);

      const cached = CACHE.get(cacheKey);
      if (cached) {
        if (active) {
          if (cached === NO_COVER_SENTINEL) {
            setSrc(null);
            setCandidateUrls([]);
            setHasError(true);
            return;
          }

          setSrc(cached);
          const cachedCandidates = CANDIDATE_CACHE.get(cacheKey) ?? [cached];
          setCandidateUrls(cachedCandidates);
          setCandidateIndex(0);
        }
        return;
      }

      if (active) {
        setSrc(null);
        setCandidateUrls([]);
        setCandidateIndex(0);
      }

      const url = await fetchItunesCover(artist, album);
      if (active) {
        if (url) {
          setSrc(url);
          const cachedCandidates = CANDIDATE_CACHE.get(cacheKey) ?? [url];
          setCandidateUrls(cachedCandidates);
          setCandidateIndex(0);
        } else {
          setHasError(true);
        }
      }
    }

    void loadCover();

    return () => {
      active = false;
    };
  }, [artist, album, cacheKey]);

  // If there's an error loading the iTunes image, fall back to initial generator
  const finalSrc = !hasError && src ? src : fallbackUrl;

  return (
    <div className={`relative overflow-hidden ${className || ''}`} style={{ width: width || '100%', height: height || '100%' }}>
      {/* Show fallback while loading */}
      {!src && !hasError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fallbackUrl}
          alt={`Loading ${album} by ${artist}`}
          className="absolute inset-0 w-full h-full object-cover blur-sm opacity-50"
          loading="lazy"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={`${artist}-${album}-${finalSrc}`} // Force re-render when src changes to avoid showing old image
        src={finalSrc}
        alt={`${album} by ${artist}`}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${!src && !hasError ? 'opacity-0' : 'opacity-100'}`}
        loading="lazy"
        onError={() => {
          const nextIndex = candidateIndex + 1;
          if (nextIndex < candidateUrls.length) {
            setCandidateIndex(nextIndex);
            setSrc(candidateUrls[nextIndex]);
            setHasError(false);
            return;
          }
          setHasError(true);
        }}
      />
    </div>
  );
}
