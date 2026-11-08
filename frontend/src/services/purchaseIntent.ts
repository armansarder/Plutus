/** Untrusted text proposes fields only. The user confirms before any analysis. */
import { z } from "zod";
import { addDays, isDateOnly } from "@/lib/dateOnly";
import { parseDollarsToCents } from "@/lib/formatMoney";
import { moneyString } from "./engine";

export const purchaseDraftSchema = z.object({
  kind: z.enum(["education", "clarify", "purchase", "comparison"]),
  options: z.array(z.object({label: z.string().max(80), amount: z.string()})).max(2),
  purchaseDate: z.string(), reserve: z.string().optional(), question: z.string(),
  availableCash: z.string().optional(),
}).strict();
export type PurchaseDraft = z.infer<typeof purchaseDraftSchema>;

export function localToday(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function proposePurchase(message: string, today: string, earliestDate: string): PurchaseDraft {
  const base: PurchaseDraft = {kind: "education", options: [], purchaseDate: earliestDate, question: ""};
  if (!/\b(buy|purchase|afford|cost|priced|versus|vs)\b|\$|\bdollars?\b/i.test(message)) return base;
  if (/credit card|\bAPR\b|interest|\bloan\b|invest|retire|\bdebt\b|pay off/i.test(message)) return {...base, kind:"clarify", question:"Debt, interest and investment comparisons need calculation modules that are not connected. I can compare cash purchases instead."};
  const explicit = message.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  if (explicit.length > 1 || (explicit[0] && !isDateOnly(explicit[0]))) return {...base, kind: "clarify", question: "Choose one valid purchase date (YYYY-MM-DD) for this comparison."};
  let purchaseDate = explicit[0] ?? (/\btomorrow\b/i.test(message) ? addDays(today, 1) : /\btoday\b/i.test(message) ? today : /\bnext week\b/i.test(message) ? addDays(today, 7) : earliestDate);
  if (!explicit.length && /\b(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(message)) return {...base, kind: "clarify", question: "Please choose the exact purchase date below so I don't guess which weekday you mean."};
  const matches = [...message.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?![\d.])|\b(\d[\d,]*(?:\.\d{1,2})?)\s*(?:USD|dollars?)\b|\b(\d[\d,]*(?:\.\d{1,2})?)\s*\$/gi)];
  let reserve: string | undefined;
  let availableCash: string | undefined;
  const options: {label: string; amount: string}[] = [];
  for (const match of matches) {
    const cents = parseDollarsToCents((match[1] ?? match[2] ?? match[3]!).replaceAll(",", ""));
    if (cents === null || cents < 0 || cents > 100_000_000) return {...base, kind: "clarify", question: "Please enter valid dollar amounts with at most two decimal places."};
    const before = message.slice(Math.max(0, match.index! - 28), match.index);
    const after = message.slice(match.index! + match[0].length, match.index! + match[0].length + 30);
    if (/(?:i\s+(?:have|saved)|(?:cash|balance|budget)\s*(?:is|of)?)\s*$/i.test(before) || /^\s*(?:available|saved|in my account)\b/i.test(after)) {
      if (availableCash) return {...base, kind:"clarify", question:"You mentioned more than one cash balance. Confirm purchase prices separately; the analysis uses your connected account snapshot."};
      availableCash = moneyString(cents); continue;
    }
    if (/(?:reserve|buffer)\s*(?:of|at least)?\s*$/i.test(before) || /(?:keep|leave)\s*(?:at least)?\s*$/i.test(before) || /^\s*(?:in|as|for)\s*(?:a\s*)?(?:reserve|buffer)/i.test(after)) {reserve = moneyString(cents); continue;}
    if (!cents) return {...base, kind: "clarify", question: "What is the positive purchase price for each choice?"};
    const words = after.match(/^\s*([a-zA-Z][a-zA-Z -]{0,55}?)(?=\s+(?:or|versus|vs|and|today|tomorrow|next|on)\b|[?.,]|$)/i)?.[1]?.trim();
    options.push({label: words || `Option ${options.length + 1}`, amount: moneyString(cents)});
  }
  if (!options.length) {
    if (/\blaptop\b/i.test(message) && /\bcar\b/i.test(message)) return {...base, kind:"comparison", availableCash,
      options:[{label:"Laptop",amount:""},{label:/down\s*payment|downpayment/i.test(message)?"Car down payment":"Car purchase",amount:""}],
      question:"What is the laptop price, and how much would you pay upfront for the car? Keeping the cash is included as a third choice. This covers upfront cash only; financing and ongoing car costs need separate inputs."};
    return {...base, kind: "clarify", availableCash, question: availableCash ? "That amount describes cash you have, not a purchase price. What would the purchase cost? Your connected account balance is kept separate." : "What are you choosing between, and what does each option cost? Include prices such as $500 laptop or $300 tablet."};
  }
  if (options.length > 2 || (options.length === 2 && !/\b(or|versus|vs)\b/i.test(message))) return {...base, kind: "clarify", question: "Please confirm one purchase, or two choices separated by 'or'. I won't guess which amount belongs to the purchase."};
  return purchaseDraftSchema.parse({...base, kind: options.length === 2 ? "comparison" : "purchase", options, purchaseDate, reserve, availableCash,
    question: purchaseDate < earliestDate ? "That date is before the first supported forecast date. Choose a later date below." : "Review these proposed details before running the calculation."});
}
