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
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />
          
          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-zinc-950 border-l border-white/10 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                {t.library.title}
              </h2>
              <button 
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-white/5 flex flex-wrap gap-3 items-center text-sm text-zinc-200">
              <div className="flex items-center gap-2 text-zinc-400">
                <Filter size={14} /> 筛选
              </div>
              <input
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                placeholder="按标签 (MB 或个人标签)"
                className="bg-zinc-900 border border-white/10 rounded px-3 py-1 text-sm text-white placeholder:text-zinc-500"
              />
              <input
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                placeholder="按地区 (国家/城市/代码)"
                className="bg-zinc-900 border border-white/10 rounded px-3 py-1 text-sm text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Favorites Section */}
              <section>
                <div className="flex items-center gap-2 mb-4 text-pink-400">
                  <Heart size={18} />
                  <h3 className="font-semibold text-sm uppercase tracking-wider">{t.library.favorites} ({favorites.length})</h3>
                </div>
                {filteredFavorites.length === 0 ? (
                  <p className="text-sm text-zinc-500 italic">{t.library.emptyFavorites}</p>
                ) : (
                  <div className="grid gap-3">
                    {filteredFavorites.map(album => (
                      <div key={album.id} className="flex gap-3 p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-zinc-800">
                          <AlbumArtImage 
                            artist={album.artistName}
                            album={album.albumTitle}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate text-white">{album.albumTitle}</p>
                          <p className="text-xs text-zinc-400 truncate">{album.artistName}</p>
                          {buildAlbumTags(album).length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {buildAlbumTags(album).map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                               onClick={() => onMarkHeard(album)}
                               className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 hover:bg-emerald-500/30"
                             >
                               Mark Heard
                             </button>
                              <button 
                                onClick={() => onLocateFavorite(album)}
                                className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 hover:bg-blue-500/30"
                              >
                                定位到地图
                              </button>
                             <button 
                               onClick={() => onToggleFavorite(album)}
                               className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/20 hover:bg-red-500/30"
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
                <div className="flex items-center gap-2 mb-4 text-emerald-400">
                  <History size={18} />
                  <h3 className="font-semibold text-sm uppercase tracking-wider">{t.library.history} ({filteredRecords.length})</h3>
                </div>
                {filteredRecords.length === 0 ? (
                  <p className="text-sm text-zinc-500 italic">{t.library.emptyHistory}</p>
                ) : (
                  <div className="grid gap-3">
                    {filteredRecords.slice(0, 20).map(record => (
                      <div key={record.id} className="flex gap-3 p-3 rounded-lg bg-emerald-900/10 border border-emerald-500/10 hover:bg-emerald-900/20 transition-colors group relative">
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-zinc-800 grayscale-[0.5]">
                          <AlbumArtImage 
                            artist={record.artistGeo.artistName}
                            album={record.albumTitle}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate text-white">{record.albumTitle}</p>
                          <p className="text-xs text-zinc-400 truncate">{record.artistGeo.artistName}</p>
                          <p className="text-[10px] text-zinc-600 mt-1">{record.releaseYear}</p>
                          {buildRecordTags(record).length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {buildRecordTags(record).map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-200 border border-blue-500/20"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-1 items-end justify-center opacity-0 group-hover:opacity-100 transition-opacity mr-6">
                          <button
                            onClick={() => onLocateRecord(record)}
                            className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20 hover:bg-blue-500/30"
                          >
                            定位
                          </button>
                        </div>
                        <button
                          onClick={() => onUnmark(record)}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition"
                          title="Remove from history"
                        >
                          <Trash2 size={14} />
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
