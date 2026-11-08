import { queryOptions } from "@tanstack/react-query";
import { syntheticBudgetAdapter } from "@/mocks/syntheticBudgetAdapter";
import { budgetPlanSchema, budgetProposalSchema, type BudgetPlan, type BudgetPlanAdapter, type BudgetProposalAdapter } from "@/types/financial";
import { requestJson, resolveBaseUrl } from "./apiClient";
import { API_BASE_URL, DATA_MODE } from "./config";
import { unavailable } from "./unavailable";

export class HttpBudgetAdapter implements BudgetPlanAdapter, BudgetProposalAdapter {
  constructor(private baseUrl = resolveBaseUrl(API_BASE_URL, import.meta.env.PROD)) {}
  getPlan(month: string, signal?: AbortSignal) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month");
    return requestJson(this.baseUrl, `/api/v1/budgets?month=${month}`, budgetPlanSchema.nullable(), { signal });
  }
  async updatePlanDraft(plan: BudgetPlan) { return budgetPlanSchema.parse(plan); }
  applyPlan(plan: BudgetPlan) { return requestJson(this.baseUrl, "/api/v1/budgets/current", budgetPlanSchema, { method: "PUT", body: JSON.stringify(budgetPlanSchema.parse(plan)) }); }
  proposeBudget(month: string) { return requestJson(this.baseUrl, "/api/v1/budgets/propose", budgetProposalSchema, { method: "POST", body: JSON.stringify({ month }) }); }
}
export const budgetAdapter: BudgetPlanAdapter = DATA_MODE === "remote"
  ? { getPlan: async () => null, updatePlanDraft: unavailable, applyPlan: unavailable }
  : syntheticBudgetAdapter;
export const budgetQueryOptions = (month: string) => queryOptions({ queryKey: ["budget", DATA_MODE, month], queryFn: ({ signal }) => budgetAdapter.getPlan(month, signal), staleTime: Infinity });
