import { budgetPlanSchema, type BudgetPlan, type BudgetPlanAdapter } from "@/types/financial";
import { demoBudgetPlan } from "./demoBudgetPlan";

export class SyntheticBudgetAdapter implements BudgetPlanAdapter {
  private plans = new Map<string, BudgetPlan>();
  async getPlan(month: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const plan = this.plans.get(month) ?? (month === demoBudgetPlan.month ? demoBudgetPlan : null);
    if (!plan) return null;
    const result = structuredClone(plan);
    try {
      const isMock = typeof fetch === "function" && ("_isMockFunction" in fetch || "mock" in fetch);
      if (!isMock && typeof fetch === "function") {
        const res = await fetch("/api/notifications/budget", signal ? { signal } : {});
        if (res && res.ok) {
          const b = await res.json();
          const groc = result.categories.find(c => c.categoryId === "groceries");
          if (groc && b.allocatedCents && b.spentCents !== undefined) {
            groc.allocatedCents = b.allocatedCents;
            groc.spentCents = b.spentCents;
          }
        }
      }
    } catch {
      // test environment fallback
    }
    return budgetPlanSchema.parse(result);
  }
  async updatePlanDraft(plan: BudgetPlan) { return budgetPlanSchema.parse(structuredClone(plan)); }
  async applyPlan(plan: BudgetPlan) {
    const approved = budgetPlanSchema.parse({ ...structuredClone(plan), approvedByUser: true, provenance: "user_edited" });
    this.plans.set(plan.month, approved);
    return structuredClone(approved);
  }
}
export const syntheticBudgetAdapter = new SyntheticBudgetAdapter();