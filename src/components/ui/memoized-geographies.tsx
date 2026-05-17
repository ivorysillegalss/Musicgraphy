"use client";

import { memo } from "react";
import type { GeoPath } from "d3-geo";

type MemoizedGeographiesProps = {
  geographies: GeoJSON.Feature[];
  pathBuilder: GeoPath;
};

export const MemoizedGeographies = memo(function MemoizedGeographies({
  geographies,
  pathBuilder,
}: MemoizedGeographiesProps) {
  return (
    <>
      {geographies.map((geo, index) => (
        <path
          key={index}
          d={pathBuilder(geo) ?? ""}
          fill="var(--bg-secondary)"
          stroke="var(--border-subtle)"
          strokeWidth={0.5}
          className="transition-colors duration-500 hover:fill-[var(--bg-elevated)] focus:outline-none"
          style={{ outline: "none" }}
        />
      ))}
    </>
  );
});
