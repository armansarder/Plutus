import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "remote", API_BASE_URL: "" }));
import { BackendSituationAdapter } from "@/services/situation";
import { nemotronAdapter } from "@/services/nemotron";
import { nemotronRequestSchema } from "@/types/nemotron";
import { forecastStart } from "@/services/engine";
import { proxyFinancialData } from "@/financialProxy.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.runIf(process.env["PLUTUS_AGENT_LIVE_CHECK"] === "1")("runs authenticated Talk adapter → proxy → agent verification", async () => {
  if (!process.env["FINPILOT_API_TOKEN"]) throw new Error("Configure the existing server-only service token before live verification");
  vi.stubEnv("FINPILOT_BACKEND_URL", process.env["FINPILOT_BACKEND_URL"] || "http://127.0.0.1:8003");
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const statuses: Record<string, number> = {};
  vi.stubGlobal("fetch", async (url: string | URL | Request, init: RequestInit = {}) => {
    if (typeof url === "string" && url.startsWith("/api/")) {
      if (new Headers(init.headers).has("Authorization")) throw new Error("Unexpected browser credential");
      const result = await proxyFinancialData(new Request(`http://localhost${url}`, init));
      statuses[url] = result.status; return result;
    }
    return nativeFetch(url, init);
  });
  const snapshot = await new BackendSituationAdapter().getSnapshot();
  // Only synthetic data may be used for the live model check.
  if (snapshot.customer.displayName !== "synthetic_demo" || !snapshot.backend?.synthetic) throw new Error("Live agent checks require the configured synthetic demo customer");
  const result = await nemotronAdapter.run(snapshot, nemotronRequestSchema.parse({ message: "What if my paycheck is late after this purchase?", purchase_amount: "400.00", purchase_date: forecastStart(snapshot), reserve: "200.00", allow_model: true }));
  expect(statuses["/api/agent/run"] === 200).toBe(true);
  expect(result.scenarios.length === 5).toBe(true);
  // Report operational metadata only, never customer figures, text, credentials or provider bodies.
  console.info("Live agent verification:", JSON.stringify({ statuses, mode: result.mode, fallback_reason: result.fallback_reason }));
}, 65000);
