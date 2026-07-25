"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Map, Disc, User, Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useState } from "react";

type AppNavbarProps = {
  userEmail?: string;
  isLocalMode: boolean;
  viewMode: "map" | "shelf";
  onViewModeChange: (mode: "map" | "shelf") => void;
  onOpenGuide: () => void;
  onOpenLibrary?: () => void;
  onOpenMbTokens?: () => void;
  onOpenNeteaseImport?: () => void;
  onOpenManage?: () => void;
  onSignOut: () => void;
  onAuthClick: () => void;
};

export function AppNavbar({
  userEmail,
  isLocalMode,
  viewMode,
  onViewModeChange,
  onOpenGuide,
  onOpenLibrary,
  onOpenMbTokens,
  onOpenNeteaseImport,
  onOpenManage,
  onSignOut,
  onAuthClick,
}: AppNavbarProps) {
  const { language, setLanguage, t } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 280 }}
      className="fixed top-0 left-0 right-0 z-50 px-6"
    >
      <div className="w-full max-w-6xl mx-auto px-6 py-3 relative flex items-center justify-between bg-[var(--bg-espresso)]/90 backdrop-blur-xl border border-[var(--edge-soft)] rounded-2xl shadow-2xl shadow-black/60 pointer-events-auto">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-[#c9a04a]/10 border border-[#c9a04a]/20 flex items-center justify-center">
            <span className="text-[13px] font-bold text-[#c9a04a] tracking-tight">M</span>
          </div>
          <div>
            <h1 className="text-base font-serif font-bold text-[#ece8e1] tracking-tight leading-none">
              {t.navbar.title}
            </h1>
            <p className="text-[10px] text-[var(--text-dim)] font-medium tracking-[0.12em] uppercase mt-0.5">
              {t.navbar.subtitle}
            </p>
          </div>
        </div>

        {/* View Toggle */}
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 bg-[#141414]/60 border border-white/[0.06] rounded-lg p-0.5">
          <button
            onClick={() => onViewModeChange("map")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-all ${
              viewMode === "map"
                ? "bg-[#c9a04a]/10 text-[#c9a04a] border border-[#c9a04a]/15 shadow-sm"
                : "text-[var(--text-dim)] hover:text-[#8a8680] border border-transparent"
            }`}
          >
            <Map size={12} />
            <span>Map</span>
          </button>
          <button
            onClick={() => onViewModeChange("shelf")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-all ${
              viewMode === "shelf"
                ? "bg-[#c9a04a]/10 text-[#c9a04a] border border-[#c9a04a]/15 shadow-sm"
                : "text-[var(--text-dim)] hover:text-[#8a8680] border border-transparent"
            }`}
          >
            <Disc size={12} />
            <span>Shelf</span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setLanguage(language === "en" ? "zh" : "en")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-dim)] hover:text-[#ece8e1] hover:bg-white/[0.04] transition-all"
            title={language === "en" ? "切换到中文" : "Switch to English"}
          >
            <Globe size={13} />
            <span>{language === "en" ? "EN" : "中"}</span>
          </button>

          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open menu"
              className="p-2 rounded-md text-[var(--text-dim)] hover:text-[#ece8e1] hover:bg-white/[0.04]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          <button
            onClick={onOpenGuide}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-dim)] hover:text-[#ece8e1] hover:bg-white/[0.04] transition-all"
          >
            {t.navbar.guide}
          </button>

          {userEmail && onOpenMbTokens && (
            <button
              onClick={onOpenMbTokens}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[#c9a04a]/70 hover:text-[#c9a04a] hover:bg-[#c9a04a]/[0.06] transition-all"
            >
              <span>MB</span>
            </button>
          )}

          {userEmail && onOpenNeteaseImport && (
            <button
              onClick={onOpenNeteaseImport}
              className="hidden md:block px-3 py-1.5 rounded-lg text-[11px] font-medium text-[#c9a04a]/70 hover:text-[#c9a04a] hover:bg-[#c9a04a]/[0.06] transition-all"
            >
              NetEase
            </button>
          )}

          {userEmail && onOpenManage && (
            <button
              onClick={onOpenManage}
              className="hidden md:block px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-dim)] hover:text-[#ece8e1] hover:bg-white/[0.04] transition-all"
            >
              {t.navbar.manageGeo}
            </button>
          )}

          {userEmail ? (
            <div className="flex items-center gap-2 pl-3 border-l border-white/[0.06]">
              <span className="text-[11px] text-[var(--text-dim)] hidden md:block max-w-[120px] truncate">
                {userEmail}
              </span>
              <button
                onClick={onSignOut}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-dim)] hover:text-[#8a4a5a] hover:bg-[#8a4a5a]/[0.06] transition-all"
              >
                {t.navbar.signOut}
              </button>
            </div>
          ) : (
            <button
              onClick={onAuthClick}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-white/[0.08] text-[11px] font-medium text-[#ece8e1] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all"
            >
              <User size={13} />
              <span>{isLocalMode ? t.navbar.localMode : t.navbar.signIn}</span>
            </button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="fixed inset-x-4 top-16 z-60 md:hidden"
          >
            <div className="absolute inset-0 -top-16 bg-black/30 backdrop-blur-[2px]" onClick={() => setIsMobileMenuOpen(false)} />
            <motion.div
              initial={{ scale: 0.98 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
              className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--bg-elevated)]/96 shadow-2xl shadow-black/45"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <div className="text-xs font-semibold tracking-[0.18em] uppercase text-[var(--text-dim)]">Menu</div>
                <button onClick={() => setIsMobileMenuOpen(false)} aria-label="Close menu" className="rounded-md p-2 text-[var(--text-dim)] hover:bg-white/[0.04] hover:text-white">✕</button>
              </div>
              <div className="grid gap-1 p-2">
                <button onClick={() => { setIsMobileMenuOpen(false); onViewModeChange("map"); }} className="rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.04]">Map</button>
                <button onClick={() => { setIsMobileMenuOpen(false); onViewModeChange("shelf"); }} className="rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.04]">Shelf</button>
                <button onClick={() => { setIsMobileMenuOpen(false); onOpenGuide(); }} className="rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.04]">{t.navbar.guide}</button>
                {onOpenLibrary && <button onClick={() => { setIsMobileMenuOpen(false); onOpenLibrary(); }} className="rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.04]">Library</button>}
                {onOpenMbTokens && <button onClick={() => { setIsMobileMenuOpen(false); onOpenMbTokens(); }} className="rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.04]">MB</button>}
                {onOpenNeteaseImport && <button onClick={() => { setIsMobileMenuOpen(false); onOpenNeteaseImport(); }} className="rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.04]">NetEase</button>}
                {onOpenManage && <button onClick={() => { setIsMobileMenuOpen(false); onOpenManage(); }} className="rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.04]">{t.navbar.manageGeo}</button>}
                <div className="mt-1 border-t border-white/[0.06] pt-1">
                  {userEmail ? (
                    <button onClick={() => { setIsMobileMenuOpen(false); onSignOut(); }} className="w-full rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.04]">{t.navbar.signOut}</button>
                  ) : (
                    <button onClick={() => { setIsMobileMenuOpen(false); onAuthClick(); }} className="w-full rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.04]">{isLocalMode ? t.navbar.localMode : t.navbar.signIn}</button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </motion.header>
  );
}
