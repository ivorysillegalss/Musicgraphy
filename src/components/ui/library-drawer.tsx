"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, History, Trash2, Filter } from "lucide-react";
import type { DiscoveryAlbum } from "@/lib/discovery-catalog";
import type { UserRecord } from "@/lib/types";
import { AlbumArtImage } from "@/components/ui/album-art-image";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const INVALID_TAG_SUBSTRINGS = ["map", "mark", "homepage", "home", "page", "mapmark", "map-marker"];

function normalizeTag(tag: string) {
  const trimmed = tag.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (INVALID_TAG_SUBSTRINGS.some((bad) => lower.includes(bad))) return null;
  if (/https?:\/\//i.test(trimmed)) return null;
  if (trimmed.length > 32) return null;
  if (!/[a-zA-Z0-9]/.test(trimmed)) return null;
  return trimmed;
}

function buildAlbumTags(album: DiscoveryAlbum) {
  const maybeTags = (album as DiscoveryAlbum & { tags?: unknown }).tags;
  const rawTags: string[] = Array.isArray(maybeTags) ? maybeTags.map((tag) => String(tag)) : [];
  const cleanedRaw = rawTags
    .map((t) => normalizeTag(String(t)))
    .filter((t): t is string => Boolean(t));
  const derived: string[] = [];
  if (album.releaseYear) {
    derived.push(`${Math.floor(album.releaseYear / 10) * 10}s`);
  }
  if (album.countryName) {
    derived.push(album.countryName);
  } else if (album.countryCode) {
    derived.push(album.countryCode);
  }

  const unique = new Set<string>();
  for (const t of [...cleanedRaw, ...derived].map((v) => normalizeTag(String(v))).filter((v): v is string => Boolean(v))) {
    unique.add(t);
    if (unique.size >= 8) break;
  }
  return Array.from(unique);
}

function buildRecordTags(record: UserRecord) {
  const rawTags = record.personalTags ?? [];
  const cleanedRaw = rawTags
    .map((t) => normalizeTag(String(t)))
    .filter((t): t is string => Boolean(t));
  const derived: string[] = [];
  if (record.releaseYear) {
    derived.push(`${Math.floor(record.releaseYear / 10) * 10}s`);
  }
  if (record.artistGeo.countryName) {
    derived.push(record.artistGeo.countryName);
  } else if (record.artistGeo.countryCode) {
    derived.push(record.artistGeo.countryCode);
  }

  const unique = new Set<string>();
  for (const t of [...cleanedRaw, ...derived].map((v) => normalizeTag(String(v))).filter((v): v is string => Boolean(v))) {
    unique.add(t);
    if (unique.size >= 8) break;
  }
  return Array.from(unique);
}

type LibraryDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  favorites: DiscoveryAlbum[];
  records: UserRecord[];
  onToggleFavorite: (album: DiscoveryAlbum) => void;
  onMarkHeard: (album: DiscoveryAlbum) => void;
  onUnmark: (record: UserRecord) => void;
  onLocateFavorite: (album: DiscoveryAlbum) => void;
  onLocateRecord: (record: UserRecord) => void;
};

export function LibraryDrawer({
  isOpen,
  onClose,
  favorites,
  records,
  onToggleFavorite,
  onMarkHeard,
  onUnmark,
  onLocateFavorite,
  onLocateRecord
}: LibraryDrawerProps) {
  const { t } = useLanguage();
  const [tagFilter, setTagFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");

  const normalizedTag = tagFilter.trim().toLowerCase();
  const normalizedArea = areaFilter.trim().toLowerCase();

  const filteredFavorites = useMemo(() => {
    return favorites.filter((album) => {
      const areaMatch =
        !normalizedArea ||
        album.countryName.toLowerCase().includes(normalizedArea) ||
        album.cityName.toLowerCase().includes(normalizedArea) ||
        album.countryCode.toLowerCase() === normalizedArea;

      if (!normalizedTag) return areaMatch;
      const tagMatch = buildAlbumTags(album).some((t) => t.toLowerCase().includes(normalizedTag));
      return areaMatch && tagMatch;
    });
  }, [favorites, normalizedArea, normalizedTag]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const areaMatch =
        !normalizedArea ||
        (record.artistGeo.countryName ?? "").toLowerCase().includes(normalizedArea) ||
        (record.artistGeo.cityName ?? "").toLowerCase().includes(normalizedArea) ||
        record.artistGeo.countryCode?.toLowerCase() === normalizedArea;

      if (!normalizedTag) return areaMatch;
      const tagMatch = buildRecordTags(record).some((t) => t.toLowerCase().includes(normalizedTag));
      return areaMatch && tagMatch;
    });
  }, [records, normalizedArea, normalizedTag]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 220 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-[#0c0c0c]/95 border-l border-white/[0.06] shadow-2xl shadow-black/50 flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04]">
              <h2 className="text-base font-serif font-semibold text-[#ece8e1] tracking-tight">
                {t.library.title}
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-white/[0.04] text-[#9a948c] hover:text-[#ece8e1] transition-all"
              >
                <X size="16" />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-white/[0.04] flex flex-wrap gap-2 items-center text-sm">
              <div className="flex items-center gap-1.5 text-[#9a948c]">
                <Filter size="12" />
                <span className="text-[10px] tracking-wide uppercase">Filter</span>
              </div>
              <input
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                placeholder="By tag"
                className="bg-black/40 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-[#ece8e1] placeholder:text-[#9a948c] outline-none focus:border-[#c9a04a]/30 transition-all"
              />
              <input
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                placeholder="By region"
                className="bg-black/40 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-[#ece8e1] placeholder:text-[#9a948c] outline-none focus:border-[#c9a04a]/30 transition-all"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Favorites Section */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Heart size="14" className="text-[#8a4a5a]/60" />
                  <h3 className="font-medium text-xs uppercase tracking-[0.1em] text-[#8a4a5a]/80">
                    {t.library.favorites} ({favorites.length})
                  </h3>
                </div>
                {filteredFavorites.length === 0 ? (
                  <p className="text-sm text-[#9a948c]">{t.library.emptyFavorites}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredFavorites.map(album => (
                      <div key={album.id} className="flex gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.03] hover:border-white/[0.06] transition-all group">
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-black/40 shadow-sm">
                          <AlbumArtImage
                            artist={album.artistName}
                            album={album.albumTitle}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate text-[#ece8e1]">{album.albumTitle}</p>
                          <p className="text-xs text-[#9a948c] truncate">{album.artistName}</p>
                          {buildAlbumTags(album).length ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {buildAlbumTags(album).slice(0, 4).map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-[#9a948c] border border-white/[0.04]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                            <button
                              onClick={() => onMarkHeard(album)}
                              className="text-[10px] bg-[#4a8a6a]/15 text-[#4a8a6a]/80 px-2 py-0.5 rounded border border-[#4a8a6a]/15 hover:bg-[#4a8a6a]/25 hover:text-[#4a8a6a] transition-all font-medium"
                            >
                              Mark Heard
                            </button>
                            <button
                              onClick={() => onLocateFavorite(album)}
                              className="text-[10px] bg-white/[0.04] text-[#9a948c] px-2 py-0.5 rounded border border-white/[0.04] hover:text-[#ece8e1] hover:bg-white/[0.06] transition-all font-medium"
                            >
                              Locate
                            </button>
                            <button
                              onClick={() => onToggleFavorite(album)}
                              className="text-[10px] bg-[#8a4a5a]/15 text-[#8a4a5a]/80 px-2 py-0.5 rounded border border-[#8a4a5a]/15 hover:bg-[#8a4a5a]/25 hover:text-[#8a4a5a] transition-all font-medium"
                            >
                              Unfavorite
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* History Section */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <History size="14" className="text-[#4a8a6a]/60" />
                  <h3 className="font-medium text-xs uppercase tracking-[0.1em] text-[#4a8a6a]/80">
                    {t.library.history} ({filteredRecords.length})
                  </h3>
                </div>
                {filteredRecords.length === 0 ? (
                  <p className="text-sm text-[#9a948c]">{t.library.emptyHistory}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredRecords.slice(0, 20).map(record => (
                      <div key={record.id} className="flex gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.03] hover:border-white/[0.06] transition-all group relative">
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-black/40 shadow-sm">
                          <AlbumArtImage
                            artist={record.artistGeo.artistName}
                            album={record.albumTitle}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate text-[#ece8e1]">{record.albumTitle}</p>
                          <p className="text-xs text-[#9a948c] truncate">{record.artistGeo.artistName}</p>
                          <p className="text-[10px] text-[#9a948c] mt-1 tabular-nums">{record.releaseYear}</p>
                          {buildRecordTags(record).length ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {buildRecordTags(record).slice(0, 4).map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-[#9a948c] border border-white/[0.04]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-1.5 items-end justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
                          <button
                            onClick={() => onLocateRecord(record)}
                            className="text-[10px] bg-white/[0.04] text-[#9a948c] px-2 py-0.5 rounded border border-white/[0.04] hover:text-[#ece8e1] hover:bg-white/[0.06] transition-all font-medium"
                          >
                            Locate
                          </button>
                        </div>
                        <button
                          onClick={() => onUnmark(record)}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-all duration-200 p-1.5 rounded bg-white/[0.03] text-[#9a948c] hover:text-[#8a4a5a] hover:bg-[#8a4a5a]/10 border border-transparent hover:border-[#8a4a5a]/15"
                          title="Remove from history"
                        >
                          <Trash2 size="12" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
