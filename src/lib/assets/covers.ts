// Placeholder color generator and default cover helper
// In a real app, this would use a robust color extraction or predefined palette

export function getAlbumCoverUrl(
  artistName: string,
  albumTitle: string,
  variant: "small" | "medium" | "large" = "medium"
) {
  // 1. Generate a consistent hue based on string hash
  const combo = `${artistName}-${albumTitle}`;
  let hash = 0;
  for (let i = 0; i < combo.length; i++) {
    hash = combo.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  
  // 2. Determine size
  const size = variant === "small" ? 64 : variant === "medium" ? 200 : 400;
  
  // 3. Generate initial
  const initial = (albumTitle || "?").slice(0, 1).toUpperCase();
  
  // 4. Construct SVG Data URI
  const bgColor = `hsl(${hue}, 60%, 40%)`;
  const textColor = "white"; // Simple white text for contrast on mid-dark colors
  
  // We use encodeURIComponent to ensure special characters don't break the data URI
  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
          <stop offset="100%" style="stop-color:hsl(${hue}, 60%, 20%);stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#grad)"/>
      <text x="50%" y="50%" dy=".35em" 
            fill="${textColor}" 
            font-family="sans-serif" 
            font-weight="bold"
            font-size="${Math.round(size * 0.5)}" 
            text-anchor="middle">
        ${initial}
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
}

