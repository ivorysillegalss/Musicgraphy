"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import type { DiscoveryAlbum } from "@/lib/discovery-catalog";
import type { UserRecord } from "@/lib/types";
import { AlbumArtImage } from "@/components/ui/album-art-image";

type SearchResult =
  | { type: "user"; data: UserRecord }
  | { type: "discovery"; data: DiscoveryAlbum & { source?: string; tags?: string[] } };

type SearchApiMeta = {
  source?: "local-only" | "local-plus-external";
  exactMatch?: boolean;
  localCount?: number;
  shouldOfferExternalSearch?: boolean;
  externalRequested?: boolean;
  externalAttempted?: boolean;
  externalSuppressedByCooldown?: boolean;
  externalError?: string;
};

type SearchApiResponse = {
  results?: Array<DiscoveryAlbum & { source?: string; tags?: string[] }>;
  meta?: SearchApiMeta;
};

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  artistQuery: string;
  albumQuery: string;
  onArtistQueryChange: (query: string) => void;
  onAlbumQueryChange: (query: string) => void;
  userRecords: UserRecord[];
  userId?: string;
  onSelectDiscovery: (album: DiscoveryAlbum) => void;
  onSelectUserRecord: (record: UserRecord) => void;
}

export function SearchOverlay({
  isOpen,
  onClose,
  artistQuery,
  albumQuery,
  onArtistQueryChange,
  onAlbumQueryChange,
  userRecords,
  userId,
  onSelectDiscovery,
  onSelectUserRecord,
}: SearchOverlayProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, { ts: number; results: Array<DiscoveryAlbum & { source?: string; tags?: string[] }>; meta: SearchApiMeta }>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<DiscoveryAlbum & { source?: string; tags?: string[] }>>([]);
  const [searchMeta, setSearchMeta] = useState<SearchApiMeta>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [areaFilter, setAreaFilter] = useState("");
  const [decadeFilter, setDecadeFilter] = useState<string>("");
  const [useExternalSearch, setUseExternalSearch] = useState(false);
  const ITEMS_PER_PAGE = 5;
  const CACHE_TTL = 60_000;

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // Small timeout to allow animation to start/element to mount
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setUseExternalSearch(false);
  }, [artistQuery, albumQuery]);

  useEffect(() => {
    setCurrentPage(1);

    const hasQuery = artistQuery.trim() || albumQuery.trim();

    if (!hasQuery) {
      abortRef.current?.abort();
      setIsSearching(false);
      setSearchResults([]);
      setSearchMeta({});
      return;
    }

    const key = `${artistQuery.trim().toLowerCase()}::${albumQuery.trim().toLowerCase()}|${selectedTags
      .slice()
      .sort()
      .join(",")}|${areaFilter.trim().toLowerCase()}|${decadeFilter}`;
    const fullCacheKey = `${key}|external:${useExternalSearch ? "1" : "0"}`;

    const cached = cacheRef.current.get(fullCacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setIsSearching(false);
      setSearchResults(cached.results);
      setSearchMeta(cached.meta);
      return;
    }

    let cancelled = false;

    const fetchResults = async () => {
      setIsSearching(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = new URLSearchParams();
        const combined = `${artistQuery} ${albumQuery}`.trim();
        if (combined) params.set("q", combined);
        if (artistQuery.trim()) params.set("artist", artistQuery.trim());
        if (albumQuery.trim()) params.set("album", albumQuery.trim());
        if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
        if (areaFilter.trim()) params.set("area", areaFilter.trim());
        if (decadeFilter) params.set("decade", decadeFilter);
        if (useExternalSearch) params.set("allowExternal", "1");

        const res = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
          headers: userId ? { "x-user-id": userId } : undefined,
        });
        if (res.ok) {
          const data = (await res.json()) as SearchApiResponse;
          const validResults = (data.results || []).filter(
            (r: DiscoveryAlbum) => r.coordinates && typeof r.coordinates.lng === "number" && typeof r.coordinates.lat === "number"
          );
          const meta = data.meta ?? {};
          if (!controller.signal.aborted && !cancelled) {
            setSearchResults(validResults);
            setSearchMeta(meta);
            cacheRef.current.set(fullCacheKey, { ts: Date.now(), results: validResults, meta });
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError" || cancelled) return;
        console.error("Search error:", error);
      } finally {
        if (!cancelled && !(abortRef.current?.signal?.aborted ?? false)) {
          setIsSearching(false);
        }
      }
    };

    const timeoutId = setTimeout(fetchResults, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      abortRef.current?.abort();
    };
  }, [artistQuery, albumQuery, selectedTags, areaFilter, decadeFilter, useExternalSearch, userId]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    searchResults.forEach((r) => (r.tags ?? []).forEach((t) => tags.add(t)));
    return Array.from(tags).slice(0, 12);
  }, [searchResults]);

  const decadeOptions = useMemo(() => {
    const decades = new Set<number>();
    searchResults.forEach((r) => {
      if (r.releaseYear) {
        decades.add(Math.floor(r.releaseYear / 10) * 10);
      }
    });
    return Array.from(decades).sort((a, b) => a - b);
  }, [searchResults]);

  const filteredUserRecords = useMemo(() => {
    const artistTerm = artistQuery.trim().toLowerCase();
    const albumTerm = albumQuery.trim().toLowerCase();
    if (!artistTerm && !albumTerm) return [];

    return userRecords.filter((record) => {
      const matchesArtist = artistTerm
        ? record.artistGeo.artistName.toLowerCase().includes(artistTerm)
        : true;
      const matchesAlbum = albumTerm
        ? record.albumTitle.toLowerCase().includes(albumTerm)
        : true;
      return matchesArtist && matchesAlbum;
    });
  }, [userRecords, artistQuery, albumQuery]);

  const combinedResults = useMemo<SearchResult[]>(() => {
    const results: SearchResult[] = [];
    const toKey = (albumTitle: string, artistName: string) =>
      `${albumTitle.trim().toLowerCase()}::${artistName.trim().toLowerCase()}`;
    const heardKeySet = new Set(
      userRecords.map((record) => toKey(record.albumTitle, record.artistGeo.artistName))
    );
    
    // Add user records first
    filteredUserRecords.forEach((record) =>
      results.push({ type: "user", data: record })
    );
    
    // Add discovery albums, but filter out ones that are already in user records
    searchResults.forEach((album) => {
      const isAlreadyUserRecord = heardKeySet.has(toKey(album.albumTitle, album.artistName));
      
      if (!isAlreadyUserRecord) {
        results.push({ type: "discovery", data: album });
      }
    });
    
    return results;
  }, [filteredUserRecords, searchResults, userRecords]);

  const totalResults = combinedResults.length;
  const totalPages = Math.ceil(totalResults / ITEMS_PER_PAGE);
  const paginatedResults = combinedResults.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="absolute left-1/2 top-24 z-40 w-full max-w-md -translate-x-1/2 flex flex-col gap-2 p-4"
          >
            <div className="flex flex-col gap-2 rounded-xl bg-zinc-900/90 border border-white/10 p-3 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-zinc-400 ml-1" />
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={artistQuery}
                    onChange={(e) => onArtistQueryChange(e.target.value)}
                    placeholder="艺人/乐队"
                    className="w-full bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-zinc-500 border border-white/10 rounded-lg"
                  />
                  <input
                    type="text"
                    value={albumQuery}
                    onChange={(e) => onAlbumQueryChange(e.target.value)}
                    placeholder="专辑/单曲"
                    className="w-full bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-zinc-500 border border-white/10 rounded-lg"
                  />
                </div>
                <button
                  onClick={() => {
                    onArtistQueryChange("");
                    onAlbumQueryChange("");
                  }}
                  className="p-1 hover:text-white text-zinc-500"
                  title="清空"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
                  title="关闭"
                >
                  <span className="text-xs font-semibold">ESC</span>
                </button>
              </div>
            </div>

            {(availableTags.length > 0 || decadeOptions.length > 0) && (
              <div className="flex flex-wrap gap-2 rounded-lg bg-zinc-900/80 border border-white/10 p-2 text-xs text-zinc-300">
                {availableTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-zinc-500 mr-1">标签:</span>
                    {availableTags.map((tag) => {
                      const active = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            setSelectedTags((prev) =>
                              active ? prev.filter((t) => t !== tag) : [...prev, tag]
                            );
                          }}
                          className={`px-2 py-1 rounded-full border text-[11px] transition ${
                            active
                              ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                              : "border-white/10 bg-white/5 hover:border-white/30"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                )}

                {decadeOptions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">年代:</span>
                    <select
                      value={decadeFilter}
                      onChange={(e) => setDecadeFilter(e.target.value)}
                      className="bg-zinc-800 border border-white/10 text-xs rounded px-2 py-1"
                    >
                      <option value="">全部</option>
                      {decadeOptions.map((d) => (
                        <option key={d} value={d}>{d}s</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                  <span className="text-zinc-500">地区:</span>
                  <input
                    value={areaFilter}
                    onChange={(e) => setAreaFilter(e.target.value)}
                    placeholder="国家/城市"
                    className="bg-zinc-800 border border-white/10 text-xs rounded px-2 py-1 flex-1"
                  />
                </div>
              </div>
            )}

            {(artistQuery.trim() || albumQuery.trim()) && (
              <div className="flex flex-col gap-1 rounded-xl bg-zinc-900/90 border border-white/10 p-2 shadow-2xl backdrop-blur-md max-h-[60vh] overflow-y-auto custom-scrollbar">
                {searchMeta.shouldOfferExternalSearch && !useExternalSearch && (
                  <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                    <p className="text-xs text-amber-200 mb-2">
                      本地结果较少且非精确匹配，可以选择调用第三方搜索补充。
                    </p>
                    <button
                      onClick={() => setUseExternalSearch(true)}
                      className="rounded-md bg-amber-500/20 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/30 transition-colors"
                    >
                      调用第三方搜索
                    </button>
                  </div>
                )}

                {searchMeta.externalSuppressedByCooldown ? (
                  <div className="mb-2 rounded-lg border border-zinc-700 bg-zinc-800/50 p-2 text-xs text-zinc-300">
                    第三方搜索冷却中，请稍后再试。
                  </div>
                ) : null}

                {searchMeta.externalError ? (
                  <div className="mb-2 rounded-lg border border-red-700/40 bg-red-950/30 p-2 text-xs text-red-200">
                    第三方搜索失败: {searchMeta.externalError}
                  </div>
                ) : null}

                {isSearching ? (
                  <div className="p-4 text-center text-sm text-zinc-500">
                    搜索中...
                  </div>
                ) : totalResults === 0 ? (
                  <div className="p-4 text-center text-sm text-zinc-500">
                    未找到相关结果
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      {paginatedResults.map((result, index) => {
                        if (result.type === "user") {
                          const record = result.data;
                          return (
                            <button
                              key={`user-${record.id}-${index}`}
                              onClick={() => {
                                onSelectUserRecord(record);
                              }}
                              className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-white/10 text-left transition-colors"
                            >
                              <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-md bg-zinc-800">
                                <div className="w-full h-full bg-emerald-900/30 flex items-center justify-center text-xs text-emerald-500 font-bold">
                                  {record.score}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white line-clamp-1">
                                  {record.albumTitle}
                                </div>
                                <div className="text-xs text-zinc-400 line-clamp-1">
                                  {record.artistGeo.artistName}
                                </div>
                              </div>
                              <div className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 flex-shrink-0">
                                我的记录
                              </div>
                            </button>
                          );
                        } else {
                          const album = result.data;
                          return (
                            <button
                              key={`discovery-${album.id}-${index}`}
                              onClick={() => {
                                onSelectDiscovery(album);
                              }}
                              className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-white/10 text-left transition-colors"
                            >
                              <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-md bg-zinc-800 relative">
                                <AlbumArtImage
                                  artist={album.artistName}
                                  album={album.albumTitle}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white line-clamp-1">
                                  {album.albumTitle}
                                </div>
                                <div className="text-xs text-zinc-400 line-clamp-1">
                                  {album.artistName} {album.cityName !== "Unknown" ? `· ${album.cityName}` : ""}
                                </div>
                              </div>
                              <div className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-400 flex-shrink-0">
                                {album.id.startsWith('mb-') ? 'MusicBrainz' : '发现'}
                              </div>
                            </button>
                          );
                        }
                      })}
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-2 mt-2 border-t border-white/10 px-2">
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="p-1 rounded hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-transparent text-zinc-400 hover:text-white transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-zinc-500">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="p-1 rounded hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-transparent text-zinc-400 hover:text-white transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
