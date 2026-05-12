"use client";

import * as React from "react";
import { Plus, Minus, Search, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface MapControlsProps {
  zoom: number;
  onZoomChange: (value: number) => void;
  onSearchClick: () => void;
  onRefresh?: () => void;
  showSearch?: boolean;
  className?: string;
}

export function MapControls({
  zoom,
  onZoomChange,
  onSearchClick,
  onRefresh,
  showSearch = true,
  className,
}: MapControlsProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2.5 bg-[#141414]/80 p-2.5 rounded-xl border border-white/[0.06] shadow-xl shadow-black/30 backdrop-blur-sm",
        className
      )}
    >
      {showSearch && (
        <button
          onClick={onSearchClick}
          className="p-2 rounded-lg hover:bg-white/[0.04] transition-all text-[#9a948c] hover:text-[#ece8e1] active:scale-95"
          title="Search"
        >
          <Search className="w-3.5 h-3.5" />
        </button>
      )}

      {onRefresh ? (
        <button
          onClick={onRefresh}
          className="p-2 rounded-lg hover:bg-white/[0.04] transition-all text-[#9a948c] hover:text-[#ece8e1] active:scale-95"
          title="Refresh Random Albums"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
        </button>
      ) : null}

      <div className="w-4 h-px bg-white/[0.04]" />

      <button
        onClick={() => onZoomChange(Math.min(8, zoom + 0.5))}
        className="p-2 rounded-lg hover:bg-white/[0.04] transition-all text-[#9a948c] hover:text-[#ece8e1] active:scale-95"
        title="Zoom In"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      <div className="relative h-24 w-6 flex justify-center">
        <input
          type="range"
          min={1}
          max={8}
          step={0.1}
          value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          className="absolute top-0 bottom-0 -rotate-180 w-1 h-full appearance-none bg-white/[0.04] rounded-full cursor-pointer outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#c9a04a] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/20 [&::-webkit-slider-thumb]:shadow-sm active:[&::-webkit-slider-thumb]:scale-110 transition-all [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:bg-[#c9a04a] [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-white/20 text-transparent"
          // @ts-expect-error - writing-mode bt-lr is valid but TS defs lag
          style={{ writingMode: "bt-lr", WebkitAppearance: "slider-vertical" }}
        />
      </div>

      <button
        onClick={() => onZoomChange(Math.max(1, zoom - 0.5))}
        className="p-2 rounded-lg hover:bg-white/[0.04] transition-all text-[#9a948c] hover:text-[#ece8e1] active:scale-95"
        title="Zoom Out"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
