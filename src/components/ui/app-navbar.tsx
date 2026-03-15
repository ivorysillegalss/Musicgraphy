"use client";

import { motion } from "framer-motion";
import { User, Key, Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type AppNavbarProps = {
  userEmail?: string;
  isLocalMode: boolean;
  onOpenGuide: () => void;
  onOpenMbTokens?: () => void;
  onOpenManage?: () => void;
  onSignOut: () => void;
  onAuthClick: () => void;
};

export function AppNavbar({
  userEmail,
  isLocalMode,
  onOpenGuide,
  onOpenMbTokens,
  onOpenManage,
  onSignOut,
  onAuthClick,
}: AppNavbarProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
    >
      {/* Glass Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm pointer-events-none" />

      {/* Logo & Title */}
      <div className="relative z-10 flex items-center gap-4">
        <div className="h-10 w-10 overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
          <div className="flex h-full w-full items-center justify-center text-white font-bold text-lg">
            M
          </div>
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">{t.navbar.title}</h1>
          <p className="text-xs text-zinc-400 font-medium tracking-wide uppercase">
            {t.navbar.subtitle}
          </p>
        </div>
      </div>

      {/* Right Actions */}
      <div className="relative z-10 flex items-center gap-3">
        <button
          onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
          className="flex items-center justify-center p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-zinc-300"
          title={language === 'en' ? '切换到中文' : 'Switch to English'}
        >
          <Globe size={18} />
          <span className="ml-1.5 text-xs font-semibold">{language === 'en' ? 'EN' : '中'}</span>
        </button>

        <button
          onClick={onOpenGuide}
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors backdrop-blur-md border border-white/5"
        >
          {t.navbar.guide}
        </button>

        {userEmail && onOpenMbTokens && (
          <button
            onClick={onOpenMbTokens}
            className="flex items-center gap-2 rounded-full bg-amber-400/90 px-4 py-2 text-sm font-semibold text-black shadow-lg hover:shadow-xl hover:scale-105 transition-all"
          >
            <Key size={16} />
            <span>MB Tokens</span>
          </button>
        )}

        {userEmail && onOpenManage && (
          <button
            onClick={onOpenManage}
            className="rounded-full bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-lg hover:bg-cyan-500/30 transition-colors border border-cyan-400/30"
          >
            {t.navbar.manageGeo}
          </button>
        )}

        {userEmail ? (
          <div className="flex items-center gap-3 rounded-full bg-black/40 pl-4 pr-2 py-1.5 border border-white/10 backdrop-blur-md">
            <span className="text-sm text-zinc-300 hidden md:block">{userEmail}</span>
            <button
              onClick={onSignOut}
              className="rounded-full bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
            >
              {t.navbar.signOut}
            </button>
          </div>
        ) : (
          <button
            onClick={onAuthClick}
            className="group flex items-center gap-2 rounded-full bg-white text-black px-5 py-2.5 text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
          >
            <User size={16} />
            <span>{isLocalMode ? t.navbar.localMode : t.navbar.signIn}</span>
          </button>
        )}
      </div>
    </motion.header>
  );
}
