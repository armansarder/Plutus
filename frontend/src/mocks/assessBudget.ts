import { formatMoney as m } from "@/lib/formatMoney";
import { rawRemaining, summarizePlan } from "@/lib/budgetMath";
import type { BudgetPlan, ScenarioInput, ScenarioResult } from "@/types/financial";

export function assessBudget(plan: BudgetPlan | null, scenario: ScenarioInput, liquidity: boolean | null, month: string) {
  const category = plan?.categories.find((c) => c.categoryId === scenario.categoryId && c.kind !== "savings") ?? null;
  const summary = plan ? summarizePlan(plan) : null;
  const known = !!(plan && category && plan.estimatedNetIncomeCents !== null && plan.obligationsComplete && plan.categories.some((c) => c.kind === "savings"));
  const before = category ? rawRemaining(category) : null;
  const after = before === null ? null : before - scenario.purchaseAmountCents;
  const over = after === null ? 0 : Math.max(0, -after);
  const extra = before === null ? 0 : Math.max(0, scenario.purchaseAmountCents - Math.max(0, before));
  const available = Math.max(0, summary?.unallocated ?? 0);
  const unfunded = Math.max(0, extra - available) + (summary?.deficit ?? 0);
  const budgetFit: ScenarioResult["budgetFit"] = !known ? "unknown" : over > 0 ? "over_budget" : "within_plan";
  const savingsProtection: ScenarioResult["savingsProtection"] = !known ? "unknown" : unfunded > 0 ? "requires_reallocation" : "intact";
  const assessment: ScenarioResult["assessment"] = !known || liquidity === null ? "More information needed" : over > 0 || unfunded > 0 ? "Stretches your plan" : liquidity ? "Cash-flow concern" : "Fits your plan";
  const reasons: string[] = [];
  if (!known) reasons.push(!plan ? `${month === "2026-12" ? "Next month's" : "This month's"} budget not available. Budget and savings impact cannot be confirmed.` : "Review the category, monthly income, savings and upcoming obligations before confirming plan fit.");
  else if (over > 0) {
    reasons.push(`This puts ${category?.label} ${m(over)} over its monthly plan, even if checking stays positive.`);
    if (extra <= available) reasons.push(`You can choose to move ${m(extra)} from ${m(available)} unallocated. Planned savings stays ${m(summary?.savings ?? 0)}; nothing is moved automatically.`);
    else reasons.push(`After ${m(available)} unallocated, ${m(Math.max(0, extra - available))} still needs a user-selected allocation change. Savings is not reduced automatically.`);
  } else if (known) reasons.push(`Within your ${category?.label} budget: ${m(Math.max(0, after ?? 0))} remains. ${unfunded > 0 ? "The overall plan still needs adjustment." : "Planned savings remains intact."}`);
  if (liquidity) reasons.push("Cash falls below your chosen cushion or $0 on one or more dates; timing needs attention independently of budget fit.");
  if (liquidity === null) reasons.push("Cash timing cannot be fully assessed: no recurring income is available in this forecast.");
  return { budgetMonth: month, assessment, budgetFit, category, categoryRemainingBeforeCents: before, categoryRemainingAfterCents: after,
    overBudgetByCents: over, unallocatedCents: summary?.unallocated ?? null, savingsProtection,
    plannedSavingsCents: known ? summary?.savings ?? null : null,
    projectedFeasibleSavingsCents: known ? Math.max(0, (summary?.savings ?? 0) - unfunded) : null,
    proposedSavingsReductionCents: null, liquidityConcern: liquidity, reasons };
}