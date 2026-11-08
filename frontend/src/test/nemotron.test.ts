import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "remote", API_BASE_URL: "" }));
import { proxyFinancialData } from "@/financialProxy.server";
import { nemotronAdapter } from "@/services/nemotron";
import { BackendSituationAdapter } from "@/services/situation";
import { nemotronRequestSchema, nemotronResponseSchema } from "@/types/nemotron";
import { agentFallback, agentNemotron } from "./fixtures/nemotronResponses";
import { financialPayload } from "./fixtures/engineResponses";

const input = nemotronRequestSchema.parse({ message: "What if my paycheck is late?", purchase_amount: "400.00", purchase_date: "2026-11-08", reserve: "200.00", horizon_days: 30, allow_model: true, channel: "web" });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([agentFallback, agentNemotron])("round-trips the actual flat $mode contract through the secure proxy", async (result) => {
  vi.stubEnv("FINPILOT_API_TOKEN", "server-test-token"); vi.stubEnv("FINPILOT_BACKEND_URL", "http://127.0.0.1:8003");
  const upstream: RequestInit[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    if (typeof url === "string" && url.startsWith("/api/")) {
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
      return proxyFinancialData(new Request(`http://localhost${url}`, init));
    }
    upstream.push(init);
    return Response.json(new URL(url).pathname === "/api/financial-data" ? financialPayload : { ...result, reasoning_content: "private provider details" });
  }));
  const snapshot = await new BackendSituationAdapter().getSnapshot();
  const submitted = { ...input, allow_model: result.mode === "nemotron" };
  const response = await nemotronAdapter.run(snapshot, submitted);
  expect(response.mode).toBe(result.mode);
  expect(response.scenarios).toHaveLength(5);
  expect(response).not.toHaveProperty("data");
  expect(response).not.toHaveProperty("reasoning_content");
  expect(upstream.every(r => new Headers(r.headers).get("Authorization") === "Bearer server-test-token")).toBe(true);
  expect(JSON.parse(upstream[1]!.body as string)).toEqual(submitted);
  expect(JSON.parse(upstream[1]!.body as string)).not.toHaveProperty("customer_id");
});

it.each([
  { message: "Can I buy it?" },
  { ...input, customer_id: "Alex" },
  { ...input, channel: "photon" },
  { ...input, tool: "send_payment" },
  { ...input, purchase_amount: "1.001" },
  { ...input, reserve: "-1.00" },
  { ...input, horizon_days: 91 },
  { ...input, horizon_days: "30" },
  { ...input, allow_model: "true" },
])("rejects unsupported agent inputs before upstream access: %j", async (body) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const response = await proxyFinancialData(new Request("http://localhost/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  expect(response.status).toBe(422); expect(fetch).not.toHaveBeenCalled();
});

it("preserves missing-service errors and never substitutes a mock response", async () => {
  vi.stubEnv("FINPILOT_API_TOKEN", "server-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream details", { status: 503 })));
  const response = await proxyFinancialData(new Request("http://localhost/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private");
});

it("rejects mixed-customer, stale, mismatched and incomplete agent responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(financialPayload)));
  const snapshot = await new BackendSituationAdapter().getSnapshot();
  const wrongCustomer = structuredClone(agentFallback); wrongCustomer.scenarios[0]!.forecast.customer_id = "Alex";
  const wrongSnapshot = structuredClone(agentFallback); wrongSnapshot.scenarios[0]!.forecast.starting_balance = "1800.00";
  const wrongPurchase = structuredClone(agentFallback); wrongPurchase.passport.purchase_amount = "500.00";
  const wrongMode = { ...agentNemotron, fallback_reason: "model_unavailable" };
  const missingEvidence = { ...agentFallback, scenarios: agentFallback.scenarios.slice(1) };
  for (const result of [wrongCustomer, wrongSnapshot, wrongPurchase, wrongMode, missingEvidence]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
    await expect(nemotronAdapter.run(snapshot, { ...input, allow_model: false })).rejects.toThrow();
  }
});

it("requires truthful mode and applicable stress counts", () => {
  expect(nemotronResponseSchema.safeParse({ ...agentFallback, mode: "nemotron", fallback_reason: null }).success).toBe(false);
  const result = structuredClone(agentFallback);
  result.scenarios.find(s => s.name === "delayed_income")!.applicable = false;
  result.stress_tests_total = 1;
  result.stress_tests_passed = Number(result.scenarios.find(s => s.name === "unexpected_expense")!.maintains_reserve);
  expect(nemotronResponseSchema.safeParse(result).success).toBe(true);
  expect(nemotronResponseSchema.safeParse({ ...result, stress_tests_total: 2 }).success).toBe(false);
});
