"use client";

import { motion } from "framer-motion";
import { User, Key } from "lucide-react";

type AppNavbarProps = {
  userEmail?: string;
  isLocalMode: boolean;
  onOpenGuide: () => void;
  onOpenMbTokens?: () => void;
  onSignOut: () => void;
  onAuthClick: () => void;
};

export function AppNavbar({
  userEmail,
  isLocalMode,
  onOpenGuide,
  onOpenMbTokens,
  onSignOut,
  onAuthClick,
}: AppNavbarProps) {
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
          <h1 className="text-xl font-bold text-white tracking-tight">Music Geography</h1>
          <p className="text-xs text-zinc-400 font-medium tracking-wide uppercase">
            Personal Discovery Timeline
          </p>
        </div>
      </div>

      {/* Right Actions */}
      <div className="relative z-10 flex items-center gap-3">
        <button
          onClick={onOpenGuide}
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors backdrop-blur-md border border-white/5"
        >
          Guide & Info
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

        {userEmail ? (
          <div className="flex items-center gap-3 rounded-full bg-black/40 pl-4 pr-2 py-1.5 border border-white/10 backdrop-blur-md">
            <span className="text-sm text-zinc-300 hidden md:block">{userEmail}</span>
            <button
              onClick={onSignOut}
              className="rounded-full bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={onAuthClick}
            className="group flex items-center gap-2 rounded-full bg-white text-black px-5 py-2.5 text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
          >
            <User size={16} />
            <span>{isLocalMode ? "Local Mode" : "Sign In"}</span>
          </button>
        )}
      </div>
    </motion.header>
  );
}
