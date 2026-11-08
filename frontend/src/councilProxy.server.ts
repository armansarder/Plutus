/** Server-only council gateway. Browser headers never define identity or tools. */
import { z } from "zod";
import { councilMessageSchema, conversationCreateSchema, conversationSchema, councilRunSchema, councilStatusSchema } from "./types/council";
const COOKIE = "plutus_council_session";
export function isCouncilPath(path: string) {
  return /^\/api\/v2\/(council\/status|conversations(?:\/[a-f0-9]{32}(?:\/messages(?:\/[a-zA-Z0-9_-]{8,80}\/cancel)?)?)?)$/.test(path);
}
async function sign(identity: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("plutus-council:" + identity)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function session(request: Request, secret: string) {
  const cookie = request.headers.get("cookie")?.split(";").map(c => c.trim()).find(c => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1) ?? "";
  if (/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(cookie)) {
    const [identity, signature] = cookie.split(".");
    const expected = await sign(identity!, secret);
    // Fixed-length comparison avoids early exit on a matching signature prefix.
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ signature!.charCodeAt(i);
    if (difference === 0) return cookie;
  }
  const identity = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  return identity + "." + await sign(identity, secret);
}
async function boundedBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error("Missing body");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([(async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {const {done, value} = await reader.read(); if (done) break;
        size += value.length; if (size > 16384) throw new Error("Body too large"); chunks.push(value);}
      const bytes = new Uint8Array(size); let offset = 0;
      for (const c of chunks) {bytes.set(c, offset); offset += c.length;}
      return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
    })(), new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error("Body timeout")), 10000);})]);
  } finally {clearTimeout(timer); void reader.cancel().catch(() => {});}
}
export async function proxyCouncil(request: Request): Promise<Response> {
  const headers: Record<string, string> = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"};
  const fail = (status: number) => Response.json({error: "Council request failed. Check configuration, inputs, session expiry or current run status."}, {status, headers});
  const url = new URL(request.url);
  if (!isCouncilPath(url.pathname) || url.search) return fail(404);
  if (request.headers.get("sec-fetch-site") === "cross-site" || (request.headers.get("origin") && request.headers.get("origin") !== url.origin)) return fail(403);
  const create = url.pathname === "/api/v2/conversations";
  const status = url.pathname.endsWith("/status"), cancel = url.pathname.endsWith("/cancel"), message = url.pathname.endsWith("/messages");
  const validMethod = status ? request.method === "GET" : create || message || cancel ? request.method === "POST" : ["GET", "DELETE"].includes(request.method);
  if (!validMethod) return fail(405);
  const token = process.env["FINPILOT_API_TOKEN"]; if (!token || token.length < 32) return fail(503);
  let body: string | undefined = cancel ? "{}" : undefined;
  if (create || message) {
    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json" || ![null, "identity"].includes(request.headers.get("content-encoding"))) return fail(415);
    const length = request.headers.get("content-length"); if (length && (!/^\d+$/.test(length) || Number(length) > 16384)) return fail(413);
    try {body = await boundedBody(request); (create ? conversationCreateSchema : councilMessageSchema).parse(JSON.parse(body));} catch {return fail(422);}
  }
  try {
    const upstream = new URL(process.env["FINPILOT_BACKEND_URL"] || "http://127.0.0.1:8000");
    if (upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== "/" || !["http:", "https:"].includes(upstream.protocol) ||
      (upstream.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(upstream.hostname))) return fail(503);
    const signed = await session(request, token);
    const response = await fetch(new URL(url.pathname, upstream), {method: request.method,
      ...(body === undefined ? {} : {body}), headers: {Authorization: `Bearer ${token}`, "X-Plutus-Session": signed,
        Accept: "application/json", ...(body === undefined ? {} : {"Content-Type": "application/json"})},
      redirect: "error", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(65000)])});
    if (!response.ok) return fail([401, 403, 404, 409, 422, 429, 503].includes(response.status) ? response.status : 502);
    const schema = status ? councilStatusSchema : message ? councilRunSchema : cancel ? z.object({cancel_requested: z.boolean()}) : request.method === "DELETE" ? z.object({cleared: z.boolean()}) : conversationSchema;
    const result = schema.safeParse(await response.json()); if (!result.success) return fail(502);
    headers["Set-Cookie"] = `${COOKIE}=${signed}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800${url.protocol === "https:" ? "; Secure" : ""}`;
    return Response.json(result.data, {headers});
  } catch {return fail(502);}
}
