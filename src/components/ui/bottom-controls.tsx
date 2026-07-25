"use client";

import { motion, AnimatePresence } from "framer-motion";
import * as Slider from '@radix-ui/react-slider';
import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import isMobileViewport from "@/lib/is-mobile";
import { BottomSheet } from "./bottom-sheet";

type BottomControlsProps = {
  timelineRange: { min: number; max: number };
  setTimelineRange: (range: { min: number; max: number }) => void;
  minYear: number;
  maxYear: number;
  recordsCount: number;
  yearSummary: string;
};

export function BottomControls({
  timelineRange,
  setTimelineRange,
  minYear,
  maxYear,
  recordsCount,
  yearSummary,
}: BottomControlsProps) {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const mobile = isMobileViewport();

  if (mobile) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden">
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full bg-[var(--bg-secondary)]/90 border border-white/[0.06] rounded-2xl py-3 text-sm font-medium"
        >
          {timelineRange.min} — {timelineRange.max} · {recordsCount} records
        </button>
        <BottomSheet open={isExpanded} onClose={() => setIsExpanded(false)}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{timelineRange.min} — {timelineRange.max}</h2>
              <button onClick={() => setIsExpanded(false)} className="text-sm">Close</button>
            </div>
            <div>
              <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-6"
                value={[timelineRange.min, timelineRange.max]}
                min={minYear}
                max={maxYear}
                step={1}
                minStepsBetweenThumbs={1}
                onValueChange={([min, max]) => setTimelineRange({ min, max })}
              >
                <Slider.Track className="bg-white/[0.06] relative grow rounded-full h-3">
                  <Slider.Range className="absolute bg-[var(--accent-green)]/60 rounded-full h-full" />
                </Slider.Track>
                <Slider.Thumb className="block w-6 h-6 bg-[var(--color-text)] rounded-full shadow" aria-label="Minimum Year" />
                <Slider.Thumb className="block w-6 h-6 bg-[var(--color-text)] rounded-full shadow" aria-label="Maximum Year" />
              </Slider.Root>
            </div>
          </div>
        </BottomSheet>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ y: 160, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.6, type: "spring", damping: 22 }}
      className="fixed bottom-6 left-0 right-0 z-40 flex justify-center pointer-events-none px-4"
    >
      <motion.div
        layout
        initial={false}
        animate={{
          borderRadius: isExpanded ? 16 : 9999,
          width: isExpanded ? "100%" : 180,
          maxWidth: isExpanded ? 720 : 180,
          height: isExpanded ? 100 : 34,
        }}
        transition={{ type: "spring", bounce: 0.12, duration: 0.6 }}
        className="pointer-events-auto flex flex-col justify-center bg-[var(--bg-secondary)]/90 border border-white/[0.06] shadow-xl shadow-black/40 overflow-hidden relative"
      >
        <AnimatePresence initial={false}>
          {!isExpanded ? (
            <motion.button
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onClick={() => setIsExpanded(true)}
              className="absolute inset-0 flex items-center justify-center gap-2 text-[#9a948c] hover:text-[var(--color-text)] hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40 flex-shrink-0">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span className="text-xs font-mono tracking-wide whitespace-nowrap tabular-nums text-[#b0aaa0]">
                {timelineRange.min} — {timelineRange.max}
              </span>
            </motion.button>
          ) : (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute inset-0 p-4 flex flex-col justify-between"
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-serif font-semibold text-[var(--color-text)] tabular-nums tracking-tight">
                    {timelineRange.min} — {timelineRange.max}
                  </h2>
                  <div className="h-3 w-px bg-white/[0.06]" />
                  <div className="flex gap-2 text-[11px] font-medium text-[#9a948c]">
                    <span>{recordsCount} {t.controls.records}</span>
                    <span className="text-white/[0.04]">/</span>
                    <span className="font-mono text-[#9a948c]">{yearSummary?.replace("No records", "") || ""}</span>
                  </div>
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 rounded-md hover:bg-white/[0.04] text-[#9a948c] hover:text-[#b0aaa0] transition-all flex-shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
              </div>

              <div className="w-full mt-1">
                <Slider.Root
                  className="relative flex items-center select-none touch-none w-full h-4"
                  value={[timelineRange.min, timelineRange.max]}
                  min={minYear}
                  max={maxYear}
                  step={1}
                  minStepsBetweenThumbs={1}
                  onValueChange={([min, max]) => setTimelineRange({ min, max })}
                >
                  <Slider.Track className="bg-white/[0.06] relative grow rounded-full h-[3px]">
                    <Slider.Range className="absolute bg-[var(--accent-green)]/60 rounded-full h-full" />
                  </Slider.Track>
                  <Slider.Thumb
                    className="block w-3 h-3 bg-[var(--color-text)] border border-[var(--accent-green)]/40 rounded-full shadow-sm transition-transform hover:scale-125 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-green)]/40 cursor-grab active:cursor-grabbing"
                    aria-label="Minimum Year"
                  />
                  <Slider.Thumb
                    className="block w-3 h-3 bg-[var(--color-text)] border border-[var(--accent-green)]/40 rounded-full shadow-sm transition-transform hover:scale-125 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-green)]/40 cursor-grab active:cursor-grabbing"
                    aria-label="Maximum Year"
                  />
                </Slider.Root>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
