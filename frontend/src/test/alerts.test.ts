import { describe, expect, it } from "vitest";
import { deriveAlerts } from "@/lib/alerts";
import { healthIndicators } from "@/lib/health";
import { demoFinancialSnapshot } from "@/mocks/demoFinancialSnapshot";
import { demoBudgetPlan } from "@/mocks/demoBudgetPlan";
import { compareScenariosSync } from "@/mocks/syntheticSimulationAdapter";
import type { BudgetPlan } from "@/types/financial";

const baseline = compareScenariosSync(structuredClone(demoFinancialSnapshot), {
  snapshotId: demoFinancialSnapshot.snapshotId, startDate: "2026-11-07", horizonDays: 30, bufferCents: 20000,
  scenarios: [{ id: "baseline", name: "Baseline", purchaseAmountCents: 0, purchaseDate: null, categoryId: "fun" }],
}).results[0]!;

describe("deriveAlerts", () => {
  const alerts = deriveAlerts(demoBudgetPlan, demoFinancialSnapshot, baseline);

  it("flags the Fun budget as close to its limit with $40 left", () => {
    const fun = alerts.find((a) => a.id === "budget-close-fun");
    expect(fun?.status).toBe("worth_checking");
    expect(fun?.explanation).toContain("$40");
    expect(fun?.actionTo).toBe("/simulator");
  });
  it("warns about rent four days out", () => {
    const rent = alerts.find((a) => a.id === "upcoming-rent-nov");
    expect(rent?.status).toBe("worth_checking");
    expect(rent?.explanation).toContain("4 days");
  });
  it("recognizes on-track grocery spending", () => {
    expect(alerts.find((a) => a.id === "progress-groceries")?.status).toBe("looking_good");
  });
  it("does not raise a savings alert when the plan is funded", () => {
    expect(alerts.find((a) => a.id === "savings-gap")).toBeUndefined();
  });
  it("raises a savings alert when the plan has a funding gap", () => {
    const gapPlan: BudgetPlan = { ...structuredClone(demoBudgetPlan), estimatedNetIncomeCents: 300000 };
    expect(deriveAlerts(gapPlan, demoFinancialSnapshot, baseline).find((a) => a.id === "savings-gap")?.status).toBe("needs_attention");
  });
  it("never repeats an alert id", () => {
    expect(new Set(alerts.map((a) => a.id)).size).toBe(alerts.length);
  });
});

describe("healthIndicators", () => {
  const [plan, savings, bills] = healthIndicators(demoBudgetPlan, baseline);
  it("marks the demo plan as getting tight (Fun has 16% left)", () => {
    expect(plan?.value).toBe("Getting tight");
  });
  it("keeps savings on track when the plan is funded", () => {
    expect(savings?.value).toBe("On track");
  });
  it("marks bills covered when cash stays above the buffer", () => {
    expect(bills?.value).toBe("Covered");
  });
  it("reports unknowns instead of inventing a score when data is missing", () => {
    const [p, s, b] = healthIndicators(null, null);
    expect([p?.level, s?.level, b?.level]).toEqual(["unknown", "unknown", "unknown"]);
  });
});
