"use client";

import { motion } from "framer-motion";
import * as Slider from '@radix-ui/react-slider';

interface TimelineControlProps {
  timelineRange: { min: number; max: number };
  onTimelineChange: (newRange: { min: number; max: number }) => void;
  MIN_YEAR: number;
  MAX_YEAR: number;
}

export function TimelineControl({ timelineRange, onTimelineChange, MIN_YEAR, MAX_YEAR }: TimelineControlProps) {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] md:w-[600px] z-50 pointer-events-auto"
    >
      <div className="bg-black/40 backdrop-blur-xl border border-[var(--border-default)] rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
        <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
          <span>{MIN_YEAR}</span>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold">{timelineRange.min}</span>
            <span className="h-[1px] w-4 bg-white/20"></span>
            <span className="text-white font-bold">{timelineRange.max}</span>
          </div>
          <span>{MAX_YEAR}</span>
        </div>

        <Slider.Root
          className="relative flex items-center select-none touch-none w-full h-6"
          value={[timelineRange.min, timelineRange.max]}
          min={MIN_YEAR}
          max={MAX_YEAR}
          step={1}
          onValueChange={([min, max]) => onTimelineChange({ min, max })}
        >
          <Slider.Track className="bg-white/10 relative grow rounded-full h-1">
            <Slider.Range className="absolute bg-indigo-500/50 rounded-full h-full" />
          </Slider.Track>
          <Slider.Thumb
            className="block w-4 h-4 bg-white rounded-full border-2 border-indigo-500 shadow-md transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            aria-label="Minimum Year"
          />
          <Slider.Thumb
            className="block w-4 h-4 bg-white rounded-full border-2 border-indigo-500 shadow-md transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            aria-label="Maximum Year"
          />
        </Slider.Root>
      </div>
    </motion.div>
  );
}
