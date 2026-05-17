"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import type { DiscoveryAlbum } from "@/lib/discovery-catalog";
import type { UserRecord } from "@/lib/types";
import { AlbumArtImage } from "@/components/ui/album-art-image";
import { useLanguage } from "@/lib/i18n/LanguageContext";

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
  const { t, language } = useLanguage();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, { ts: number; results: Array<DiscoveryAlbum & { source?: string; tags?: string[] }>; meta: SearchApiMeta }>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<DiscoveryAlbum & { source?: string; tags?: string[] }>>([]);
  const [searchMeta, setSearchMeta] = useState<SearchApiMeta>({});
  const [hasInteracted, setHasInteracted] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [areaFilter, setAreaFilter] = useState("");
  const [decadeFilter, setDecadeFilter] = useState<string>("");
  const [useExternalSearch, setUseExternalSearch] = useState(false);
  const ITEMS_PER_PAGE = 5;
  const CACHE_TTL = 60_000;

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
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

            if (useExternalSearch && validResults.length > 0) {
              const localOnlyCacheKey = `${key}|external:0`;
              cacheRef.current.delete(localOnlyCacheKey);
            }
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

    filteredUserRecords.forEach((record) =>
      results.push({ type: "user", data: record })
    );

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
            className="absolute inset-0 z-30 bg-black/30"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
            className="absolute left-1/2 top-20 z-40 w-full max-w-2xl -translate-x-1/2 flex flex-col gap-3 p-4"
          >
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--edge-soft)] bg-[var(--bg-espresso)]/95 p-3 shadow-xl shadow-black/40">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[var(--accent-amber)]/60 ml-1 flex-shrink-0" />
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={artistQuery}
                    onChange={(e) => onArtistQueryChange(e.target.value)}
                    placeholder={t.search.artistOrBand}
                    onFocus={() => setHasInteracted(true)}
                    onKeyDown={() => setHasInteracted(true)}
                    className="w-full bg-[var(--bg-roast)] px-2.5 py-1.5 text-sm text-[var(--text-cream)] outline-none placeholder:text-[var(--text-dim)] border border-[var(--edge-bronze)] focus:border-[var(--accent-amber)]/70 focus:ring-2 focus:ring-[var(--glow-amber)] focus:ring-opacity-40 transition-all rounded-lg"
                  />
                  <input
                    type="text"
                    value={albumQuery}
                    onChange={(e) => onAlbumQueryChange(e.target.value)}
                    placeholder={t.search.albumName}
                    onFocus={() => setHasInteracted(true)}
                    onKeyDown={() => setHasInteracted(true)}
                    className="w-full bg-[var(--bg-roast)] px-2.5 py-1.5 text-sm text-[var(--text-cream)] outline-none placeholder:text-[var(--text-dim)] border border-[var(--edge-bronze)] focus:border-[var(--accent-amber)]/70 focus:ring-2 focus:ring-[var(--glow-amber)] focus:ring-opacity-40 transition-all rounded-lg"
                  />
                </div>
                <button
                  onClick={() => {
                    onArtistQueryChange("");
                    onAlbumQueryChange("");
                  }}
                  className="p-1.5 hover:text-[var(--text-cream)] text-[var(--text-dim)] hover:bg-white/[0.04] rounded-md transition-all"
                  title="Clear"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onClose}
                  className="px-2 py-1 hover:bg-white/[0.04] rounded-md text-[var(--text-dim)] hover:text-[var(--text-cream)] transition-all text-xs"
                  title="Close"
                >
                  <span className="font-medium">Esc</span>
                </button>
              </div>
            </div>

            {(availableTags.length > 0 || decadeOptions.length > 0) && (
              <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--edge-soft)] bg-[var(--bg-espresso)]/80 p-2.5 text-xs backdrop-blur-sm">
                {availableTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[var(--text-dim)] mr-1 text-[10px] tracking-wide uppercase">Tags</span>
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
                          className={`px-2 py-0.5 rounded text-[10px] transition-all ${
                            active
                              ? "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]/80 border border-[var(--accent-amber)]/20"
                              : "border border-white/[0.04] bg-white/[0.02] hover:border-[var(--border-default)] hover:text-[#b0aaa0] text-[var(--text-dim)]"
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
                    <span className="text-[#9a948c] text-[10px] tracking-wide uppercase">Decade</span>
                    <select
                      value={decadeFilter}
                      onChange={(e) => setDecadeFilter(e.target.value)}
                      className="bg-[var(--bg-roast)] border border-[var(--edge-bronze)] text-xs rounded px-2 py-1 text-[var(--text-dim)] outline-none focus:border-[var(--accent-amber)]/30"
                    >
                      <option value="">{t.controls.allYears}</option>
                      {decadeOptions.map((d) => (
                        <option key={d} value={d}>{d}s</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                  <span className="text-[#9a948c] text-[10px] tracking-wide uppercase">Region</span>
                  <input
                    value={areaFilter}
                    onChange={(e) => setAreaFilter(e.target.value)}
                    placeholder="Country / City"
                    className="bg-black/30 border border-white/[0.06] text-xs rounded px-2 py-1 flex-1 outline-none focus:border-[var(--accent-green)]/30 text-[#b0aaa0] placeholder:text-[#9a948c]"
                  />
                </div>
              </div>
            )}

            {(artistQuery.trim() || albumQuery.trim()) && (
                <div className="flex flex-col gap-1 rounded-lg border border-[var(--edge-soft)] bg-[var(--bg-espresso)]/95 p-2 shadow-xl shadow-black/40 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {searchMeta.shouldOfferExternalSearch && !useExternalSearch && (
                  <div className="mb-1 rounded-lg border border-[var(--accent-amber)]/15 bg-[var(--accent-amber)]/[0.03] p-2.5">
                    <p className="text-xs text-[#9a948c] mb-2">
                      {t.search.externalHelp}
                    </p>
                    <button
                      onClick={() => setUseExternalSearch(true)}
                      className="rounded bg-[var(--accent-amber)]/10 px-2.5 py-1 text-[10px] text-[var(--accent-amber)]/80 hover:bg-[var(--accent-amber)]/20 transition-all border border-[var(--accent-amber)]/15"
                    >
                      {t.search.externalSearch}
                    </button>
                  </div>
                )}

                {searchMeta.externalSuppressedByCooldown ? (
                  <div className="mb-1 rounded-lg border border-white/[0.04] bg-black/20 p-2.5 text-xs text-[#9a948c]">
                    {t.search.cooldown}
                  </div>
                ) : null}

                {searchMeta.externalError ? (
                  <div className="mb-1 rounded-lg border border-[#8a4a5a]/20 bg-[#8a4a5a]/[0.04] p-2.5 text-xs text-[#8a4a5a]/70">
                    {language === 'en' ? 'External search failed: ' : 'External search failed: '}{searchMeta.externalError}
                  </div>
                ) : null}

                {isSearching ? (
                  <div className="p-6 text-center text-sm text-[var(--text-dim)]">
                    <div className="inline-flex items-center gap-2">
                      <div className="h-1 w-1 rounded-full bg-[var(--accent-amber)]/60 animate-pulse" />
                      {t.search.searching}
                    </div>
                  </div>
                ) : totalResults === 0 ? (
                  <div className="p-6 text-center text-sm text-[#9a948c]">
                    {t.search.notFound}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-0.5">
                      {paginatedResults.map((result, index) => {
                        if (result.type === "user") {
                          const record = result.data;
                          return (
                            <button
                              key={`user-${record.id}-${index}`}
                              onClick={() => {
                                onSelectUserRecord(record);
                              }}
                              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-white/[0.03] text-left transition-all"
                            >
                              <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-black/40 border border-white/[0.04]">
                                <div className="w-full h-full bg-[#4a8a6a]/10 flex items-center justify-center text-xs text-[#4a8a6a]/70 font-mono">
                                  {record.score}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-[var(--color-text)] line-clamp-1">
                                  {record.albumTitle}
                                </div>
                                <div className="text-xs text-[#9a948c] line-clamp-1">
                                  {record.artistGeo.artistName}
                                </div>
                              </div>
                              <div className="text-[10px] px-1.5 py-0.5 rounded bg-[#4a8a6a]/10 text-[#4a8a6a]/70 border border-[#4a8a6a]/10 flex-shrink-0 font-medium">
                                My Record
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
                              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-white/[0.03] text-left transition-all"
                            >
                              <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-black/40 border border-white/[0.04] relative">
                                <AlbumArtImage
                                  artist={album.artistName}
                                  album={album.albumTitle}
                                  releaseId={album.id.startsWith("mb-") ? album.id.slice(3) : null}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-[var(--color-text)] line-clamp-1">
                                  {album.albumTitle}
                                </div>
                                <div className="text-xs text-[#9a948c] line-clamp-1">
                                  {album.artistName}{album.cityName !== "Unknown" ? ` · ${album.cityName}` : ""}
                                </div>
                              </div>
                              <div className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-[#9a948c] border border-white/[0.04] flex-shrink-0 font-medium">
                                {album.id.startsWith('mb-') ? 'MusicBrainz' : language === 'en' ? 'Discovery' : 'Discovery'}
                              </div>
                            </button>
                          );
                        }
                      })}
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/[0.04] px-1">
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="p-1 rounded-md hover:bg-white/[0.04] disabled:opacity-30 disabled:hover:bg-transparent text-[#9a948c] hover:text-[#b0aaa0] transition-all"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-[#9a948c] font-medium tabular-nums">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="p-1 rounded-md hover:bg-white/[0.04] disabled:opacity-30 disabled:hover:bg-transparent text-[#9a948c] hover:text-[#b0aaa0] transition-all"
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
