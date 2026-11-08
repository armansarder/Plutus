import { addDays, formatDateOnly } from "@/lib/dateOnly";
import { formatMoney } from "@/lib/formatMoney";
import { rawRemaining } from "@/lib/budgetMath";
import {
  HORIZON_DAYS,
  type CompareScenariosRequest,
  type FinancialSnapshot,
  type ScenarioResult,
} from "@/types/financial";
import { agentResponseSchema, type AgentAdapter, type AgentResponse, type StressScenario } from "@/types/agent";
import { compareScenariosSync } from "./syntheticSimulationAdapter";
import { demoFinancialSnapshot } from "./demoFinancialSnapshot";
import { demoBudgetPlan } from "./demoBudgetPlan";

const BUFFER_CENTS = 20000;

/** Extract a dollar amount from a question like "Can I afford a $500 laptop?" */
export function parseQuestion(message: string): { amountCents: number; label: string } | null {
  const match = message.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/) ?? message.match(/\b([\d,]+(?:\.\d{1,2})?)\s?(?:dollars|bucks)\b/i);
  if (!match?.[1]) return null;
  const amountCents = Math.round(Number(match[1].replace(/,/g, "")) * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_00) return null;
  const lower = message.toLowerCase();
  const label = lower.includes("laptop") ? "Laptop" : lower.includes("concert") || lower.includes("ticket") ? "Concert tickets"
    : lower.includes("phone") ? "Phone" : lower.includes("tv") ? "TV" : "This purchase";
  return { amountCents, label };
}

function buildRequest(snap: FinancialSnapshot, amountCents: number, label: string): CompareScenariosRequest {
  const payday = snap.cashFlows.find((e) => e.type === "income" && e.date >= snap.startDate);
  const later = payday ? addDays(payday.date, 1) : addDays(snap.startDate, 7);
  return {
    snapshotId: snap.snapshotId, startDate: snap.startDate, horizonDays: HORIZON_DAYS, bufferCents: BUFFER_CENTS,
    scenarios: [
      { id: "baseline", name: "Current plan", purchaseAmountCents: 0, purchaseDate: null, categoryId: "fun" },
      { id: "buy-now", name: label, purchaseAmountCents: amountCents, purchaseDate: snap.startDate, categoryId: "fun" },
      { id: "buy-later", name: label, purchaseAmountCents: amountCents, purchaseDate: later, categoryId: "fun" },
    ],
  };
}

function outcomeOf(r: ScenarioResult): StressScenario["outcome"] {
  if (r.firstNegativeDate) return "negative";
  return r.lowestBalanceCents >= BUFFER_CENTS ? "within_reserve" : "below_reserve";
}

function stressOf(id: string, label: string, r: ScenarioResult): StressScenario {
  const outcome = outcomeOf(r);
  return {
    id, label, outcome,
    lowestBalanceCents: r.lowestBalanceCents,
    budgetImpact: r.categoryRemainingAfterCents === null
      ? "Category impact unknown"
      : r.overBudgetByCents > 0
        ? `${formatMoney(r.overBudgetByCents)} over your ${r.category?.label ?? "category"} plan`
        : `${formatMoney(r.categoryRemainingAfterCents)} left in ${r.category?.label ?? "the category"}`,
    savingsImpact: r.savingsProtection === "intact" ? "Savings plan stays intact" : r.savingsProtection === "unknown" ? "Savings impact unknown" : "Savings would need reallocation",
    explanation: outcome === "within_reserve"
      ? `Lowest cash stays at ${formatMoney(r.lowestBalanceCents)}, above your reserve.`
      : outcome === "below_reserve"
        ? `Cash dips to ${formatMoney(r.lowestBalanceCents)}, below your ${formatMoney(BUFFER_CENTS)} reserve.`
        : `Cash goes negative around ${r.firstNegativeDate ? formatDateOnly(r.firstNegativeDate) : "mid-month"}.`,
  };
}

/**
 * DEMO SUBSTITUTE ONLY. Answers affordability questions by running the same
 * deterministic simulation engine as the Simulator — no invented numbers.
 * The real Nemotron agent will orchestrate these tools on the backend.
 */
export class SyntheticAgentAdapter implements AgentAdapter {
  ask(message: string, signal?: AbortSignal): Promise<AgentResponse> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
      const t = setTimeout(() => {
        try {
          resolve(agentResponseSchema.parse(answer(message)));
        } catch (e) {
          reject(e);
        }
      }, 600);
      signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); });
    });
  }
}

function answer(message: string): AgentResponse {
  const parsed = parseQuestion(message);
  const snap = structuredClone(demoFinancialSnapshot);

  if (!parsed) {
    return {
      source: "synthetic_demo",
      reply: "I can check how a purchase fits your plan. Try asking something like \"Can I afford a $500 laptop?\" and I'll run the numbers against your monthly plan, savings and cash forecast. You can also open the Simulator to explore on your own.",
      affordability: null, stressTest: null, simulatorRequest: null,
    };
  }

  const request = buildRequest(snap, parsed.amountCents, parsed.label);
  const comparison = compareScenariosSync(structuredClone(demoFinancialSnapshot), request);
  const buyNow = comparison.results.find((r) => r.id === "buy-now");
  const baseline = comparison.results.find((r) => r.id === "baseline");
  if (!buyNow || !baseline) throw new Error("Simulation returned incomplete results");

  const fun = demoBudgetPlan.categories.find((c) => c.categoryId === "fun");
  const remaining = fun ? rawRemaining(fun) : null;

  const alternatives: string[] = [];
  const buyLater = comparison.results.find((r) => r.id === "buy-later");
  if (buyLater && buyLater.overBudgetByCents < buyNow.overBudgetByCents) alternatives.push("Waiting until after your next paycheck keeps more cash on hand.");
  if (buyNow.overBudgetByCents > 0) alternatives.push("A smaller purchase could fit within your current Fun budget.");
  alternatives.push("Skipping it keeps your plan and savings untouched.");

  // Devil's advocate: stress-test the recommendation with real simulation runs.
  const latePaySnap = structuredClone(demoFinancialSnapshot);
  latePaySnap.cashFlows = latePaySnap.cashFlows.map((f) => f.type === "income" ? { ...f, id: `${f.id}-late`, date: addDays(f.date, 5) } : f);
  const surpriseSnap = structuredClone(demoFinancialSnapshot);
  surpriseSnap.cashFlows = [...surpriseSnap.cashFlows, { id: "surprise-bill", date: addDays(snap.startDate, 2), amountCents: -15000, categoryId: "other", type: "bill", label: "Unexpected bill", provenance: "hypothetical" }];

  const run = (snapshot: FinancialSnapshot, scenarioId: "buy-now" | "buy-later") =>
    compareScenariosSync(snapshot, { ...request, scenarios: request.scenarios.filter((s) => s.id === scenarioId) }).results[0];

  const stressResults = [
    stressOf("original", "Buy it today", run(structuredClone(demoFinancialSnapshot), "buy-now")!),
    stressOf("late-paycheck", "Paycheck arrives 5 days late", run(latePaySnap, "buy-now")!),
    stressOf("surprise-bill", "A $150 surprise bill", run(surpriseSnap, "buy-now")!),
    stressOf("wait", "Wait until next payday", run(structuredClone(demoFinancialSnapshot), "buy-later")!),
  ];
  const within = stressResults.filter((s) => s.outcome === "within_reserve").length;

  return {
    source: "synthetic_demo",
    reply: `Let's check how that purchase fits your monthly plan. ${buyNow.assessment === "Fits your plan" ? "Good news — it fits within your current plan." : buyNow.assessment === "Stretches your plan" ? "It would stretch your Fun budget this month." : "It raises a cash-flow concern this month."}`,
    affordability: {
      purchaseLabel: parsed.label,
      purchaseAmountCents: parsed.amountCents,
      categoryId: "fun",
      categoryRemainingCents: remaining,
      assessment: buyNow.assessment,
      lowestBalanceCents: buyNow.lowestBalanceCents,
      savingsImpact: buyNow.savingsProtection,
      alternatives: alternatives.slice(0, 3),
    },
    stressTest: {
      summary: `${within} of ${stressResults.length} scenarios stayed within your selected reserve.`,
      scenarios: stressResults,
    },
    simulatorRequest: request,
  };
}
