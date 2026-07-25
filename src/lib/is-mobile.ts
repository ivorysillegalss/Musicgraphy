export function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 820;
}

export default isMobileViewport;
