/** Server entry only. Never import this module from a browser component. */
import { z } from "zod";
import { purchaseRequestSchema, compareRequestSchema, forecastRequestSchema, engineSimulationSchema, engineComparisonSchema, engineForecastSchema, engineHistorySchema } from "./types/engine";
import { nemotronRequestSchema, nemotronResponseSchema } from "./types/nemotron";
import { ENDPOINTS } from "./services/endpoints";
import { cashPlanRequestSchema, cashPlanResultSchema } from "./types/cashPlan";

export const FINANCIAL_PROXY_PATHS = ["/api/financial-data", "/api/simulate", "/api/compare", "/api/forecast", "/api/history", "/api/cash-plan/preview", ENDPOINTS.agentRun] as const;

export const NOTIFICATION_PROXY_PATHS = [
  "/api/notifications/preferences",
  "/api/notifications/watchlist",
  "/api/notifications/history",
  "/api/notifications/state",
  "/api/notifications/check",
  "/api/notifications/operator/spend",
  "/api/notifications/operator/advance-payday",
  "/api/notifications/operator/reset",
  "/api/messaging/status",
] as const;

export function isFinancialProxyPath(pathname: string): boolean {
  return (
    (FINANCIAL_PROXY_PATHS as readonly string[]).includes(pathname) ||
    (NOTIFICATION_PROXY_PATHS as readonly string[]).includes(pathname) ||
    pathname.startsWith("/api/notifications/watchlist/")
  );
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16384) throw new Error("Body limit");
          chunks.push(value);
        }
        const declared = request.headers.get("content-length");
        if (declared !== null && Number(declared) !== size) throw new Error("Body length mismatch");
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Body timeout")), 10000); }),
    ]);
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}

export async function proxyFinancialData(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" };
  const error = (status: number, message: string) => Response.json({ error: message }, { status, headers });
  const url = new URL(request.url);
  if (!isFinancialProxyPath(url.pathname)) return error(404, "Financial route not found");
  const isNotification = (NOTIFICATION_PROXY_PATHS as readonly string[]).includes(url.pathname) || url.pathname.startsWith("/api/notifications/watchlist/");
  const agent = url.pathname === ENDPOINTS.agentRun;
  const plan = url.pathname === "/api/cash-plan/preview";
  const post = plan || agent || ["/api/simulate", "/api/compare", "/api/forecast"].includes(url.pathname);
  if (!isNotification && request.method !== (post ? "POST" : "GET")) return error(405, "Method not allowed");
  if (isNotification && !["GET", "POST", "DELETE"].includes(request.method)) return error(405, "Method not allowed");
  if (url.pathname === "/api/history") {
    const keys = [...url.searchParams.keys()];
    if (new Set(keys).size !== keys.length || keys.some(k => !["month", "months"].includes(k)) ||
      (url.searchParams.has("month") && !/^\d{4}-(0[1-9]|1[0-2])$/.test(url.searchParams.get("month")!)) ||
      (url.searchParams.has("months") && !/^(?:[1-9]|1\d|2[0-4])$/.test(url.searchParams.get("months")!))) return error(400, "Invalid history range");
  } else if (!isNotification && url.search) return error(400, "Query parameters are not supported");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (request.headers.get("origin") && request.headers.get("origin") !== url.origin)) return error(403, "Same-origin access required");
  let body: string | undefined;
  if (post || (isNotification && (request.method === "POST" || request.method === "DELETE"))) {
    const hasBody = request.headers.get("content-length") && Number(request.headers.get("content-length")) > 0;
    if (hasBody || post) {
      if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json" || ![null, "identity"].includes(request.headers.get("content-encoding"))) return error(415, "Use uncompressed application/json");
      const length = request.headers.get("content-length");
      if (length && (!/^\d+$/.test(length) || Number(length) > 16384)) return error(413, "Request body exceeds size limit");
      try {
        body = await readBody(request);
        if (!isNotification) {
          const schema = plan ? cashPlanRequestSchema : agent ? nemotronRequestSchema : url.pathname === "/api/simulate" ? purchaseRequestSchema : url.pathname === "/api/compare" ? compareRequestSchema : forecastRequestSchema;
          schema.parse(JSON.parse(body)); // Forward original JSON so backend duplicate-key checks still apply.
        }
      } catch {
        if (isNotification && (request.method === "POST" || request.method === "DELETE")) {
          body = "{}";
        } else {
          return error(422, "Check purchase amounts, dates and scenario inputs");
        }
      }
    } else if (isNotification && request.method === "POST") {
      body = "{}";
    }
  }
  const token = process.env["FINPILOT_API_TOKEN"];
  if (!token) return error(503, "Financial service is not configured");
  try {
    const upstream = new URL(process.env["FINPILOT_BACKEND_URL"] || "http://127.0.0.1:8000");
    if (upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== "/" || !["http:", "https:"].includes(upstream.protocol)) return error(503, "Financial service is not configured");
    if (upstream.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(upstream.hostname)) return error(503, "Financial service requires HTTPS");
    const opToken = request.headers.get("x-operator-token");
    if (request.method === "POST" && (body === undefined || body === "")) {
      body = "{}";
    }
    const response = await fetch(new URL(url.pathname + url.search, upstream), {
      method: request.method,
      ...(body === undefined ? {} : { body }),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(opToken ? { "X-Operator-Token": opToken } : {}),
      },
      // One investigation may make up to four sequential provider calls at 12 seconds each.
      cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(agent ? 60000 : 12000)]),
    });
    if (isNotification) {
      const data = await response.json();
      return Response.json(data, { status: response.status, headers });
    }
    if (!response.ok) return error([401, 403, 422, 429, 503].includes(response.status) ? response.status : 502, "Financial service request failed");
    if (plan) {
      const result = cashPlanResultSchema.safeParse(await response.json());
      return result.success ? Response.json(result.data,{headers}) : error(502,"Invalid cash plan response");
    }
    if (agent) {
      const result = nemotronResponseSchema.safeParse(await response.json());
      if (!result.success) return error(502, "Invalid agent service response");
      return Response.json(result.data, { headers });
    }
    if (url.pathname !== "/api/financial-data") {
      const schema = url.pathname === "/api/simulate" ? engineSimulationSchema : url.pathname === "/api/compare" ? engineComparisonSchema : url.pathname === "/api/forecast" ? engineForecastSchema : engineHistorySchema;
      const result = z.object({ data: schema }).safeParse(await response.json());
      if (!result.success) return error(502, "Invalid financial service response");
      return Response.json(result.data, { headers });
    }
    // Return only the validated fields needed by this page; omit historical records.
    const { backendFinancialSchema } = await import("./services/backendFinancial");
    const upstreamBody = await response.json();
    if (!backendFinancialSchema.safeParse(upstreamBody).success) return error(502, "Invalid financial service response");
    const data = Object.fromEntries(["customer_id", "currency", "as_of_date", "current_balance", "upcoming_transactions", "snapshot_basis", "source_notes"].filter(key => key in upstreamBody.data).map(key => [key, upstreamBody.data[key]]));
    data["upcoming_transactions"] = upstreamBody.data.upcoming_transactions.map((t: Record<string, unknown>) => Object.fromEntries(["id", "date", "description", "amount", "type", "source_status"].map(key => [key, t[key]])));
    return Response.json({ data, ...(upstreamBody.source ? { source: upstreamBody.source } : {}) }, { headers });
  } catch {
    return error(502, "Financial service is unavailable");
  }
}
