import { addDays } from "@/lib/dateOnly";
import {
  compareScenariosRequestSchema,
  financialSnapshotSchema,
  scenarioComparisonSchema,
  type AppliedEvent,
  type CompareScenariosRequest,
  type FinancialDataAdapter,
  type FinancialSnapshot,
  type ScenarioComparison,
  type ScenarioInput,
  type ScenarioResult,
  type SimulationAdapter,
} from "@/types/financial";
import { demoFinancialSnapshot } from "./demoFinancialSnapshot";
import { demoBudgetPlan } from "./demoBudgetPlan";
import { syntheticBudgetAdapter } from "./syntheticBudgetAdapter";
import { assessBudget } from "./assessBudget";
import type { BudgetPlan } from "@/types/financial";

/**
 * DEMO SUBSTITUTE ONLY. The authoritative simulation engine will live on the backend.
 *
 * Rules:
 * - All math in integer cents.
 * - Horizon = startDate .. startDate + horizonDays - 1 (inclusive).
 * - Same-day ordering: every event on a day is summed, then the end-of-day balance is recorded.
 *   An end-of-day series therefore cannot detect intraday overdrafts.
 * - Purchases are immutable overlays; the snapshot is never mutated.
 */
export function simulateScenario(
  snapshot: FinancialSnapshot,
  scenario: ScenarioInput,
  horizonDays: number,
  bufferCents: number,
  plan: BudgetPlan | null = demoBudgetPlan,
): ScenarioResult {
  const endDate = addDays(snapshot.startDate, horizonDays - 1);
  const warnings: string[] = [];
  const events: AppliedEvent[] = snapshot.cashFlows
    .filter((f) => f.date >= snapshot.startDate && f.date <= endDate)
    .map((f) => ({ id: f.id, date: f.date, amountCents: f.amountCents, label: f.label, type: f.type, provenance: f.provenance }));

  if (scenario.purchaseDate && scenario.purchaseAmountCents > 0) {
    if (scenario.purchaseDate < snapshot.startDate || scenario.purchaseDate > endDate) {
      warnings.push("Purchase date falls outside the 30-day forecast horizon, so it was not applied.");
    } else {
      events.push({
        id: `hypothetical-${scenario.id}`,
        date: scenario.purchaseDate,
        amountCents: -scenario.purchaseAmountCents,
        label: scenario.name,
        type: "purchase",
        provenance: "hypothetical",
      });
    }
  }
  events.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));

  const byDate = new Map<string, number>();
  for (const e of events) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.amountCents);

  let balance = snapshot.startingBalanceCents;
  let lowest = Number.POSITIVE_INFINITY;
  let lowestDate = snapshot.startDate;
  let firstNegativeDate: string | null = null;
  let daysBelowZero = 0;
  let daysBelowBuffer = 0;
  const dailyBalances: ScenarioResult["dailyBalances"] = [];

  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(snapshot.startDate, i);
    balance += byDate.get(date) ?? 0;
    dailyBalances.push({ date, endOfDayBalanceCents: balance });
    if (balance < lowest) {
      lowest = balance;
      lowestDate = date;
    }
    if (balance < 0) {
      daysBelowZero++;
      firstNegativeDate ??= date;
    }
    if (balance < bufferCents) daysBelowBuffer++;
  }

  const hasIncome = events.some((f) => f.type === "income" && f.amountCents > 0);
  if (!hasIncome) warnings.push("No income found in the forecast horizon.");
  const month = (scenario.purchaseDate ?? snapshot.startDate).slice(0, 7);
  const applicablePlan = plan?.month === month ? plan : null;

  return {
    id: scenario.id,
    name: scenario.name,
    startingBalanceCents: snapshot.startingBalanceCents,
    endingBalanceCents: balance,
    lowestBalanceCents: lowest,
    lowestBalanceDate: lowestDate,
    firstNegativeDate,
    daysBelowZero,
    daysBelowBuffer,
    dailyBalances,
    appliedEvents: events,
    warnings,
    ...assessBudget(applicablePlan, scenario, hasIncome ? daysBelowZero > 0 || daysBelowBuffer > 0 : null, month),
    assumptions: [
      "Balances are end-of-day; intraday overdrafts are not detected.",
      "Paychecks are assumed from a recurring pattern.",
      "Only listed dated cash flows are included; undated earmarks and December bills are not modeled.",
      ...(applicablePlan?.assumptions ?? []),
    ],
  };
}

export function compareScenariosSync(snapshot: FinancialSnapshot, request: CompareScenariosRequest, plans: (BudgetPlan | null)[] = [demoBudgetPlan]): ScenarioComparison {
  const req = compareScenariosRequestSchema.parse(request);
  if (req.snapshotId !== snapshot.snapshotId) throw new Error("Snapshot mismatch");
  if (req.startDate !== snapshot.startDate) throw new Error("Start date mismatch");
  return scenarioComparisonSchema.parse({
    snapshotId: snapshot.snapshotId,
    currency: "USD",
    startDate: snapshot.startDate,
    endDate: addDays(snapshot.startDate, req.horizonDays - 1),
    source: snapshot.source,
    results: req.scenarios.map((s) => simulateScenario(snapshot, s, req.horizonDays, req.bufferCents, plans.find((p) => p?.month === (s.purchaseDate ?? snapshot.startDate).slice(0, 7)) ?? null)),
  });
}

function abortable<T>(fn: () => T, signal?: AbortSignal, delayMs = 250): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      try {
        resolve(fn());
      } catch (e) {
        reject(e);
      }
    }, delayMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

export class SyntheticDataAdapter implements FinancialDataAdapter {
  readonly source = "synthetic_demo" as const;
  getSnapshot(signal?: AbortSignal) {
    // structuredClone so callers can never mutate the fixture.
    return abortable(() => financialSnapshotSchema.parse(structuredClone(demoFinancialSnapshot)), signal, 0);
  }
}

export class SyntheticSimulationAdapter implements SimulationAdapter {
  async compareScenarios(request: CompareScenariosRequest, signal?: AbortSignal) {
    const months = [...new Set(request.scenarios.map((s) => (s.purchaseDate ?? request.startDate).slice(0, 7)))];
    const plans = await Promise.all(months.map((month) => syntheticBudgetAdapter.getPlan(month, signal)));
    return abortable(() => compareScenariosSync(structuredClone(demoFinancialSnapshot), request, plans), signal);
  }
}
