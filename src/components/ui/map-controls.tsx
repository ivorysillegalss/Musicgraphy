"use client";

import * as React from "react";
import { Plus, Minus, Search, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface MapControlsProps {
  zoom: number;
  onZoomChange: (value: number) => void;
  onSearchClick: () => void;
  onRefresh?: () => void;
  className?: string;
}

export function MapControls({
  zoom,
  onZoomChange,
  onSearchClick,
  onRefresh,
  className,
}: MapControlsProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 bg-black/40 backdrop-blur-md p-2 rounded-full border border-white/10",
        className
      )}
    >
      <button
        onClick={onSearchClick}
        className="p-2 rounded-full hover:bg-white/10 transition-colors text-zinc-200"
        title="Search"
      >
        <Search className="w-5 h-5" />
      </button>

      {onRefresh ? (
        <button
          onClick={onRefresh}
          className="p-2 rounded-full hover:bg-white/10 transition-colors text-zinc-200"
          title="Refresh Random Albums"
        >
          <RefreshCcw className="w-5 h-5" />
        </button>
      ) : null}

      <div className="w-full h-px bg-white/10" />

      <button
        onClick={() => onZoomChange(Math.min(8, zoom + 0.5))}
        className="p-2 rounded-full hover:bg-white/10 transition-colors text-zinc-200"
        title="Zoom In"
      >
        <Plus className="w-5 h-5" />
      </button>

      <div className="relative h-32 w-8 py-2 flex justify-center">
        {/* Custom vertical slider */}
        <input
          type="range"
          min={1}
          max={8}
          step={0.1}
          value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          className="absolute top-0 bottom-0 -rotate-180 w-1 h-32 appearance-none bg-zinc-700 rounded-lg cursor-pointer outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:shadow-lg active:[&::-webkit-slider-thumb]:scale-110 transition-all [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:border-none text-transparent slider-vertical"
          // @ts-expect-error - writing-mode bt-lr is valid but TS defs lag
          style={{ writingMode: "bt-lr", WebkitAppearance: "slider-vertical" }}
        />
        {/* Visual track indicator could be added here if needed, but styling range input is easier */}
      </div>

      <button
        onClick={() => onZoomChange(Math.max(1, zoom - 0.5))}
        className="p-2 rounded-full hover:bg-white/10 transition-colors text-zinc-200"
        title="Zoom Out"
      >
        <Minus className="w-5 h-5" />
      </button>
    </div>
  );
}
