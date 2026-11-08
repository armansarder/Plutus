import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "remote", API_BASE_URL: "" }));
import { BackendSituationAdapter } from "@/services/situation";
import { engineAdapter, forecastStart } from "@/services/engine";
import { proxyFinancialData } from "@/financialProxy.server";
import { addDays } from "@/lib/dateOnly";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
// Opt in only with the existing server's credential; no server setup, model or financial writes.
it.runIf(process.env["FINPILOT_LIVE_CHECK"] === "1")("runs authenticated adapter → proxy → FastAPI checks on port 8003", async () => {
  if (!process.env["FINPILOT_API_TOKEN"]) throw new Error("Set the existing server-only FINPILOT_API_TOKEN before live checks");
  vi.stubEnv("FINPILOT_BACKEND_URL", "http://127.0.0.1:8003");
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const statuses: Record<string, number> = {};
  vi.stubGlobal("fetch", async (url: string | URL | Request, init: RequestInit = {}) => {
    if (typeof url === "string" && url.startsWith("/api/")) {
      if (new Headers(init.headers).has("Authorization")) throw new Error("Browser credential leak");
      const response = await proxyFinancialData(new Request(`http://localhost:8080${url}`, init));
      statuses[new URL(`http://localhost${url}`).pathname] = response.status;
      return response;
    }
    return nativeFetch(url, init);
  });
  const snapshot = await new BackendSituationAdapter().getSnapshot();
  const date = forecastStart(snapshot);
  await engineAdapter.simulate(snapshot, { purchase_amount: "400.00", purchase_date: date });
  await engineAdapter.compare(snapshot, [
    { name: "Buy now", purchase_amount: "400.00", purchase_date: date },
    { name: "Buy later", purchase_amount: "400.00", purchase_date: addDays(date, 7) },
    { name: "Skip purchase", purchase_amount: "0.00", purchase_date: date },
  ]);
  await engineAdapter.forecast(snapshot);
  try { await engineAdapter.history(snapshot); } catch { if (statuses["/api/history"] !== 503) throw new Error("History returned an unexpected failure"); }
  // Statuses only: never output private customer records, balances, tokens or provider bodies.
  expect(["/api/financial-data", "/api/simulate", "/api/compare", "/api/forecast"].every(path => statuses[path] === 200)).toBe(true);
  expect([200, 503].includes(statuses["/api/history"]!)).toBe(true);
  console.info("Live route statuses:", JSON.stringify(statuses));
}, 60000);
