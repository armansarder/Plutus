import { describe, expect, it } from "vitest";
import { demoBudgetPlan } from "@/mocks/demoBudgetPlan";
import { demoFinancialSnapshot } from "@/mocks/demoFinancialSnapshot";
import { simulateScenario, compareScenariosSync } from "@/mocks/syntheticSimulationAdapter";
import { SyntheticBudgetAdapter } from "@/mocks/syntheticBudgetAdapter";
import { budgetPlanSchema, scenarioComparisonSchema } from "@/types/financial";
import { rawRemaining, summarizePlan } from "@/lib/budgetMath";

const purchase = (amount = 12000, date = "2026-11-07") => ({ id: "buy-now", name: "Concert", categoryId: "fun" as const, purchaseAmountCents: amount, purchaseDate: date });
const run = (amount = 12000, plan = demoBudgetPlan) => simulateScenario(demoFinancialSnapshot, purchase(amount), 30, 20000, plan);

describe("budget-first Stage 1 rules", () => {
  it("income $3,200 minus allocations $3,100 leaves $100 unallocated", () => {
    expect(demoBudgetPlan.estimatedNetIncomeCents).toBe(320000);
    expect(summarizePlan(demoBudgetPlan).allocations).toBe(310000);
    expect(summarizePlan(demoBudgetPlan).unallocated).toBe(10000);
  });
  it("Fun $250 less $180 spent and $30 committed leaves $40", () => {
    const fun = demoBudgetPlan.categories.find((c) => c.categoryId === "fun");
    if (!fun) throw new Error("Missing Fun");
    expect(rawRemaining(fun)).toBe(4000);
    expect(run().categoryRemainingBeforeCents).toBe(4000);
  });
  it("a $120 concert exceeds Fun by $80 despite positive cash", () => {
    const r = run();
    expect(r.overBudgetByCents).toBe(8000);
    expect(r.categoryRemainingAfterCents).toBe(-8000);
    expect(r.assessment).toBe("Stretches your plan");
    expect(r.lowestBalanceCents).toBe(53000);
    expect(r.daysBelowZero).toBe(0);
  });
  it("a $30 concert fits and leaves $10", () => {
    expect(run(3000).categoryRemainingAfterCents).toBe(1000);
    expect(run(3000).assessment).toBe("Fits your plan");
  });
  it("within-budget expenses don't reduce savings twice", () => {
    expect(run(3000).plannedSavingsCents).toBe(60000);
    expect(run(3000).projectedFeasibleSavingsCents).toBe(60000);
  });
  it("$100 unallocated covers the $80 adjustment without threatening $600 savings", () => {
    expect(run().savingsProtection).toBe("intact");
    expect(run().projectedFeasibleSavingsCents).toBe(60000);
    expect(run().proposedSavingsReductionCents).toBeNull();
  });
  it("approved $80 reallocation makes Fun $330, unallocated $20, savings $600", async () => {
    const adapter = new SyntheticBudgetAdapter();
    const draft = structuredClone(demoBudgetPlan);
    const fun = draft.categories.find((c) => c.categoryId === "fun");
    if (!fun) throw new Error("Missing Fun");
    fun.allocatedCents += 8000;
    await adapter.updatePlanDraft(draft);
    expect((await adapter.getPlan("2026-11"))?.categories.find((c) => c.categoryId === "fun")?.allocatedCents).toBe(25000);
    const applied = await adapter.applyPlan(draft);
    expect(applied.categories.find((c) => c.categoryId === "fun")?.allocatedCents).toBe(33000);
    expect(summarizePlan(applied).unallocated).toBe(2000);
    expect(summarizePlan(applied).savings).toBe(60000);
    expect(run(12000, applied).budgetFit).toBe("within_plan");
    expect(run(12000, applied).lowestBalanceCents).toBe(run().lowestBalanceCents);
  });
  it("overfunded plan is flagged rather than covered by checking cash", () => {
    const plan = structuredClone(demoBudgetPlan);
    plan.categories[0] = { ...plan.categories[0], categoryId: "housing", label: "Housing", kind: "essential", spentCents: 0, committedCents: 115000, allocatedCents: 135000 };
    expect(summarizePlan(plan).deficit).toBe(10000);
    expect(run(3000, plan).savingsProtection).toBe("requires_reallocation");
    expect(run(3000, plan).assessment).toBe("Stretches your plan");
  });
  it("missing next month never reuses November limits", () => {
    const r = simulateScenario(demoFinancialSnapshot, purchase(12000, "2026-12-01"), 30, 20000);
    expect(r.budgetMonth).toBe("2026-12");
    expect(r.budgetFit).toBe("unknown");
    expect(r.savingsProtection).toBe("unknown");
    expect(r.categoryRemainingAfterCents).toBeNull();
  });
  it("uses the matching explicit next month's plan when supplied", () => {
    const next = structuredClone(demoBudgetPlan); next.month = "2026-12";
    next.categories = next.categories.map((c) => ({ ...c, spentCents: 0 }));
    const r = simulateScenario(demoFinancialSnapshot, purchase(12000, "2026-12-01"), 30, 20000, next);
    expect(r.categoryRemainingBeforeCents).toBe(22000);
    expect(r.budgetFit).toBe("within_plan");
  });
  it("missing income or obligations yields unknown, not confident verdict", () => {
    expect(run(3000, { ...demoBudgetPlan, estimatedNetIncomeCents: null }).assessment).toBe("More information needed");
    expect(run(3000, { ...demoBudgetPlan, obligationsComplete: false }).assessment).toBe("More information needed");
    const snap = { ...demoFinancialSnapshot, cashFlows: demoFinancialSnapshot.cashFlows.filter((f) => f.type !== "income") };
    expect(simulateScenario(snap, purchase(3000), 30, 20000).liquidityConcern).toBeNull();
  });
  it("cash concern coexists with within-budget result", () => {
    const snap = { ...demoFinancialSnapshot, startingBalanceCents: 130000 };
    const r = simulateScenario(snap, purchase(3000), 30, 20000);
    expect(r.budgetFit).toBe("within_plan"); expect(r.lowestBalanceCents).toBe(12000);
    expect(r.assessment).toBe("Cash-flow concern");
  });
  it("historical spent, allocations, and commitments don't double-debit forecast", () => {
    const r = simulateScenario(demoFinancialSnapshot, purchase(0), 30, 20000);
    expect(r.dailyBalances[0]?.endOfDayBalanceCents).toBe(180000);
    expect(r.endingBalanceCents).toBe(364000);
    expect(r.appliedEvents).toHaveLength(5);
    expect(r.appliedEvents.some((e) => e.label === "Protected savings")).toBe(false);
  });
  it("same-day flows aggregate and lowest-date ties use earliest date", () => {
    const snap = { ...demoFinancialSnapshot, cashFlows: [
      { id: "in", date: "2026-11-07", amountCents: 10000, type: "income" as const, label: "Income", provenance: "assumed" as const },
      { id: "out", date: "2026-11-07", amountCents: -5000, type: "bill" as const, label: "Bill", provenance: "scheduled" as const },
    ] };
    const r = simulateScenario(snap, purchase(3000), 30, 20000);
    expect(r.dailyBalances[0]?.endOfDayBalanceCents).toBe(182000);
    expect(r.lowestBalanceDate).toBe("2026-11-07");
  });
  it("invalid plans and malformed outputs fail validation", () => {
    expect(budgetPlanSchema.safeParse({ ...demoBudgetPlan, categories: [{ ...demoBudgetPlan.categories[0], allocatedCents: -1 }] }).success).toBe(false);
    expect(budgetPlanSchema.safeParse({ ...demoBudgetPlan, categories: [...demoBudgetPlan.categories, demoBudgetPlan.categories[0]] }).success).toBe(false);
    expect(scenarioComparisonSchema.safeParse({ results: [{}] }).success).toBe(false);
  });
  it("mismatched starting dates are rejected", () => {
    expect(() => compareScenariosSync(demoFinancialSnapshot, { snapshotId: demoFinancialSnapshot.snapshotId, startDate: "2026-11-08", horizonDays: 30, bufferCents: 20000, scenarios: [purchase()] })).toThrow();
  });
});
