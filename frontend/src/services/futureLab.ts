import { addDays, isDateOnly } from "@/lib/dateOnly";
import { MAX_BUFFER_CENTS, MAX_PURCHASE_CENTS, parseDollarsToCents } from "@/lib/formatMoney";
import { centsValue, engineAdapter, forecastStart, moneyString } from "./engine";
import type { SituationSnapshot } from "./situation";
import type { EngineComparison } from "@/types/engine";

export const FUTURES = ["Buy now", "Buy later", "Skip purchase"] as const;
export type FutureName = typeof FUTURES[number];
export type FutureLabForm = { amount: string; purchaseDate: string; comparisonDate: string; reserve: string };
export type FutureLabInput = { purchaseAmount: string; purchaseDate: string; comparisonDate: string; reserve: string };
export type FutureLabResult = { input: FutureLabInput; comparison: EngineComparison };

export function validateFutureLab(form: FutureLabForm, snapshot: SituationSnapshot): { input: FutureLabInput; error?: never } | { input?: never; error: string } {
  const amount = parseDollarsToCents(form.amount), reserve = parseDollarsToCents(form.reserve);
  if (amount === null || amount <= 0 || amount > MAX_PURCHASE_CENTS) return { error: "Enter a purchase amount from $0.01 to $100,000." };
  if (reserve === null || reserve > MAX_BUFFER_CENTS) return { error: "Enter a minimum reserve from $0 to $100,000." };
  const start = forecastStart(snapshot), end = addDays(start, 89);
  if (!isDateOnly(form.purchaseDate) || !isDateOnly(form.comparisonDate) || form.purchaseDate < start || form.comparisonDate <= form.purchaseDate || form.comparisonDate > end) return { error: "Choose purchase dates within the next 90 days, with the comparison date after the first purchase date." };
  return { input: { purchaseAmount: moneyString(amount), purchaseDate: form.purchaseDate, comparisonDate: form.comparisonDate, reserve: moneyString(reserve) } };
}

export async function compareFutures(snapshot: SituationSnapshot, input: FutureLabInput, signal?: AbortSignal): Promise<FutureLabResult> {
  // One compare request keeps alternatives on the engine's same snapshot and horizon.
  // /forecast has no hypothetical-purchase input; /simulate would refetch a separate snapshot.
  const comparison = await engineAdapter.compare(snapshot, [
    { name: "Buy now", purchase_amount: input.purchaseAmount, purchase_date: input.purchaseDate },
    { name: "Buy later", purchase_amount: input.purchaseAmount, purchase_date: input.comparisonDate },
    { name: "Skip purchase", purchase_amount: "0.00", purchase_date: input.purchaseDate },
  ], signal);
  return { input, comparison };
}

export type FutureScenario = EngineComparison["scenarios"][number];
export function eventDates(comparison: EngineComparison): string[] {
  return [...new Set(comparison.scenarios.flatMap(s => [s.as_of_date, s.horizon_end, ...s.transaction_timeline.map(e => e.date)]))].sort();
}
/** Select a server-returned closing/event balance. Never sum events or forecast locally. */
export function balanceAt(scenario: FutureScenario, date: string): string {
  return scenario.transaction_timeline.filter(e => e.date <= date).at(-1)?.balance ?? scenario.starting_balance;
}
export function reserveBreach(scenario: FutureScenario, reserve: string) {
  if (centsValue(scenario.starting_balance) < centsValue(reserve)) return { date: scenario.as_of_date, label: "The starting snapshot is already below this reserve." };
  const event = scenario.transaction_timeline.find(e => centsValue(e.balance) < centsValue(reserve));
  return event ? { date: event.date, label: `${event.description} leaves the event balance below this reserve.` } : null;
}
