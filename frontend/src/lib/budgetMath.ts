import type { BudgetCategory, BudgetPlan } from "@/types/financial";

export const rawRemaining = (c: BudgetCategory) => c.allocatedCents - c.spentCents - c.committedCents;
export function summarizePlan(plan: BudgetPlan) {
  const allocations = plan.categories.reduce((s, c) => s + c.allocatedCents, 0);
  const savings = plan.categories.find((c) => c.kind === "savings")?.allocatedCents ?? 0;
  const overcommitted = plan.categories.filter((c) => c.kind !== "savings").reduce((s, c) => s + Math.max(0, -rawRemaining(c)), 0);
  const unallocated = plan.estimatedNetIncomeCents === null ? null : plan.estimatedNetIncomeCents - allocations;
  const deficit = unallocated === null ? null : Math.max(0, overcommitted - unallocated);
  return { allocations, savings, unallocated, deficit, overcommitted,
    flexibleRemaining: plan.categories.filter((c) => c.kind === "discretionary").reduce((s, c) => s + Math.max(0, rawRemaining(c)), 0),
    essentials: plan.categories.filter((c) => c.kind === "essential").reduce((s, c) => s + c.allocatedCents, 0),
    discretionary: plan.categories.filter((c) => c.kind === "discretionary").reduce((s, c) => s + c.allocatedCents, 0),
  };
}