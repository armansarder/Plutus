import { rawRemaining, summarizePlan } from "@/lib/budgetMath";
import type { BudgetPlan, ScenarioResult } from "@/types/financial";

export type IndicatorLevel = "good" | "caution" | "attention" | "unknown";

export interface HealthIndicator {
  id: "monthly_plan" | "savings_goal" | "upcoming_bills";
  label: string;
  value: string;
  level: IndicatorLevel;
  explanation: string;
}

const TIGHT_RATIO = 0.2; // a discretionary category with ≤20% left makes the plan "getting tight"

/**
 * Three plain-language indicators with explicit calculations — no invented scores.
 */
export function healthIndicators(plan: BudgetPlan | null, baseline: ScenarioResult | null): HealthIndicator[] {
  const summary = plan ? summarizePlan(plan) : null;

  let monthlyPlan: HealthIndicator;
  if (!plan || !summary) {
    monthlyPlan = { id: "monthly_plan", label: "Monthly plan", value: "Needs review", level: "unknown", explanation: "No monthly plan is available yet." };
  } else if ((summary.deficit ?? 0) > 0) {
    monthlyPlan = { id: "monthly_plan", label: "Monthly plan", value: "Needs attention", level: "attention", explanation: "Your plan allocates more than your expected income covers." };
  } else if (plan.categories.some((c) => c.kind === "discretionary" && c.allocatedCents > 0 && rawRemaining(c) <= c.allocatedCents * TIGHT_RATIO)) {
    monthlyPlan = { id: "monthly_plan", label: "Monthly plan", value: "Getting tight", level: "caution", explanation: "At least one flexible category has 20% or less left this month." };
  } else {
    monthlyPlan = { id: "monthly_plan", label: "Monthly plan", value: "On track", level: "good", explanation: "Spending and commitments fit within your plan so far." };
  }

  let savingsGoal: HealthIndicator;
  if (!plan || !summary) {
    savingsGoal = { id: "savings_goal", label: "Savings goal", value: "Unknown", level: "unknown", explanation: "No plan is available to check your savings against." };
  } else if ((summary.deficit ?? 0) > 0) {
    savingsGoal = { id: "savings_goal", label: "Savings goal", value: "Behind plan", level: "attention", explanation: "The plan's funding gap puts this month's savings contribution at risk." };
  } else {
    savingsGoal = { id: "savings_goal", label: "Savings goal", value: "On track", level: "good", explanation: "Your planned savings contribution is covered by expected income." };
  }

  let upcomingBills: HealthIndicator;
  if (!baseline) {
    upcomingBills = { id: "upcoming_bills", label: "Upcoming bills", value: "Unknown", level: "unknown", explanation: "No cash forecast is available yet." };
  } else if (baseline.firstNegativeDate || baseline.liquidityConcern) {
    upcomingBills = { id: "upcoming_bills", label: "Upcoming bills", value: "Needs review", level: "caution", explanation: "Projected cash dips low around upcoming bills in the next 30 days." };
  } else {
    upcomingBills = { id: "upcoming_bills", label: "Upcoming bills", value: "Covered", level: "good", explanation: "Projected cash stays above your buffer while bills arrive." };
  }

  return [monthlyPlan, savingsGoal, upcomingBills];
}
