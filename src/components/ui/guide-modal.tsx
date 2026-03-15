"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Users, Music2, Globe, Calendar } from "lucide-react";
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
           className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm p-4"
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            className="w-full max-w-2xl rounded-2xl border border-white/10 bg-zinc-900/90 shadow-2xl overflow-hidden"
          >
            <div className="relative border-b border-white/5 bg-white/5 p-6 backdrop-blur-md">
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                {t.guide.welcome}
              </h2>
              <button 
                onClick={onClose}
                className="absolute right-6 top-6 rounded-full bg-white/5 p-2 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-8">
              {/* Feature Grid */}
              <div className="grid md:grid-cols-2 gap-6">
                 <div className="space-y-4">
                    <div className="flex items-start gap-3">
                       <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                         <Globe size={24} />
                       </div>
                       <div>
                         <h3 className="font-semibold text-zinc-100">{t.guide.explorerTitle}</h3>
                         <p className="text-sm text-zinc-400 mt-1">
                           {t.guide.explorerDesc}
                         </p>
                       </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                       <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                         <Music2 size={24} />
                       </div>
                       <div>
                         <h3 className="font-semibold text-zinc-100">{t.guide.personalTitle}</h3>
                         <p className="text-sm text-zinc-400 mt-1">
                           {t.guide.personalDesc}
                         </p>
                       </div>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <div className="flex items-start gap-3">
                       <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                         <Calendar size={24} />
                       </div>
                       <div>
                         <h3 className="font-semibold text-zinc-100">{t.guide.timeTitle}</h3>
                         <p className="text-sm text-zinc-400 mt-1">
                           {t.guide.timeDesc}
                         </p>
                       </div>
                    </div>

                    <div className="flex items-start gap-3">
                       <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                         <Users size={24} />
                       </div>
                       <div>
                         <h3 className="font-semibold text-zinc-100">{t.guide.localTitle}</h3>
                         <p className="text-sm text-zinc-400 mt-1">
                           {t.guide.localDesc}
                         </p>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Status Footer */}
              <div className="rounded-xl bg-black/30 p-4 border border-white/5 flex items-center justify-between text-xs text-zinc-500">
                 <div className="flex items-center gap-2">
                   <div className={`h-2 w-2 rounded-full ${isConfigured ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500"}`} />
                   <span>{t.guide.status}: {isConfigured ? t.guide.ready : t.guide.notConfigured}</span>
                 </div>
                 <div className="text-right">
                   v1.0.0
                 </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
