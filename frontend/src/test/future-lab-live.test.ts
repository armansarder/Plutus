import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "remote", API_BASE_URL: "" }));
import { BackendSituationAdapter } from "@/services/situation";
import { compareFutures } from "@/services/futureLab";
import { forecastStart } from "@/services/engine";
import { addDays } from "@/lib/dateOnly";
import { proxyFinancialData } from "@/financialProxy.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.runIf(process.env["PLUTUS_FUTURE_LAB_LIVE_CHECK"] === "1")("verifies Future Lab against one authenticated Nessie account", async () => {
  if (!process.env["FINPILOT_API_TOKEN"]) throw new Error("Configure the existing server-only service token before live checks");
  vi.stubEnv("FINPILOT_BACKEND_URL", process.env["FINPILOT_BACKEND_URL"] || "http://127.0.0.1:8003");
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const statuses: Record<string, number> = {};
  vi.stubGlobal("fetch", async (url: string | URL | Request, init: RequestInit = {}) => {
    if (typeof url === "string" && url.startsWith("/api/")) {
      if (new Headers(init.headers).has("Authorization")) throw new Error("Unexpected browser credentials");
      const response = await proxyFinancialData(new Request(`http://localhost${url}`, init));
      statuses[url] = response.status; return response;
    }
    return nativeFetch(url, init);
  });
  const snapshot = await new BackendSituationAdapter().getSnapshot();
  if (snapshot.source !== "nessie_sandbox") throw new Error("Live Future Lab check requires a Nessie-backed account");
  const date = forecastStart(snapshot);
  const result = await compareFutures(snapshot, { purchaseAmount: "1.00", purchaseDate: date, comparisonDate: addDays(date, 7), reserve: "200.00" });
  expect(result.comparison.scenarios.every(s => s.customer_id === snapshot.customer.displayName)).toBe(true);
  expect(result.comparison.scenarios.length === 3).toBe(true);
  expect(statuses["/api/compare"] === 200).toBe(true);
  console.info("Future Lab live route statuses:", JSON.stringify(statuses));
}, 60000);
