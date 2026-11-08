import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "remote", API_BASE_URL: "" }));
import { engineAdapter, forecastStart, moneyString } from "@/services/engine";
import { BackendSituationAdapter } from "@/services/situation";
import { proxyFinancialData } from "@/financialProxy.server";
import { financialPayload, simulationPayload, comparisonPayload, forecastPayload, historyPayload } from "./fixtures/engineResponses";

const responses: Record<string, unknown> = { "/api/financial-data": financialPayload, "/api/simulate": simulationPayload, "/api/compare": comparisonPayload, "/api/forecast": forecastPayload, "/api/history": historyPayload };
const purchase = { purchase_amount: "400.00", purchase_date: "2026-11-07" };
const scenarios = [{ ...purchase, name: "Buy now" }, { purchase_amount: "400.00", purchase_date: "2026-11-09", name: "Buy later" }, { purchase_amount: "0.00", purchase_date: purchase.purchase_date, name: "Skip purchase" }];
beforeEach(() => {
  vi.stubEnv("FINPILOT_API_TOKEN", "test-server-token"); vi.stubEnv("FINPILOT_BACKEND_URL", "http://127.0.0.1:8003");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("round-trips all five contracts through the authenticated proxy and typed adapters", async () => {
  const browserRequests: Array<{ path: string; init: RequestInit }> = [];
  const upstreamRequests: Array<{ path: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    if (typeof url === "string" && url.startsWith("/")) {
      browserRequests.push({ path: url, init });
      return proxyFinancialData(new Request(`http://localhost:8080${url}`, init));
    }
    const path = new URL(url).pathname; upstreamRequests.push({ path, init });
    return Response.json(responses[path]);
  }));
  const snapshot = await new BackendSituationAdapter().getSnapshot();
  const simulated = await engineAdapter.simulate(snapshot, purchase);
  const compared = await engineAdapter.compare(snapshot, scenarios);
  const forecast = await engineAdapter.forecast(snapshot);
  const history = await engineAdapter.history(snapshot);
  expect(simulated.minimum_balance).toBe("-500.00");
  expect(simulated.ending_balance).toBe("500.00");
  expect(compared.scenarios).toHaveLength(3);
  // Same-day income hides the event-level shortfall in the daily closing curve.
  expect(forecast.minimum_balance).toBe("-100.00");
  expect(forecast.daily_balances.find(d => d.date === "2026-11-08")?.ending_balance).toBe("900.00");
  expect(history.customer_id).toBe(snapshot.customer.displayName);
  expect(history).not.toHaveProperty("savings");
  expect(browserRequests).toHaveLength(5);
  expect(browserRequests.every(r => !new Headers(r.init.headers).has("Authorization"))).toBe(true);
  expect(upstreamRequests.every(r => new Headers(r.init.headers).get("Authorization") === "Bearer test-server-token")).toBe(true);
  expect(JSON.parse(upstreamRequests.find(r => r.path === "/api/simulate")!.init.body as string)).toEqual(purchase);
});

it.each([
  ["/api/simulate", { ...purchase, customer_id: "Alex" }],
  ["/api/simulate", { ...purchase, purchase_amount: "1.001" }],
  ["/api/simulate", { ...purchase, purchase_date: "2026-02-30" }],
  ["/api/compare", { scenarios: [{ ...purchase, name: "a", delayed_income: [] }] }],
  ["/api/compare", { scenarios: [{ ...purchase, name: "a" }, { ...purchase, name: "a" }] }],
  ["/api/forecast", { start_date: "2026-11-08", end_date: "2026-11-07" }],
])("rejects invalid or unauthorized input to %s before upstream access", async (path, body) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const res = await proxyFinancialData(new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  expect(res.status).toBe(422); expect(fetch).not.toHaveBeenCalled();
});

it("rejects bad routes, methods, origins, history query injection and oversized bodies", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const requests = [
    new Request("http://localhost/api/agent/run", { method: "POST" }),
    new Request("http://localhost/api/simulate"),
    new Request("http://localhost/api/compare", { method: "POST", headers: { Origin: "http://evil" } }),
    new Request("http://localhost/api/history?customer_id=Alex"),
    new Request("http://localhost/api/history?months=25"),
    new Request("http://localhost/api/history?months=12&months=1"),
    new Request("http://localhost/api/forecast?url=http://evil", { method: "POST" }),
    new Request("http://localhost/api/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: " ".repeat(17000) }),
    new Request("http://localhost/api/simulate", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "1" }, body: JSON.stringify(purchase) }),
  ];
  for (const request of requests) expect((await proxyFinancialData(request)).status).toBeGreaterThanOrEqual(400);
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves safe API failure statuses and rejects malformed provider responses", async () => {
  for (const status of [401, 403, 422, 429, 503]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider error", { status })));
    const response = await proxyFinancialData(new Request("http://localhost/api/history"));
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("private");
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { customer_id: "synthetic_demo" } })));
  expect((await proxyFinancialData(new Request("http://localhost/api/history"))).status).toBe(502);
});

it("rejects cross-customer, stale and incomplete simulation responses without fallback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(financialPayload)));
  const snapshot = await new BackendSituationAdapter().getSnapshot();
  for (const data of [{ ...simulationPayload.data, customer_id: "Alex" }, { ...simulationPayload.data, starting_balance: "1800.00" }]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data })));
    await expect(engineAdapter.simulate(snapshot, purchase)).rejects.toThrow(/changed/);
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { ...comparisonPayload.data, scenarios: comparisonPayload.data.scenarios.slice(0, 1) } })));
  await expect(engineAdapter.compare(snapshot, scenarios)).rejects.toThrow("Incomplete");
});

it("starts intraday forecasts the next day and retains exact cents", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(financialPayload)));
  const snapshot = await new BackendSituationAdapter().getSnapshot();
  expect(forecastStart({ ...snapshot, backend: { notes: [], synthetic: true, basis: "intraday" } })).toBe("2026-11-08");
  expect(moneyString(39999)).toBe("399.99");
  expect(() => moneyString(1.1)).toThrow();
});
