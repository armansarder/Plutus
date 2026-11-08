import { diffDays } from "@/lib/dateOnly";
import { formatMoney } from "@/lib/formatMoney";
import { rawRemaining, summarizePlan } from "@/lib/budgetMath";
import type { BudgetPlan, FinancialSnapshot, ScenarioResult } from "@/types/financial";

export type AlertStatus = "looking_good" | "worth_checking" | "needs_attention";
export type AlertKind = "budget" | "savings" | "upcoming_expense" | "progress";

export interface PlutusAlert {
  id: string;
  kind: AlertKind;
  status: AlertStatus;
  title: string;
  explanation: string;
  actionLabel: string;
  actionTo: "/simulator" | "/cash-flow" | "/monthly-plan";
  categoryId?: string;
}

const CLOSE_TO_LIMIT_RATIO = 0.25; // "close" = 25% or less of the allocation left
const UPCOMING_BILL_DAYS = 7;

/**
 * Derives alerts from the actual budget plan, snapshot and baseline simulation.
 * Pure and deterministic — no random warnings. Deduped by id, capped to avoid
 * overwhelming the user.
 */
export function deriveAlerts(
  plan: BudgetPlan | null,
  snap: FinancialSnapshot,
  baseline: ScenarioResult | null,
): PlutusAlert[] {
  const alerts: PlutusAlert[] = [];

  if (plan) {
    const summary = summarizePlan(plan);

    // Budget alerts: discretionary categories close to (or past) their allocation.
    for (const c of plan.categories.filter((c) => c.kind === "discretionary")) {
      const remaining = rawRemaining(c);
      if (remaining < 0) {
        alerts.push({
          id: `budget-over-${c.categoryId}`, kind: "budget", status: "needs_attention",
          title: `Your ${c.label} budget is over.`,
          explanation: `You've gone ${formatMoney(-remaining)} past this category's plan for the month.`,
          actionLabel: "Explore my options", actionTo: "/simulator", categoryId: c.categoryId,
        });
      } else if (c.allocatedCents > 0 && remaining <= c.allocatedCents * CLOSE_TO_LIMIT_RATIO) {
        alerts.push({
          id: `budget-close-${c.categoryId}`, kind: "budget", status: "worth_checking",
          title: `You're getting close to your ${c.label} budget.`,
          explanation: `You have ${formatMoney(remaining)} left to spend in this category this month.`,
          actionLabel: "Explore my options", actionTo: "/simulator", categoryId: c.categoryId,
        });
      }
    }

    // Savings alert: the plan's funding gap threatens the savings allocation.
    if ((summary.deficit ?? 0) > 0) {
      alerts.push({
        id: "savings-gap", kind: "savings", status: "needs_attention",
        title: "Your savings goal may need attention.",
        explanation: `You planned to save ${formatMoney(summary.savings)} this month, but your plan is ${formatMoney(summary.deficit ?? 0)} short of covering everything.`,
        actionLabel: "See the impact", actionTo: "/monthly-plan",
      });
    }

    // Positive progress: categories comfortably inside their plan with real spending.
    for (const c of plan.categories.filter((c) => c.kind !== "savings")) {
      const remaining = rawRemaining(c);
      if (c.spentCents > 0 && remaining > c.allocatedCents * CLOSE_TO_LIMIT_RATIO) {
        alerts.push({
          id: `progress-${c.categoryId}`, kind: "progress", status: "looking_good",
          title: `You're on track with your ${c.label.toLowerCase()} budget.`,
          explanation: "You've stayed within your current spending plan.",
          actionLabel: "View monthly plan", actionTo: "/monthly-plan", categoryId: c.categoryId,
        });
      }
    }
  }

  // Upcoming expense alerts: dated bills within the next week.
  for (const e of snap.cashFlows.filter((f) => f.amountCents < 0 && f.type === "bill")) {
    const days = diffDays(e.date, snap.startDate);
    if (days >= 0 && days <= UPCOMING_BILL_DAYS) {
      alerts.push({
        id: `upcoming-${e.id}`, kind: "upcoming_expense", status: "worth_checking",
        title: `${e.label} is coming up.`,
        explanation: `Your next ${e.label.toLowerCase()} payment of ${formatMoney(-e.amountCents)} is expected in ${days === 0 ? "less than a day" : `${days} day${days === 1 ? "" : "s"}`}.`,
        actionLabel: "View cash flow", actionTo: "/cash-flow",
      });
    }
  }

  // Cash-flow caution from the baseline simulation.
  if (baseline?.liquidityConcern) {
    alerts.push({
      id: "cash-low", kind: "upcoming_expense", status: "worth_checking",
      title: "Cash could get tight this month.",
      explanation: `Your lowest projected balance is ${formatMoney(baseline.lowestBalanceCents)} around ${baseline.lowestBalanceDate}. Worth a look before new spending.`,
      actionLabel: "View cash flow", actionTo: "/cash-flow",
    });
  }

  const seen = new Set<string>();
  return alerts.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true))).slice(0, 6);
}
