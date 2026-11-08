import { formatDateOnly } from "@/lib/dateOnly";
import { formatMoney } from "@/lib/formatMoney";
import type { ScenarioResult } from "@/types/financial";

/** Deterministic, rule-based explanation from the computed numbers. Not AI-generated. */
export function explainScenario(selected: ScenarioResult, all: ScenarioResult[], bufferCents: number): string[] {
  const d = (x: string) => formatDateOnly(x, "MMM d");
  const m = (c: number) => formatMoney(c);
  const out: string[] = [];
  const lowEvent = selected.appliedEvents.find((e) => e.date === selected.lowestBalanceDate && e.amountCents < 0 && e.type !== "purchase");
  const purchase = selected.appliedEvents.find((e) => e.type === "purchase");
  const nextIncome = selected.appliedEvents.find((e) => e.amountCents > 0 && e.date > selected.lowestBalanceDate);

  if (selected.id === "baseline") {
    out.push(`Without the purchase, your lowest balance is ${m(selected.lowestBalanceCents)} on ${d(selected.lowestBalanceDate)}${lowEvent ? `, right after ${lowEvent.label.toLowerCase()} is paid` : ""}.`);
  } else if (purchase) {
    out.push(`This scenario adds a hypothetical ${m(-purchase.amountCents)} expense on ${d(purchase.date)}.`);
    if (selected.firstNegativeDate) {
      out.push(`${lowEvent ? `${lowEvent.label} on ${d(lowEvent.date)} lands before ` : "The balance drops before "}${nextIncome ? `your next paycheck on ${d(nextIncome.date)}` : "any more income arrives"}, so your balance may dip to ${m(selected.lowestBalanceCents)} — below $0 for ${selected.daysBelowZero} day${selected.daysBelowZero === 1 ? "" : "s"}.`);
    } else {
      out.push(`Your lowest balance stays at ${m(selected.lowestBalanceCents)} on ${d(selected.lowestBalanceDate)}, and the balance never goes below $0.`);
    }
  }
  if (selected.daysBelowBuffer > 0) out.push(`It sits under your ${m(bufferCents)} buffer for ${selected.daysBelowBuffer} day${selected.daysBelowBuffer === 1 ? "" : "s"}.`);

  const now = all.find((r) => r.id === "buy-now");
  const later = all.find((r) => r.id === "buy-later");
  if (now && later && now.endingBalanceCents === later.endingBalanceCents && now.lowestBalanceCents !== later.lowestBalanceCents) {
    out.push(`Buying now or later ends the period at the same ${m(now.endingBalanceCents)} — only the timing changes the low point (${m(now.lowestBalanceCents)} vs ${m(later.lowestBalanceCents)}).`);
  }
  return out;
}
