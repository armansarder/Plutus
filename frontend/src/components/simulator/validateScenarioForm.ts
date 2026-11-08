import { isDateOnly } from "@/lib/dateOnly";
import { MAX_BUFFER_CENTS, MAX_PURCHASE_CENTS, parseDollarsToCents } from "@/lib/formatMoney";
import { categoryIdSchema } from "@/types/financial";

export type ScenarioFormValues = { label: string; amount: string; purchaseDate: string; altDate: string; buffer: string; categoryId: string };
export type ScenarioFormErrors = Partial<Record<keyof ScenarioFormValues, string>>;
export type ValidScenarioForm = { label: string; amountCents: number; purchaseDate: string; altDate: string; bufferCents: number; categoryId: Exclude<import("@/types/financial").BudgetCategory["categoryId"], "savings"> };

export function validateScenarioForm(
  v: ScenarioFormValues,
  minDate: string,
  maxDate: string,
): { ok: true; value: ValidScenarioForm } | { ok: false; errors: ScenarioFormErrors } {
  const errors: ScenarioFormErrors = {};
  const cat = categoryIdSchema.safeParse(v.categoryId);
  if (!cat.success || cat.data === "savings") errors.categoryId = "Choose a spending category.";
  const label = v.label.trim();
  if (!label) errors.label = "Give this purchase a short name.";
  else if (label.length > 60) errors.label = "Keep the name under 60 characters.";

  const amountCents = parseDollarsToCents(v.amount);
  if (amountCents === null) errors.amount = "Enter a dollar amount, like 400 or 399.99.";
  else if (amountCents <= 0) errors.amount = "Amount must be greater than $0.";
  else if (amountCents > MAX_PURCHASE_CENTS) errors.amount = "For this demo, keep purchases at or under $100,000.";

  const inRange = (d: string) => isDateOnly(d) && d >= minDate && d <= maxDate;
  if (!inRange(v.purchaseDate)) errors.purchaseDate = "Pick a date within the 30-day forecast.";
  if (!inRange(v.altDate)) errors.altDate = "Pick a date within the 30-day forecast.";
  else if (!errors.purchaseDate && v.altDate <= v.purchaseDate) errors.altDate = "The alternative date must be later than the purchase date.";

  const bufferCents = parseDollarsToCents(v.buffer);
  if (bufferCents === null) errors.buffer = "Enter a dollar amount (0 is fine).";
  else if (bufferCents > MAX_BUFFER_CENTS) errors.buffer = "Keep the buffer at or under $100,000.";

  if (Object.keys(errors).length || amountCents === null || bufferCents === null || !cat.success || cat.data === "savings") return { ok: false, errors };
  return { ok: true, value: { label, amountCents, purchaseDate: v.purchaseDate, altDate: v.altDate, bufferCents, categoryId: cat.data } };
}
