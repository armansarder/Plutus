import type { NemotronResponse } from "@/types/nemotron";
import { centsValue } from "@/services/engine";
import { formatMoney } from "./formatMoney";
import { formatDateOnly } from "./dateOnly";

export type DecisionExplanation = {
  headline: string;
  tone: "risk" | "caution" | "limited" | "cushion";
  reasons: string[];
  alternatives: string[];
  limitation: string;
};

/** Presentation only. Uses returned flags/balances/dates; never recalculates a future. */
export function explainDecision(response: NemotronResponse): DecisionExplanation {
  const purchase = response.scenarios.find(s => s.name === "purchase")!;
  const baseline = response.scenarios.find(s => s.name === "baseline")!;
  const later = response.scenarios.find(s => s.name === "buy_later")!;
  const failed = response.scenarios.filter(s => (s.name === "delayed_income" || s.name === "unexpected_expense") && s.applicable && !s.maintains_reserve);
  const minimum = formatMoney(centsValue(purchase.forecast.minimum_balance));
  const reserve = formatMoney(centsValue(response.passport.reserve));
  const unknownSchedule = !response.provenance.schedule_complete;
  const noEvents = unknownSchedule && baseline.forecast.transaction_timeline.length === 0;
  let headline: string, tone: DecisionExplanation["tone"];
  const reasons: string[] = [];
  if (purchase.forecast.shortfall_occurs) {
    headline = "I wouldn't buy this right now."; tone = "risk";
    reasons.push(`At its lowest, your balance could fall to ${minimum} on ${formatDateOnly(purchase.forecast.minimum_balance_date)}, below zero.`);
  } else if (!purchase.maintains_reserve) {
    headline = "I'd wait before buying this."; tone = "caution";
    reasons.push(`Your balance could fall to ${minimum}, below the ${reserve} safety cushion you chose.`);
  } else if (failed.length) {
    headline = "I'd be cautious about buying this."; tone = "caution";
    reasons.push(`If things go as expected, the forecast keeps your ${reserve} cushion.`);
  } else if (noEvents) {
    headline = "I don't have enough information to recommend this yet."; tone = "limited";
    reasons.push("We don't have upcoming bills or income for this account, so a flat forecast is not enough.");
  } else {
    headline = "This fits your selected cash cushion in the scenarios we tested."; tone = "cushion";
    reasons.push(`At its lowest, your balance could fall to ${minimum}, above or at your ${reserve} safety cushion.`);
    reasons.push("It also keeps that cushion in the what-if tests that apply to your account.");
  }
  if (failed.length) {
    const names = failed.length > 1 ? "A late paycheck or an unexpected bill" : failed[0]!.name === "delayed_income" ? "A late paycheck" : "An unexpected bill";
    reasons.push(`${names} in our what-if tests could put your balance below your cushion.`);
  }
  if (noEvents && purchase.maintains_reserve && failed.length) reasons.push("We don't have your upcoming bills or income, so these tests cover only a limited picture.");
  if (!baseline.maintains_reserve && !noEvents) reasons.push("Even without this purchase, the bills we know about could put you below your cushion.");

  const alternatives: string[] = [];
  const chosen = purchase.purchase_date;
  // This alternative is checked as an ordinary purchase, not a stress-tested later purchase.
  if (!noEvents && later.purchase_date && chosen && later.purchase_date > chosen && later.maintains_reserve && response.safe_purchase_dates.includes(later.purchase_date) && !purchase.maintains_reserve) {
    alternatives.push(`Consider ${formatDateOnly(later.purchase_date)} instead: the tested later purchase keeps your cushion if things go as expected. That date has not been stress-tested.`);
  } else if (!noEvents && !purchase.maintains_reserve) {
    const testedDate = response.safe_purchase_dates.find(date => chosen && date > chosen);
    if (testedDate) alternatives.push(`Consider ${formatDateOnly(testedDate)}: the engine tested that purchase date and it keeps your cushion if things go as expected. That date has not been stress-tested.`);
  }
  if ((tone === "risk" || tone === "caution") && baseline.maintains_reserve && !noEvents) {
    alternatives.push("Skip this purchase for now: the no-purchase forecast keeps your cushion with the bills we know about.");
  }
  if (!alternatives.length) alternatives.push(noEvents ? "Confirm your upcoming bills and expected income in the account data, then check again." : !baseline.maintains_reserve ? "Pause this purchase and review the upcoming bills that already put your cushion at risk." : "Review your category spending plan and protected savings before committing; this analysis cannot confirm them.");

  return {
    headline, tone, reasons: reasons.slice(0, 3), alternatives: alternatives.slice(0, 2),
    limitation: `${unknownSchedule ? "We might not know about all your upcoming bills. " : ""}Category budgets and protected savings are unknown, so this does not confirm full budget affordability.`,
  };
}
