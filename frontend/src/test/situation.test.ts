import { afterEach, expect, it, vi } from "vitest";
import { decimalCents } from "@/services/backendFinancial";
import { BackendSituationAdapter } from "@/services/situation";
import { proxyFinancialData } from "@/financialProxy.server";
const payload = { data: { customer_id: "synthetic_demo", currency: "USD", as_of_date: "2026-11-07", current_balance: "800.00", snapshot_basis: "opening", source_notes: ["Synthetic schedule"], upcoming_transactions: [{ id: "rent", date: "2026-11-08", description: "Rent", amount: "-600.01", type: "expense", source_status: "estimated" }] } };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("converts exact signed decimals and rejects invalid or unsafe amounts", () => {
  expect(decimalCents.parse("-600.01")).toBe(-60001);
  for (const value of [800, "NaN", "1.001", "900719925474099.00"]) expect(decimalCents.safeParse(value).success).toBe(false);
});
it("maps backend records without Alex's budget or savings", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
  const snap = await new BackendSituationAdapter().getSnapshot();
  expect(snap.startingBalanceCents).toBe(80000);
  expect(snap.customer.displayName).toBe("synthetic_demo");
  expect(snap.savingsGoal).toBeUndefined();
  expect(snap.backend?.synthetic).toBe(true);
  expect(snap.cashFlows[0]?.provenance).toBe("assumed");
});
it("rejects invalid responses without fallback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: {} })));
  await expect(new BackendSituationAdapter().getSnapshot()).rejects.toThrow("unexpected format");
});
it("injects only the server token and strips history", async () => {
  vi.stubEnv("FINPILOT_API_TOKEN", "test-server-secret");
  vi.stubEnv("FINPILOT_BACKEND_URL", "http://127.0.0.1:8000");
  const fetch = vi.fn().mockResolvedValue(Response.json({ data: { ...payload.data, historical_transactions: [{ private: true }] } }));
  vi.stubGlobal("fetch", fetch);
  const response = await proxyFinancialData(new Request("http://localhost:8080/api/financial-data", { headers: { Authorization: "Bearer browser-value" } }));
  expect(response.status).toBe(200);
  expect(fetch.mock.calls[0]?.[1].headers.Authorization).toBe("Bearer test-server-secret");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(JSON.stringify(await response.json())).not.toMatch(/secret|historical|private/);
});
it("rejects queries, cross-origin requests and writes", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  for (const request of [new Request("http://localhost/api/financial-data?url=http://evil"), new Request("http://localhost/api/financial-data", { method: "POST" }), new Request("http://localhost/api/financial-data", { headers: { Origin: "http://evil" } })]) expect((await proxyFinancialData(request)).status).toBeGreaterThanOrEqual(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("returns safe errors for missing configuration and provider failure", async () => {
  vi.stubEnv("FINPILOT_API_TOKEN", "");
  expect((await proxyFinancialData(new Request("http://localhost/api/financial-data"))).status).toBe(503);
  vi.stubEnv("FINPILOT_API_TOKEN", "secret");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private details")));
  const response = await proxyFinancialData(new Request("http://localhost/api/financial-data"));
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("private");
});
