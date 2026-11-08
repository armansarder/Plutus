/** Unconnected capabilities must never call a proposed endpoint or a demo adapter. */
export async function unavailable(): Promise<never> {
  throw new Error("This feature is not available for the connected customer yet.");
}
