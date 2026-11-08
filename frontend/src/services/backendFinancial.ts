import { z } from "zod";
import { isDateOnly } from "@/lib/dateOnly";

const day = z.string().refine(isDateOnly);
export const decimalCents = z.string().max(100).regex(/^-?\d+\.\d{2}$/).transform(value => {
  const negative = value.startsWith("-");
  const [whole, fraction] = value.replace(/^-/, "").split(".");
  return Number((negative ? -1n : 1n) * (BigInt(whole!) * 100n + BigInt(fraction!)));
}).pipe(z.number().int().safe());
const transaction = z.object({
  id: z.string().min(1).max(200), date: day, description: z.string().min(1).max(200),
  amount: decimalCents, type: z.enum(["income", "expense"]), source_status: z.enum(["confirmed", "estimated"]),
}).refine(t => t.type === "income" ? t.amount > 0 : t.amount < 0);
export const backendFinancialSchema = z.object({ source: z.enum(["nessie_sandbox", "synthetic_demo", "configured_backend"]).optional(), data: z.object({
  customer_id: z.string().min(1).max(200), currency: z.literal("USD"), as_of_date: day,
  current_balance: decimalCents, upcoming_transactions: z.array(transaction).max(1000),
  snapshot_basis: z.enum(["opening", "intraday"]).default("opening"),
  source_notes: z.array(z.string().max(200)).max(20).default([]),
}) }).refine(({data}) => new Set(data.upcoming_transactions.map(t => t.id)).size === data.upcoming_transactions.length && data.upcoming_transactions.every(t => data.snapshot_basis === "intraday" ? t.date > data.as_of_date : t.date >= data.as_of_date));
