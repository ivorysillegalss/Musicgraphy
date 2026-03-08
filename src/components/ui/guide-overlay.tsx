"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Map, Calendar, User } from "lucide-react";

interface GuideOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  configured: boolean;
}

export function GuideOverlay({ isOpen, onClose, configured }: GuideOverlayProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Music Geography Guide</h2>
              <button
                onClick={onClose}
                className="rounded-full p-2 hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-zinc-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Map className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Geographic Discovery</h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    Zoom and pan to explore representative albums from different regions. 
                    Click markers to see details or save them.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Timeline Filtering</h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    Use the bottom slider to filter albums by release year ranges.
                  </p>
                </div>
              </div>

               <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Personal Tracking</h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    Login to mark albums as "Listened". 
                    {!configured && (
                      <span className="block mt-1 text-amber-500 text-xs py-1 px-2 bg-amber-500/10 rounded border border-amber-500/20">
                         Demo Mode: Local storage only (local backend not configured).
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-950/50 px-6 py-4">
               <button
                  onClick={onClose}
                  className="w-full rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors"
               >
                 Got it
               </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
