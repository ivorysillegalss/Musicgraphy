"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { type DiscoveryAlbum } from "@/lib/discovery-catalog";
import { AlbumArtImage } from "@/components/ui/album-art-image";

type AlbumMarkerProps = {
  data: DiscoveryAlbum;
  size?: number;
  isSelected?: boolean;
  onClick: () => void;
};

export const AlbumMarker = memo(function AlbumMarker({
  data,
  size,
  isSelected = false,
  onClick,
}: AlbumMarkerProps) {
  const baseSize = size ?? 42;
  const displaySize = isSelected ? baseSize * 1.4 : baseSize;

  return (
    <motion.div
      animate={{
        zIndex: isSelected ? 50 : 10,
        width: displaySize,
        height: displaySize,
      }}
      whileHover={{ scale: 1.25, zIndex: 100 }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 26,
      }}
      className="cursor-pointer will-change-transform flex items-center justify-center pointer-events-auto"
      style={{
        width: displaySize,
        height: displaySize,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div
        className={`w-full h-full rounded-full overflow-hidden border transition-all duration-300 relative ${
          isSelected
            ? "border-[var(--accent-amber)]/70 shadow-[0_0_20px_rgba(211,155,95,0.35)]"
            : "border-[var(--border-default)] hover:border-[var(--accent-amber)]/40 shadow-[0_0_10px_rgba(0,0,0,0.45)]"
        }`}
      >
        <div className="absolute inset-0 bg-[var(--color-background)] animate-pulse" />
        <AlbumArtImage
          artist={data.artistName}
          album={data.albumTitle}
          className="relative w-full h-full object-cover"
        />

        {/* Subtle ring overlay */}
        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/5" />
      </div>
    </motion.div>
  );
});

export const UserRecordMarker = memo(function UserRecordMarker({
  data,
  size,
  onClick,
}: {
  data: { albumTitle: string; artistName: string; id: string };
  size?: number;
  onClick: () => void;
}) {
  const baseSize = size ?? 32;

  return (
    <motion.div
      animate={{ width: baseSize, height: baseSize }}
      whileHover={{ scale: 1.5, zIndex: 50 }}
      className="cursor-pointer flex items-center justify-center pointer-events-auto"
      style={{
        width: baseSize,
        height: baseSize,
        zIndex: 20,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div className="w-full h-full rounded-full overflow-hidden border border-[var(--border-accent)]/40 shadow-[0_0_8px_rgba(211,155,95,0.2)] hover:border-[var(--accent-amber)]/70 hover:shadow-[0_0_16px_rgba(211,155,95,0.32)] transition-all bg-[var(--color-background)]">
        <AlbumArtImage
          artist={data.artistName}
          album={data.albumTitle}
          className="relative w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity"
        />
      </div>
    </motion.div>
  );
});
