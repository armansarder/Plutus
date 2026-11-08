import { z } from "zod";
import { categoryIdSchema, dataSourceSchema } from "./financial";

/**
 * Year-so-far history contract. The synthetic fixture is generated demo data —
 * `generated: true` makes that explicit so the UI can label it and never present
 * it as Nessie/bank records.
 */
const cents = z.number().int().safe();

export const monthlyHistorySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  incomeCents: cents.nonnegative(),
  spendingCents: cents.nonnegative(),
  savingsCents: cents.nonnegative(),
  byCategory: z.array(z.object({ categoryId: categoryIdSchema, spentCents: cents.nonnegative() })),
  milestone: z.string().max(120).nullable(),
});

export const yearHistorySchema = z.object({
  source: dataSourceSchema,
  generated: z.literal(true),
  year: z.number().int().min(2000).max(2100),
  months: z.array(monthlyHistorySchema).max(12),
});

export type MonthlyHistory = z.infer<typeof monthlyHistorySchema>;
export type YearHistory = z.infer<typeof yearHistorySchema>;

export interface HistoryAdapter {
  getYearHistory(year: number, signal?: AbortSignal): Promise<YearHistory>;
}
