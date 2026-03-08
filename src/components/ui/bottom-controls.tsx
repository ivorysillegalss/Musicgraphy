"use client";

import { motion, AnimatePresence } from "framer-motion";
import * as Slider from '@radix-ui/react-slider';
import { useState } from "react";

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
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      initial={{ y: 200, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-6 left-0 right-0 z-40 flex justify-center pointer-events-none px-4"
      transition={{ delay: 0.5 }}
    >
      <motion.div 
        layout
        initial={false}
        animate={{
          borderRadius: isExpanded ? 32 : 24,
          width: isExpanded ? "100%" : 180,
          maxWidth: isExpanded ? 896 : 180,
          height: isExpanded ? 120 : 36,
        }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        className="pointer-events-auto flex flex-col justify-center bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden relative"
      >
        <AnimatePresence initial={false}>
          {!isExpanded ? (
            <motion.button 
              key="collapsed"
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsExpanded(true)}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-2 w-[180px] h-[36px] text-zinc-300 hover:text-white hover:bg-white/5 transition-colors group cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 group-hover:opacity-100 flex-shrink-0">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span className="text-[13px] font-medium tracking-wide whitespace-nowrap">
                {timelineRange.min} - {timelineRange.max}
              </span>
              <svg className="ml-1 opacity-50 group-hover:opacity-100 transition-transform -rotate-90 group-hover:-translate-y-0.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </motion.button>
          ) : (
            <motion.div 
              key="expanded"
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.2 }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-6 flex flex-col justify-between w-full h-[120px] min-w-[300px]"
            >
              <header className="flex w-full items-center justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent whitespace-nowrap">
                    {timelineRange.min} - {timelineRange.max}
                  </h2>
                  <div className="h-4 w-[1px] bg-white/20 flex-shrink-0" />
                  <div className="flex gap-4 text-xs font-medium text-zinc-400 hidden md:flex whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />
                      {recordsCount} Records
                    </span>
                    <span>•</span>
                    <span>{yearSummary}</span>
                  </div>
                </div>
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="flex items-center justify-center p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transform rotate-90 hover:translate-y-0.5 transition-transform">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </header>

              <div className="w-full space-y-4">
                <div className="relative h-6 w-full flex items-center px-1">
                  <Slider.Root
                    className="relative flex items-center select-none touch-none w-full h-6"
                    value={[timelineRange.min, timelineRange.max]}
                    min={minYear}
                    max={maxYear}
                    step={1}
                    minStepsBetweenThumbs={1}
                    onValueChange={([min, max]) => setTimelineRange({ min, max })}
                  >
                    <Slider.Track className="bg-white/10 relative grow rounded-full h-1.5">
                      <Slider.Range className="absolute bg-gradient-to-r from-emerald-500/80 to-cyan-500/80 rounded-full h-full shadow-[0_0_10px_rgba(52,211,153,0.3)]" />
                    </Slider.Track>
                    <Slider.Thumb
                      className="block w-4 h-4 bg-white border border-emerald-500 rounded-full shadow-md transition-transform hover:scale-125 focus:outline-none cursor-grab active:cursor-grabbing"
                      aria-label="Minimum Year"
                    />
                    <Slider.Thumb
                      className="block w-4 h-4 bg-white border border-cyan-500 rounded-full shadow-md transition-transform hover:scale-125 focus:outline-none cursor-grab active:cursor-grabbing"
                      aria-label="Maximum Year"
                    />
                  </Slider.Root>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
