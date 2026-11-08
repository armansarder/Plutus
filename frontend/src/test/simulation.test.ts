import { describe, expect, it } from "vitest";
import { demoFinancialSnapshot } from "@/mocks/demoFinancialSnapshot";
import { compareScenariosSync, SyntheticDataAdapter } from "@/mocks/syntheticSimulationAdapter";
import { parseDollarsToCents } from "@/lib/formatMoney";
import { scenarioComparisonSchema } from "@/types/financial";
import { resolveBaseUrl } from "@/services/apiClient";
import { validateScenarioForm } from "@/components/simulator/validateScenarioForm";

const req = (scenarios: { id: string; amount: number; date: string | null }[]) => ({
  snapshotId: demoFinancialSnapshot.snapshotId,
  startDate: "2026-11-07",
  horizonDays: 30,
  bufferCents: 20000,
  scenarios: scenarios.map((s) => ({ id: s.id, name: s.id, purchaseAmountCents: s.amount, purchaseDate: s.date, categoryId: "fun" as const })),
});

describe("synthetic simulation acceptance values", () => {
  const run = () =>
    compareScenariosSync(
      structuredClone(demoFinancialSnapshot),
      req([
        { id: "baseline", amount: 0, date: null },
        { id: "buy-now", amount: 12000, date: "2026-11-07" },
        { id: "buy-later", amount: 12000, date: "2026-11-15" },
      ]),
    ).results;

  it("baseline lowest balance is $650 on Nov 11", () => {
    const b = run()[0];
    if (!b) throw new Error("Missing baseline");
    expect(b.lowestBalanceCents).toBe(65000);
    expect(b.lowestBalanceDate).toBe("2026-11-11");
  });
  it("buying $120 on Nov 7 leaves $530 on Nov 11", () => {
    const now = run()[1];
    if (!now) throw new Error("Missing purchase");
    expect(now.lowestBalanceCents).toBe(53000);
    expect(now.firstNegativeDate).toBeNull();
  });
  it("buying $120 on Nov 15 keeps the $650 minimum", () => {
    expect(run()[2]?.lowestBalanceCents).toBe(65000);
    expect(run()[2]?.firstNegativeDate).toBeNull();
  });
  it("buy now and buy later end at the same balance", () => {
    const r = run() as [any, any, any];
    expect(r[1].endingBalanceCents).toBe(r[2].endingBalanceCents);
    expect(r[0].endingBalanceCents - r[1].endingBalanceCents).toBe(12000);
  });
  it("does not mutate the baseline snapshot, even on repeated runs", () => {
    const before = JSON.stringify(demoFinancialSnapshot);
    run();
    run();
    expect(JSON.stringify(demoFinancialSnapshot)).toBe(before);
    expect(run()[1]?.appliedEvents.filter((e) => e.type === "purchase")).toHaveLength(1);
  });
});

describe("input and boundary validation", () => {
  it("rejects invalid dollar input", () => {
    for (const bad of ["", "abc", "-5", "NaN", "1e5", "1.234"]) expect(parseDollarsToCents(bad)).toBeNull();
    expect(parseDollarsToCents("$1,200.5")).toBe(120050);
  });
  it("form rejects zero, huge amounts and out-of-horizon dates", () => {
    const base = { label: "Concert", amount: "120", categoryId: "fun", purchaseDate: "2026-11-07", altDate: "2026-11-15", buffer: "250" };
    expect(validateScenarioForm(base, "2026-11-07", "2026-12-06").ok).toBe(true);
    expect(validateScenarioForm({ ...base, amount: "0" }, "2026-11-07", "2026-12-06").ok).toBe(false);
    expect(validateScenarioForm({ ...base, amount: "1000000" }, "2026-11-07", "2026-12-06").ok).toBe(false);
    expect(validateScenarioForm({ ...base, altDate: "2026-12-20" }, "2026-11-07", "2026-12-06").ok).toBe(false);
    expect(validateScenarioForm({ ...base, altDate: "2026-11-07" }, "2026-11-07", "2026-12-06").ok).toBe(false);
  });
  it("rejects malformed server-shaped payloads", () => {
    expect(scenarioComparisonSchema.safeParse({ results: "nope" }).success).toBe(false);
  });
  it("rejects insecure remote endpoints in production", () => {
    expect(() => resolveBaseUrl("http://api.example.com", true)).toThrow();
    expect(resolveBaseUrl("https://api.example.com/", true)).toBe("https://api.example.com");
  });
  it("adapter returns a copy, not the fixture itself", async () => {
    const snap = await new SyntheticDataAdapter().getSnapshot();
    snap.cashFlows.pop();
    expect(demoFinancialSnapshot.cashFlows).toHaveLength(5);
  });
});
