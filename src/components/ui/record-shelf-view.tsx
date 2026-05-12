"use client";

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  memo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowUpAZ, Clock, TrendingUp, ChevronUp } from "lucide-react";
import { AlbumArtImage } from "@/components/ui/album-art-image";
import { getAlbumCoverUrl } from "@/lib/assets/covers";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { UserRecord } from "@/lib/types";
import { pinyin } from "pinyin";

// ─── Types ──────────────────────────────────────────────

type SortMode = "artist" | "recent" | "top";

type GroupedSection = {
  key: string;
  label: string;
  records: UserRecord[];
};

// ─── Helpers ─────────────────────────────────────────────

function getArtistLetter(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  if (/[A-Z]/.test(c)) return c;
  // Chinese character → get pinyin initial
  if (/[一-鿿]/.test(c)) {
    try {
      const py = pinyin(c);
      const initial = py?.[0]?.[0]?.charAt(0).toUpperCase();
      if (initial && /[A-Z]/.test(initial)) return initial;
    } catch {
      /* fall through to # */
    }
  }
  return "#";
}

function getGroupKey(record: UserRecord, mode: SortMode): string {
  if (mode === "artist") return getArtistLetter(record.artistGeo.artistName);
  if (mode === "recent") {
    const days = Math.floor(
      (Date.now() - new Date(record.listenAt).getTime()) / 86400000,
    );
    if (days <= 7) return "7d";
    if (days <= 30) return "30d";
    if (days <= 90) return "90d";
    return "older";
  }
  // top
  return `star_${Math.round(record.score / 2)}`;
}

function groupLabel(key: string, mode: SortMode, isZh: boolean): string {
  if (mode === "artist") return key;
  if (mode === "recent") {
    return (
      (
        {
          "7d": isZh ? "最近一周" : "Past 7 Days",
          "30d": isZh ? "最近一月" : "Past 30 Days",
          "90d": isZh ? "最近三月" : "Past 90 Days",
          older: isZh ? "更早" : "Earlier",
        } as Record<string, string>
      )[key] || key
    );
  }
  // top
  const n = parseInt(key.replace("star_", ""), 10);
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function stableRotation(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h << 5) - h + id.charCodeAt(i);
  return ((h % 30) - 15) / 10;
}

function fmtDate(dateStr: string, isZh: boolean): string {
  return new Date(dateStr).toLocaleDateString(isZh ? "zh-CN" : "en-US", {
    year: "numeric",
    month: isZh ? "numeric" : "short",
    day: "numeric",
  });
}

function buildTags(r: UserRecord): string[] {
  const tags = [...(r.personalTags || [])];
  if (r.releaseYear) tags.push(`${Math.floor(r.releaseYear / 10) * 10}s`);
  return tags.slice(0, 6);
}

// ─── Star Icon ───────────────────────────────────────────

function StarI({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

// ─── Vinyl Record Card ──────────────────────────────────

const VinylRecordCard = memo(function VinylRecordCard({
  record,
  onClick,
}: {
  record: UserRecord;
  onClick: () => void;
}) {
  const rot = useMemo(() => stableRotation(record.id), [record.id]);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      onClick={onClick}
      className="group flex flex-col items-center gap-2.5 cursor-pointer outline-none"
      style={{ rotate: `${rot}deg` }}
      whileHover={{
        rotate: 0,
        y: -12,
        scale: 1.05,
        transition: { type: "spring", stiffness: 260, damping: 16 },
      }}
    >
      {/* Vinyl + Cover */}
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36 lg:w-40 lg:h-40">
        {/* Vinyl disc — visible on hover or as subtle shadow */}
        <motion.div
          className="absolute inset-[6%] rounded-full bg-gradient-to-br from-[#1a1a1a] via-[#0d0d0d] to-[#1a1a1a] shadow-inner shadow-black/70 ring-[1px] ring-white/[0.02]"
          whileHover={{ rotate: 360 }}
          transition={{ duration: 2, ease: "linear", repeat: Infinity }}
        >
          {/* Grooves */}
          <div className="absolute inset-[18%] rounded-full ring-[1px] ring-white/[0.02]" />
          <div className="absolute inset-[28%] rounded-full ring-[1px] ring-white/[0.015]" />
          <div className="absolute inset-[36%] rounded-full ring-[1px] ring-white/[0.01]" />
          {/* Label */}
          <div className="absolute inset-[30%] rounded-full bg-gradient-to-br from-[#2a1a1a] to-[#1a1010] ring-[1px] ring-white/[0.04] shadow-inner shadow-black/40" />
          {/* Spindle */}
          <div className="absolute inset-[44%] rounded-full bg-[#0c0c0c] ring-[1px] ring-white/[0.06]" />
        </motion.div>

        {/* Glow aura on hover */}
        <div className="absolute -inset-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
          <div className="w-full h-full rounded-xl bg-gradient-to-b from-[#c9a04a]/10 via-transparent to-[#c9a04a]/5 blur-xl" />
        </div>

        {/* Album cover */}
        <div className="relative w-full h-full rounded-lg overflow-hidden shadow-lg shadow-black/50 transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-black/80 group-hover:ring-2 group-hover:ring-[#c9a04a]/25 group-hover:brightness-110">
          <AlbumArtImage
            artist={record.artistGeo.artistName}
            album={record.albumTitle}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          {/* Subtle sheen */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        </div>
      </div>

      {/* Labels */}
      <div className="text-center max-w-[140px] px-1">
        <p className="text-xs font-[450] text-[#ece8e1] truncate leading-tight group-hover:text-white transition-colors duration-300">
          {record.artistGeo.artistName}
        </p>
        <p className="text-[10px] text-[#8a8680] truncate mt-0.5 leading-tight group-hover:text-[#a09888] transition-colors duration-300">
          {record.albumTitle}
        </p>
      </div>
    </motion.button>
  );
});

// ─── Stack Card ─────────────────────────────────────────

const StackCard = memo(function StackCard({
  records,
  onClick,
}: {
  records: UserRecord[];
  onClick: () => void;
}) {
  const topRecord = records[0];
  const count = records.length;

  // Generate distinct placeholder SVGs for the underlying stack layers (no network calls)
  const stackLayers = useMemo(() => {
    return records.slice(1, 4).map((r) =>
      getAlbumCoverUrl(r.artistGeo.artistName, r.albumTitle, "medium"),
    );
  }, [records]);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      onClick={onClick}
      className="group flex flex-col items-center gap-2.5 cursor-pointer outline-none"
      whileHover={{
        y: -12,
        scale: 1.05,
        transition: { type: "spring", stiffness: 260, damping: 16 },
      }}
    >
      {/* Cover area */}
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36 lg:w-40 lg:h-40">
        {/* Stacked depth layers — distinct placeholder SVGs, no API calls */}
        {count > 2 && (
          <div
            className="absolute inset-0 rounded-lg overflow-hidden shadow-lg shadow-black/30 ring-1 ring-white/[0.04] transition-all duration-300 group-hover:shadow-xl group-hover:shadow-black/50"
            style={{ transform: "translate(8px, 8px)", zIndex: 0 }}
          >
            <img
              src={stackLayers[1] ?? stackLayers[0]}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/[0.04]" />
          </div>
        )}
        {count > 1 && (
          <div
            className="absolute inset-0 rounded-lg overflow-hidden shadow-lg shadow-black/30 ring-1 ring-white/[0.04] transition-all duration-300 group-hover:shadow-xl group-hover:shadow-black/50"
            style={{ transform: "translate(4px, 4px)", zIndex: 1 }}
          >
            <img
              src={stackLayers[0]}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/[0.04]" />
          </div>
        )}

        {/* Glow aura */}
        <div className="absolute -inset-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ zIndex: 3 }}>
          <div className="w-full h-full rounded-xl bg-gradient-to-b from-[#c9a04a]/10 via-transparent to-[#c9a04a]/5 blur-xl" />
        </div>

        {/* Top cover */}
        <div
          className="relative w-full h-full rounded-lg overflow-hidden shadow-lg shadow-black/50 transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-black/80 group-hover:ring-2 group-hover:ring-[#c9a04a]/25 group-hover:brightness-110"
          style={{ zIndex: 2 }}
        >
          <AlbumArtImage
            artist={topRecord.artistGeo.artistName}
            album={topRecord.albumTitle}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>

        {/* Count badge */}
        <div className="absolute -top-1.5 -right-1.5 z-10 w-[22px] h-[22px] rounded-full bg-[#c9a04a] text-[#0c0c0c] text-[10px] font-bold flex items-center justify-center shadow-lg shadow-black/40 ring-1 ring-[#c9a04a]/30">
          {count}
        </div>
      </div>

      {/* Labels */}
      <div className="text-center max-w-[140px] px-1">
        <p className="text-xs font-[450] text-[#ece8e1] truncate leading-tight group-hover:text-white transition-colors duration-300">
          {topRecord.artistGeo.artistName}
        </p>
        <p className="text-[10px] text-[#8a8680] truncate mt-0.5 leading-tight group-hover:text-[#a09888] transition-colors duration-300">
          {count} {count > 1 ? "albums" : "album"}
        </p>
      </div>
    </motion.button>
  );
});

// ─── Detail Modal ───────────────────────────────────────

function DetailModal({
  record,
  onClose,
  onScoreUpdate,
  accessToken,
}: {
  record: UserRecord | null;
  onClose: () => void;
  onScoreUpdate: (recordId: string, newScore: number) => void;
  accessToken?: string;
}) {
  const { language } = useLanguage();
  const isZh = language === "zh";
  const [updatingScore, setUpdatingScore] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [record]);

  const score = record ? Math.round(record.score / 2) : 0;
  const tags = record ? buildTags(record) : [];

  return (
    <AnimatePresence>
      {record && (
        <motion.div
          key={record.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", damping: 26, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg bg-[#141414]/95 border border-white/[0.06] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/60 text-[#8a8680] hover:text-[#ece8e1] hover:bg-black/80 transition-all backdrop-blur-sm"
            >
              <X size={16} />
            </button>

            {/* Hero: Cover with vinyl behind */}
            <div className="w-full aspect-[3/2] relative overflow-hidden bg-[#0c0c0c] flex items-center justify-center">
              {/* Spinning vinyl behind cover */}
              <motion.div
                className="absolute w-[70%] aspect-square rounded-full bg-gradient-to-br from-[#1a1a1a] via-[#0d0d0d] to-[#1a1a1a] shadow-inner shadow-black/70 ring-[1px] ring-white/[0.03]"
                animate={{ rotate: 360 }}
                transition={{ duration: 3, ease: "linear", repeat: Infinity }}
              >
                <div className="absolute inset-[18%] rounded-full ring-[1px] ring-white/[0.02]" />
                <div className="absolute inset-[28%] rounded-full ring-[1px] ring-white/[0.015]" />
                <div className="absolute inset-[36%] rounded-full ring-[1px] ring-white/[0.01]" />
                <div className="absolute inset-[30%] rounded-full bg-gradient-to-br from-[#2a1a1a] to-[#1a1010] ring-[1px] ring-white/[0.04]" />
                <div className="absolute inset-[44%] rounded-full bg-[#0c0c0c] ring-[1px] ring-white/[0.06]" />
              </motion.div>

              <AlbumArtImage
                artist={record.artistGeo.artistName}
                album={record.albumTitle}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0c] via-[#0c0c0c]/20 to-transparent" />
            </div>

            {/* Details */}
            <div className="p-6 pt-4 space-y-5">
              <div>
                <h2 className="text-xl font-serif font-bold text-[#ece8e1] leading-tight tracking-tight">
                  {record.albumTitle}
                </h2>
                <p className="text-sm text-[#9a948c] mt-1 font-[450]">
                  {record.artistGeo.artistName}
                </p>
              </div>

              {/* Interactive Stars */}
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => {
                  const starValue = i + 1;
                  const filled = starValue <= score;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={updatingScore || !record}
                      onClick={(e) => {
                        e.stopPropagation();
                        const newScore = starValue * 2;
                        setUpdatingScore(true);

                        const doUpdate = async () => {
                          if (accessToken) {
                            try {
                              const res = await fetch("/api/records", {
                                method: "PATCH",
                                headers: {
                                  "Content-Type": "application/json",
                                  Authorization: `Bearer ${accessToken}`,
                                },
                                body: JSON.stringify({
                                  albumTitle: record!.albumTitle,
                                  artistName: record!.artistGeo.artistName,
                                  score: newScore,
                                }),
                              });
                              if (!res.ok) throw new Error();
                            } catch {
                              setUpdatingScore(false);
                              return;
                            }
                          }
                          onScoreUpdate(record!.id, newScore);
                          setUpdatingScore(false);
                        };

                        doUpdate();
                      }}
                      className={`p-0.5 transition-all ${
                        filled
                          ? "text-[#c9a04a] fill-[#c9a04a]"
                          : "text-[#3a3835] hover:text-[#5a5854]"
                      } ${updatingScore ? "opacity-50 cursor-wait" : "cursor-pointer hover:scale-110"}`}
                    >
                      <StarI
                        className={`w-5 h-5 transition-transform ${
                          filled
                            ? "text-[#c9a04a] fill-[#c9a04a]"
                            : "text-[#3a3835]"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-3 gap-4 pt-1">
                <div className="space-y-1">
                  <p className="text-[9px] text-[#5a5854] uppercase tracking-[0.15em] font-medium">
                    {isZh ? "听过" : "Listened"}
                  </p>
                  <p className="text-xs text-[#ece8e1] tabular-nums font-[450]">
                    {fmtDate(record.listenAt, isZh)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] text-[#5a5854] uppercase tracking-[0.15em] font-medium">
                    {isZh ? "发行" : "Released"}
                  </p>
                  <p className="text-xs text-[#ece8e1] tabular-nums font-[450]">
                    {record.releaseYear || "—"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] text-[#5a5854] uppercase tracking-[0.15em] font-medium">
                    {isZh ? "评分" : "Score"}
                  </p>
                  <p className="text-xs text-[#ece8e1] tabular-nums font-[450]">
                    {record.score}/10
                  </p>
                </div>
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/[0.03] text-[#8a8680] border border-white/[0.04] font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Record Shelf View ──────────────────────────────────

export function RecordShelfView({
  records,
  onScoreUpdate,
  accessToken,
}: {
  records: UserRecord[];
  onScoreUpdate?: (recordId: string, newScore: number) => void;
  accessToken?: string;
}) {
  const { t, language } = useLanguage();
  const isZh = language === "zh";
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefMap = useRef<Map<string, HTMLElement>>(new Map());
  const [sortMode, setSortMode] = useState<SortMode>("artist");
  const [selectedRecord, setSelectedRecord] = useState<UserRecord | null>(null);
  const [showBackTop, setShowBackTop] = useState(false);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const [expandedArtists, setExpandedArtists] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const initialRenderDone = useRef(false);

  // ── Group & sort ──

  const groups = useMemo<GroupedSection[]>(() => {
    if (!records.length) return [];

    const sorted = [...records].sort((a, b) => {
      if (sortMode === "artist") {
        const collator = new Intl.Collator("zh");
        return collator.compare(a.artistGeo.artistName, b.artistGeo.artistName);
      }
      if (sortMode === "recent")
        return (
          new Date(b.listenAt).getTime() - new Date(a.listenAt).getTime()
        );
      return b.score - a.score;
    });

    const map = new Map<string, UserRecord[]>();
    for (const r of sorted) {
      const k = getGroupKey(r, sortMode);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }

    let keys: string[];
    if (sortMode === "artist") {
      keys = Array.from(map.keys()).sort((a, b) => {
        if (a === "#") return 1;
        if (b === "#") return -1;
        return a.localeCompare(b);
      });
    } else if (sortMode === "recent") {
      keys = ["7d", "30d", "90d", "older"].filter((k) => map.has(k));
    } else {
      keys = Array.from(map.keys()).sort((a, b) => {
        const na = parseInt(a.replace("star_", ""), 10);
        const nb = parseInt(b.replace("star_", ""), 10);
        return nb - na;
      });
    }

    return keys.map((k) => ({
      key: k,
      label: groupLabel(k, sortMode, isZh),
      records: map.get(k)!,
    }));
  }, [records, sortMode, isZh]);

  // ── Quick-nav letters ──

  const availableLetters = useMemo(() => {
    if (sortMode !== "artist") return new Set<string>();
    const s = new Set<string>();
    for (const r of records)
      s.add(getArtistLetter(r.artistGeo.artistName));
    return s;
  }, [records, sortMode]);

  const allLetters = useMemo(
    () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
    [],
  );

  // ── Scroll to section ──

  const scrollToSection = useCallback((key: string) => {
    const el = sectionRefMap.current.get(key);
    if (el) {
      const top = el.getBoundingClientRect().top + (scrollRef.current?.scrollTop ?? 0) - 120;
      scrollRef.current?.scrollTo({ top, behavior: "smooth" });
    }
  }, []);

  // ── Back-to-top visibility ──

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => setShowBackTop(el.scrollTop > 400);
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  // ── IntersectionObserver for lazy section visibility ──

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisibleSections((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const key = (entry.target as HTMLElement).dataset.sectionKey;
            if (!key) continue;
            if (entry.isIntersecting) next.add(key);
            else next.delete(key);
          }
          return next;
        });
      },
      { rootMargin: "400px 0px" },
    );

    // Observe all existing section elements
    for (const [key, el] of sectionRefMap.current.entries()) {
      el.dataset.sectionKey = key;
      observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [groups]);

  // Mark initial render complete after first frame, reset on sort change
  useEffect(() => {
    initialRenderDone.current = false;
    const raf = requestAnimationFrame(() => {
      initialRenderDone.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [sortMode]);

  // ── Sort controls ──

  const handleSortMode = useCallback((mode: SortMode) => {
    initialRenderDone.current = false;
    setSortMode(mode);
    setExpandedArtists(new Set());
  }, []);

  const toggleArtistExpanded = useCallback((artistKey: string) => {
    setExpandedArtists((prev) => {
      const next = new Set(prev);
      if (next.has(artistKey)) next.delete(artistKey);
      else next.add(artistKey);
      return next;
    });
  }, []);

  const sortItems: { mode: SortMode; icon: typeof ArrowUpAZ; label: string }[] = [
    { mode: "artist", icon: ArrowUpAZ, label: t.shelf.sortArtist },
    { mode: "recent", icon: Clock, label: t.shelf.sortRecent },
    { mode: "top", icon: TrendingUp, label: t.shelf.sortTop },
  ];

  const totalAlbums = groups.reduce((s, g) => s + g.records.length, 0);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0c0c0c] selection:bg-[#c9a04a]/20">
      {/* ── Ambient Noise, Light & Vignette ── */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.02]"
        style={{
          backgroundImage:
            `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      {/* Warm top glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 pointer-events-none z-0"
        style={{
          width: "900px",
          height: "700px",
          opacity: 0.04,
          background:
            "radial-gradient(ellipse at center, #c9a04a 0%, transparent 70%)",
        }}
      />
      {/* Warm bottom glow */}
      <div
        className="fixed bottom-0 right-0 pointer-events-none z-0"
        style={{
          width: "500px",
          height: "400px",
          opacity: 0.025,
          background:
            "radial-gradient(ellipse at center, #c9a04a 0%, transparent 70%)",
        }}
      />
      {/* Subtle vignette */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
        }}
      />

      {/* ── Header ── */}
      <div className="relative z-10 sticky top-0 bg-gradient-to-b from-[#0c0c0c] via-[#0c0c0c]/95 to-transparent pt-[72px] pb-5 px-6 md:px-10">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h2 className="text-lg font-serif font-bold text-[#ece8e1] tracking-tight">
              {t.shelf.title}
            </h2>
            <p className="text-[11px] text-[#5a5854] mt-0.5 tabular-nums">
              {totalAlbums} {isZh ? "张专辑" : "albums"}
            </p>
          </div>

          <div className="flex items-center gap-1 bg-[#141414]/80 border border-white/[0.06] rounded-lg p-0.5">
            {sortItems.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleSortMode(mode)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-all ${
                  sortMode === mode
                    ? "bg-[#c9a04a]/10 text-[#c9a04a] border border-[#c9a04a]/15 shadow-sm"
                    : "text-[#5a5854] hover:text-[#8a8680] border border-transparent"
                }`}
              >
                <Icon size={12} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scrollable Shelves ── */}
      <div
        ref={scrollRef}
        className="relative z-0 h-full overflow-y-auto px-6 md:px-10 pb-40 custom-scrollbar"
      >
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center max-w-7xl mx-auto">
            <div className="w-20 h-20 rounded-full bg-[#141414] border border-white/[0.06] flex items-center justify-center mb-5">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-[#3a3835]"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v20M2 12h20" />
              </svg>
            </div>
            <p className="text-sm text-[#5a5854] max-w-[220px] leading-relaxed">
              {t.shelf.emptyState}
            </p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            {groups.map((group) => (
              <section
                key={group.key}
                data-section-key={group.key}
                ref={(el) => {
                  if (el) sectionRefMap.current.set(group.key, el);
                  else sectionRefMap.current.delete(group.key);
                }}
                className="mb-14 last:mb-0"
              >
                {/* Section Header */}
                <div className="flex items-center gap-5 mb-8 select-none">
                  <span className="text-6xl md:text-7xl font-serif font-bold text-[#ece8e1]/[0.04] leading-none tracking-tight">
                    {group.key}
                  </span>
                  <div className="flex-1 h-px relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#c9a04a]/15 via-[#c9a04a]/[0.04] to-transparent" />
                    {/* Ornament */}
                    <div className="absolute left-1/2 -top-[3px] -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-[#c9a04a]/20 ring-[1px] ring-[#c9a04a]/10" />
                  </div>
                  <span className="text-[10px] font-mono text-[#5a5854] tabular-nums tracking-wider">
                    {String(group.records.length).padStart(2, "0")}
                  </span>
                </div>

                {/* Non-artist label */}
                {sortMode !== "artist" && (
                  <div className="mb-4 px-1">
                    <span className="text-xs font-medium text-[#8a8680]">
                      {group.label}
                    </span>
                  </div>
                )}

                {/* Albums + Shelf */}
                <div className="relative">
                  {sortMode === "artist" ? (
                    /* Artist stacks — flattened into grid, click to expand inline */
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 md:gap-5 pb-8">
                      {Array.from(
                        group.records.reduce((acc, r) => {
                          const name = r.artistGeo.artistName;
                          if (!acc.has(name)) acc.set(name, []);
                          acc.get(name)!.push(r);
                          return acc;
                        }, new Map<string, UserRecord[]>())
                      ).flatMap(([artistName, artistRecords]) => {
                        const artistKey = `${group.key}||${artistName}`;
                        const isExpanded = expandedArtists.has(artistKey);

                        if (isExpanded || artistRecords.length === 1) {
                          return artistRecords.map((record) => (
                            <motion.div
                              key={record.id}
                              layout
                              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                              className="flex justify-center"
                            >
                              <VinylRecordCard
                                record={record}
                                onClick={() => setSelectedRecord(record)}
                              />
                            </motion.div>
                          ));
                        }

                        return (
                          <motion.div
                            key={artistKey}
                            layout
                            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                            className="flex justify-center"
                          >
                            <StackCard
                              records={artistRecords}
                              onClick={() => toggleArtistExpanded(artistKey)}
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Default grid layout for recent/top sort modes */
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 md:gap-5 pb-8">
                      {group.records.map((record, idx) => {
                        const shouldAnimate = visibleSections.has(group.key) || !initialRenderDone.current;
                        return (
                          <motion.div
                            key={record.id}
                            initial={shouldAnimate ? { opacity: 0, y: 20 } : false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={shouldAnimate ? { delay: Math.min(idx * 0.02, 0.15) } : { duration: 0 }}
                            className="flex justify-center"
                          >
                            <VinylRecordCard
                              record={record}
                              onClick={() => setSelectedRecord(record)}
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                  )}

                  {/* Shelf edge — warm wood with gold trim */}
                  <div className="absolute bottom-0 left-0 right-0 h-4 pointer-events-none">
                    {/* Wood grain body */}
                    <div
                      className="h-3 rounded-b-sm"
                      style={{
                        background:
                          "linear-gradient(180deg, #2a2018 0%, #241810 25%, #2a1a10 50%, #1a1008 75%, #0f0a08 100%)",
                      }}
                    />
                    {/* Wood grain lines */}
                    <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-[#3a2818]/30 to-transparent" />
                    <div className="absolute top-[40%] left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-[#3a2818]/20 to-transparent" />
                    <div className="absolute top-[70%] left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[#3a2818]/15 to-transparent" />
                    {/* Gold accent strip */}
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#c9a04a]/12 to-transparent" />
                    {/* Bottom shadow */}
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-black/40" />
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick Jump Nav (A-Z) ── */}
      {sortMode === "artist" && records.length > 0 && (
        <nav className="fixed right-4 top-1/2 -translate-y-1/2 z-10 hidden lg:flex flex-col items-center">
          {/* Panel background */}
          <div className="absolute inset-0 -left-3 rounded-xl bg-[#0c0c0c]/60 backdrop-blur-sm border border-white/[0.04] shadow-lg shadow-black/30" />

          {/* Gold accent line */}
          <div className="absolute top-3 bottom-3 left-0 w-px bg-gradient-to-b from-transparent via-[#c9a04a]/10 to-transparent" />

          <div className="relative flex flex-col items-center py-3 px-2 gap-[2px]">
            {allLetters.map((letter) => {
              const active = availableLetters.has(letter);
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => active && scrollToSection(letter)}
                  className={`relative text-[9px] font-mono leading-none py-[3px] px-[6px] rounded transition-all ${
                    active
                      ? "text-[#5a5854] hover:text-[#c9a04a] hover:bg-[#c9a04a]/5 cursor-pointer"
                      : "text-[#1c1c1c] cursor-default"
                  }`}
                  disabled={!active}
                >
                  {letter}
                  {active && (
                    <span className="absolute -right-[2px] top-1/2 -translate-y-1/2 w-[2px] h-[2px] rounded-full bg-[#c9a04a]/30" />
                  )}
                </button>
              );
            })}
            {availableLetters.has("#") && (
              <button
                type="button"
                onClick={() => scrollToSection("#")}
                className="text-[9px] font-mono leading-none py-[3px] px-[6px] rounded text-[#5a5854] hover:text-[#c9a04a] hover:bg-[#c9a04a]/5 transition-all cursor-pointer"
              >
                #
              </button>
            )}
          </div>
        </nav>
      )}

      {/* ── Back to Top ── */}
      <AnimatePresence>
        {showBackTop && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() =>
              scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
            }
            className="fixed bottom-8 right-8 z-10 p-2.5 rounded-full bg-[#141414]/80 border border-white/[0.06] text-[#5a5854] hover:text-[#c9a04a] hover:border-[#c9a04a]/20 shadow-lg backdrop-blur-sm transition-all"
          >
            <ChevronUp size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Detail Modal ── */}
      <DetailModal
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
        onScoreUpdate={(id, newScore) => {
          onScoreUpdate?.(id, newScore);
          // Also update local selected record so stars animate immediately
          setSelectedRecord((prev) =>
            prev?.id === id ? { ...prev, score: newScore } : prev,
          );
        }}
        accessToken={accessToken}
      />
    </div>
  );
}
