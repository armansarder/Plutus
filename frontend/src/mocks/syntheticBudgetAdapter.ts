import { budgetPlanSchema, type BudgetPlan, type BudgetPlanAdapter } from "@/types/financial";
import { demoBudgetPlan } from "./demoBudgetPlan";

export class SyntheticBudgetAdapter implements BudgetPlanAdapter {
  private plans = new Map<string, BudgetPlan>();
  async getPlan(month: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const plan = this.plans.get(month) ?? (month === demoBudgetPlan.month ? demoBudgetPlan : null);
    return plan ? budgetPlanSchema.parse(structuredClone(plan)) : null;
  }
  async updatePlanDraft(plan: BudgetPlan) { return budgetPlanSchema.parse(structuredClone(plan)); }
  async applyPlan(plan: BudgetPlan) {
    const approved = budgetPlanSchema.parse({ ...structuredClone(plan), approvedByUser: true, provenance: "user_edited" });
    this.plans.set(plan.month, approved);
    return structuredClone(approved);
  }
}
export const syntheticBudgetAdapter = new SyntheticBudgetAdapter();