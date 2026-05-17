"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Music2, Globe, Calendar, Search } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type GuideModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isConfigured: boolean;
};

export function GuideModal({ isOpen, onClose, isConfigured }: GuideModalProps) {
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.94, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 16, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="w-full max-w-xl rounded-xl border border-white/[0.06] bg-[var(--bg-secondary)] shadow-2xl shadow-black/30 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04]">
              <h2 className="text-lg font-serif font-semibold text-[var(--color-text)] tracking-tight">
                {t.guide.welcome}
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md bg-white/[0.03] text-[#9a948c] hover:bg-white/[0.06] hover:text-[var(--color-text)] transition-all"
              >
                <X size="16" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Feature Grid */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 group">
                    <div className="p-2 rounded-lg bg-[var(--accent-green)]/8 text-[var(--accent-green)]/70 border border-[var(--accent-green)]/10 group-hover:border-[var(--accent-green)]/20 transition-all flex-shrink-0">
                      <Globe size="16" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm text-[var(--color-text)]">{t.guide.explorerTitle}</h3>
                      <p className="text-xs text-[#9a948c] mt-1 leading-relaxed">
                        {t.guide.explorerDesc}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 group">
                    <div className="p-2 rounded-lg bg-[#4a8a6a]/10 text-[#4a8a6a]/70 border border-[#4a8a6a]/10 group-hover:border-[#4a8a6a]/20 transition-all flex-shrink-0">
                      <Music2 size="16" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm text-[var(--color-text)]">{t.guide.personalTitle}</h3>
                      <p className="text-xs text-[#9a948c] mt-1 leading-relaxed">
                        {t.guide.personalDesc}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3 group">
                    <div className="p-2 rounded-lg bg-[#5a7a8a]/10 text-[#5a7a8a]/70 border border-[#5a7a8a]/10 group-hover:border-[#5a7a8a]/20 transition-all flex-shrink-0">
                      <Calendar size="16" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm text-[var(--color-text)]">{t.guide.timeTitle}</h3>
                      <p className="text-xs text-[#9a948c] mt-1 leading-relaxed">
                        {t.guide.timeDesc}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 group">
                    <div className="p-2 rounded-lg bg-[#8a4a5a]/10 text-[#8a4a5a]/70 border border-[#8a4a5a]/10 group-hover:border-[#8a4a5a]/20 transition-all flex-shrink-0">
                      <Search size="16" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm text-[var(--color-text)]">{t.guide.localTitle}</h3>
                      <p className="text-xs text-[#9a948c] mt-1 leading-relaxed">
                        {t.guide.localDesc}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Search Tip */}
              <div className="rounded-lg border border-[var(--accent-green)]/8 bg-[var(--accent-green)]/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[var(--accent-green)]/8 text-[var(--accent-green)]/60">
                    <Search size="16" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm text-[var(--accent-green)]/80">{t.guide.searchTitle}</h3>
                    <p className="text-xs text-[#9a948c] mt-1 leading-relaxed">{t.guide.searchDesc}</p>
                  </div>
                </div>
              </div>

              {/* Status Footer */}
              <div className="rounded-lg bg-black/20 p-3 border border-white/[0.04] flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full ${isConfigured ? "bg-[#4a8a6a]" : "bg-[#5a5854]"}`} />
                  <span className="text-[#9a948c]">{t.guide.status}: {isConfigured ? t.guide.ready : t.guide.notConfigured}</span>
                </div>
                <span className="text-[#9a948c]">v1.0.0</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
