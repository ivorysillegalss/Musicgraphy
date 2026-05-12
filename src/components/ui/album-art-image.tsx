"use client";

import { useEffect, useState } from "react";
import { getAlbumCoverUrl } from "@/lib/assets/covers";

// ── Persistent store on window (survives HMR module re-evaluation) ──
const SSR = typeof window === "undefined";
const W: any = SSR ? null : window;
function ensureStore() {
  if (!W || W.__AC) return W?.__AC ?? null;
  W.__AC = {
    CACHE: new Map<string, string>(),
    CANDIDATE_CACHE: new Map<string, string[]>(),
    PENDING: new Map<string, Promise<string | null>>(),
    activeFetches: 0,
    fetchQueue: [] as Array<() => void>,
  };
  return W.__AC;
}

const _store = ensureStore();
const CACHE: Map<string, string> = _store?.CACHE ?? new Map();
const CANDIDATE_CACHE: Map<string, string[]> = _store?.CANDIDATE_CACHE ?? new Map();
const PENDING: Map<string, Promise<string | null>> = _store?.PENDING ?? new Map();
const NO_COVER_SENTINEL = "__no_cover__";
const MAX_CONCURRENT = 4;

function acquireSlot(): Promise<void> {
  if (!_store) return Promise.resolve();
  if (_store.activeFetches < MAX_CONCURRENT) {
    _store.activeFetches++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    _store.fetchQueue.push(() => {
      _store.activeFetches++;
      resolve();
    });
  });
}

function releaseSlot() {
  if (!_store) return;
  _store.activeFetches--;
  if (_store.fetchQueue.length > 0) {
    const next = _store.fetchQueue.shift();
    next?.();
  }
}

// ── Types ──

type CoverLookupResponse = {
  found?: boolean;
  source?: "itunes" | "coverartarchive" | "deezer" | null;
  coverUrl?: string | null;
  candidates?: string[];
};

// ── Cover fetcher with concurrency limiting ──

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
    await acquireSlot();
    try {
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
    } finally {
      releaseSlot();
    }
  })();

  PENDING.set(cacheKey, promise);
  try {
    const result = await promise;
    return result;
  } finally {
    PENDING.delete(cacheKey);
  }
}

// ── Component ──

type AlbumArtImageProps = {
  artist: string;
  album: string;
  className?: string;
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
  const [isLoaded, setIsLoaded] = useState(false);

  const fallbackUrl = getAlbumCoverUrl(artist, album, "medium");

  useEffect(() => {
    let active = true;

    async function loadCover() {
      setHasError(false);
      setIsLoaded(false);

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

  const finalSrc = !hasError && src ? src : fallbackUrl;

  return (
    <div className={`relative overflow-hidden ${className || ''}`} style={{ width: width || '100%', height: height || '100%' }}>
      {/* Placeholder while loading */}
      {!isLoaded && !hasError && (
        <img
          src={fallbackUrl}
          alt={`${album} by ${artist}`}
          className="absolute inset-0 w-full h-full object-cover blur-md opacity-30 scale-105 transition-all duration-500"
          loading="lazy"
        />
      )}
      <img
        key={`${artist}-${album}-${finalSrc}`}
        src={finalSrc}
        alt={`${album} by ${artist}`}
        className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ${
          isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
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
