import { z } from "zod";
import { isDateOnly } from "@/lib/dateOnly";

/**
 * Shared financial contracts. Every payload entering the UI (synthetic or remote)
 * is validated against these schemas at the adapter boundary.
 */
const dateOnly = z.string().refine(isDateOnly, "Expected YYYY-MM-DD");
const cents = z.number().int().safe();

export const cashFlowTypeSchema = z.enum(["income", "bill", "expense", "purchase"]);
export const provenanceSchema = z.enum(["observed", "scheduled", "assumed", "committed", "hypothetical"]);
export const dataSourceSchema = z.enum(["synthetic_demo", "nessie_sandbox", "configured_backend"]);

export const cashFlowSchema = z.object({
  id: z.string().min(1).max(80),
  date: dateOnly,
  amountCents: cents,
  type: cashFlowTypeSchema,
  label: z.string().min(1).max(120),
  provenance: provenanceSchema,
  categoryId: z.string().nullable().optional(),
});

export const categoryIdSchema = z.enum(["housing", "groceries", "transport", "utilities", "fun", "subscriptions", "other", "savings"]);
export const budgetCategorySchema = z.object({
  categoryId: categoryIdSchema, label: z.string().min(1), kind: z.enum(["essential", "discretionary", "savings"]),
  allocatedCents: cents.nonnegative(), spentCents: cents.nonnegative(), committedCents: cents.nonnegative(),
});
export const budgetPlanSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), currency: z.literal("USD"),
  estimatedNetIncomeCents: cents.nonnegative().nullable(), categories: z.array(budgetCategorySchema).max(8),
  approvedByUser: z.boolean(), provenance: z.enum(["synthetic_preset", "user_edited", "agent_proposal", "backend_approved"]),
  obligationsComplete: z.boolean(), assumptions: z.array(z.string()), warnings: z.array(z.string()),
  futureInvestingAllocationCents: cents.nonnegative().optional(),
}).refine((p) => new Set(p.categories.map((c) => c.categoryId)).size === p.categories.length, "Duplicate category");
export const budgetProposalSchema = z.object({
  proposalId: z.string(), month: z.string(), source: z.literal("nemotron_agent"),
  categories: z.array(z.object({ categoryId: categoryIdSchema, proposedAllocationCents: cents.nonnegative(), rationale: z.string() })),
  projectedSavingsCents: cents.nonnegative(), assumptions: z.array(z.string()), missingData: z.array(z.string()), requiresUserApproval: z.literal(true),
});
export type BudgetPlan = z.infer<typeof budgetPlanSchema>;
export type BudgetCategory = z.infer<typeof budgetCategorySchema>;
export type BudgetProposal = z.infer<typeof budgetProposalSchema>;
export interface BudgetPlanAdapter {
  getPlan(month: string, signal?: AbortSignal): Promise<BudgetPlan | null>;
  updatePlanDraft(plan: BudgetPlan): Promise<BudgetPlan>;
  applyPlan(plan: BudgetPlan): Promise<BudgetPlan>;
}
export interface BudgetProposalAdapter { proposeBudget(month: string): Promise<BudgetProposal>; }

export const financialSnapshotSchema = z.object({
  snapshotId: z.string().min(1).max(120),
  customer: z.object({ displayName: z.string().max(80), persona: z.string().max(160) }),
  currency: z.literal("USD"),
  source: dataSourceSchema,
  startDate: dateOnly,
  startingBalanceCents: cents,
  cashFlows: z.array(cashFlowSchema).max(2000),
  savingsGoal: z.object({ label: z.string(), targetCents: cents.positive(), savedToDateCents: cents.nonnegative(), plannedMonthlyContributionCents: cents.nonnegative() }).optional(),
});

export const scenarioInputSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  purchaseAmountCents: cents.nonnegative(),
  purchaseDate: dateOnly.nullable(),
  categoryId: categoryIdSchema.optional(),
});

export const compareScenariosRequestSchema = z.object({
  snapshotId: z.string().min(1),
  startDate: dateOnly,
  horizonDays: z.number().int().min(1).max(90),
  bufferCents: cents.nonnegative(),
  scenarios: z.array(scenarioInputSchema).min(1).max(5),
});

export const appliedEventSchema = z.object({
  id: z.string(),
  date: dateOnly,
  amountCents: cents,
  label: z.string().max(120),
  type: z.string().max(20),
  provenance: provenanceSchema.optional(),
});

export const scenarioResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  startingBalanceCents: cents,
  endingBalanceCents: cents,
  lowestBalanceCents: cents,
  lowestBalanceDate: dateOnly,
  firstNegativeDate: dateOnly.nullable(),
  daysBelowZero: z.number().int().nonnegative(),
  daysBelowBuffer: z.number().int().nonnegative(),
  dailyBalances: z.array(z.object({ date: dateOnly, endOfDayBalanceCents: cents })),
  appliedEvents: z.array(appliedEventSchema),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  budgetMonth: z.string(),
  assessment: z.enum(["Fits your plan", "Stretches your plan", "Cash-flow concern", "More information needed"]),
  budgetFit: z.enum(["within_plan", "over_budget", "unknown"]),
  category: budgetCategorySchema.nullable(),
  categoryRemainingBeforeCents: cents.nullable(), categoryRemainingAfterCents: cents.nullable(),
  overBudgetByCents: cents.nonnegative(), unallocatedCents: cents.nullable(),
  savingsProtection: z.enum(["intact", "requires_reallocation", "unknown"]),
  plannedSavingsCents: cents.nullable(), projectedFeasibleSavingsCents: cents.nullable(),
  proposedSavingsReductionCents: cents.nullable(),
  liquidityConcern: z.boolean().nullable(), reasons: z.array(z.string()),
});

export const scenarioComparisonSchema = z.object({
  snapshotId: z.string(),
  currency: z.literal("USD"),
  startDate: dateOnly,
  endDate: dateOnly,
  source: dataSourceSchema,
  results: z.array(scenarioResultSchema),
});

export type CashFlow = z.infer<typeof cashFlowSchema>;
export type FinancialSnapshot = z.infer<typeof financialSnapshotSchema>;
export type ScenarioInput = z.infer<typeof scenarioInputSchema>;
export type CompareScenariosRequest = z.infer<typeof compareScenariosRequestSchema>;
export type ScenarioResult = z.infer<typeof scenarioResultSchema>;
export type ScenarioComparison = z.infer<typeof scenarioComparisonSchema>;
export type AppliedEvent = z.infer<typeof appliedEventSchema>;

export interface FinancialDataAdapter {
  readonly source: FinancialSnapshot["source"];
  getSnapshot(signal?: AbortSignal): Promise<FinancialSnapshot>;
}

export interface SimulationAdapter {
  compareScenarios(request: CompareScenariosRequest, signal?: AbortSignal): Promise<ScenarioComparison>;
}

export const HORIZON_DAYS = 30;
