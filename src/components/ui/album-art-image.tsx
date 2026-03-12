"use client";

import { useEffect, useState } from "react";
import { getAlbumCoverUrl } from "@/lib/assets/covers";

// Simple in-memory cache to avoid redundant API calls
const CACHE = new Map<string, string>();
const PENDING = new Map<string, Promise<string | null>>();

async function fetchItunesCover(artist: string, albumName: string): Promise<string | null> {
  const cacheKey = `${artist}:${albumName}`;
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey)!;
  if (PENDING.has(cacheKey)) {
    return PENDING.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      // Use "album" entity to get cleaner results
      const query = encodeURIComponent(`${artist} ${albumName}`);
      const res = await fetch(`/api/itunes-proxy?term=${query}&entity=album&limit=1`);
      if (!res.ok) throw new Error("iTunes API error");

      const data = await res.json();
      if (data.results && data.results.length > 0) {
        // Get higher res image
        // artworkUrl100 is 100x100
        const artworkUrl = data.results[0].artworkUrl100.replace("100x100bb", "600x600bb");
        CACHE.set(cacheKey, artworkUrl);
        return artworkUrl;
      }
    } catch (e) {
      console.error("iTunes fetch error", e);
    }
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
  const [src, setSrc] = useState<string | null>(CACHE.get(cacheKey) || null);
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
          setSrc(cached);
        }
        return;
      }

      if (active) {
        setSrc(null);
      }

      const url = await fetchItunesCover(artist, album);
      if (active) {
        if (url) {
          setSrc(url);
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
        onError={() => setHasError(true)}
      />
    </div>
  );
}
