const UNKNOWN_GEO_LABELS = new Set([
  "unknown",
  "unkown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "-",
  "?",
]);

function normalizeLabel(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function isUnknownGeoLabel(value: string | null | undefined) {
  const normalized = normalizeLabel(value);
  if (!normalized) return true;
  return UNKNOWN_GEO_LABELS.has(normalized);
}

export function sanitizeGeoLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw || isUnknownGeoLabel(raw)) {
    return null;
  }
  return raw;
}
