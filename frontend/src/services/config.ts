/** One application-wide selection. Never change customer after a request failure. */
export type DataMode = "synthetic_demo" | "remote";
export function resolveDataMode(mode?: string, legacyMode?: string): DataMode {
  if (mode && legacyMode && mode !== legacyMode) throw new Error("Conflicting financial data modes");
  const selected = mode ?? legacyMode ?? "remote";
  if (selected !== "remote") throw new Error("Use remote mode for the configured Nessie customer");
  return selected;
}
// Keep existing local startup commands working; the legacy name now applies globally.
export const DATA_MODE = resolveDataMode(import.meta.env["VITE_DATA_MODE"], import.meta.env["VITE_SITUATION_DATA_MODE"]);
export const API_BASE_URL = ""; // same-origin, e.g. /api/v1/...
