import type { z } from "zod";

/**
 * Minimal JSON client for the future backend. Same-origin by default; a remote base URL
 * must be HTTPS. Responses are Zod-validated; errors never echo payloads.
 */
export class ApiError extends Error {}

export function resolveBaseUrl(base: string, isProd: boolean): string {
  if (base === "" || base.startsWith("/")) return base;
  const url = new URL(base);
  if (isProd && url.protocol !== "https:") throw new ApiError("Insecure API endpoint rejected");
  return url.origin + url.pathname.replace(/\/$/, "");
}

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  init: Omit<RequestInit, "signal"> & { signal?: AbortSignal | undefined } = {},
): Promise<T> {
  const { signal, ...rest } = init;
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    signal: signal ?? null,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...init.headers },
  });
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiError("The server returned data in an unexpected format.");
  return parsed.data;
}
