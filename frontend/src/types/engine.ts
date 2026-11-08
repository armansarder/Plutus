import { z } from "zod";
import { isDateOnly } from "@/lib/dateOnly";
import { decimalCents } from "@/services/backendFinancial";

export const engineDay = z.string().refine(isDateOnly, "Use YYYY-MM-DD");
// Validate exact cents without changing the wire representation in the server proxy.
export const engineMoney = z.string().max(100).refine(v => decimalCents.safeParse(v).success, "Use decimal money with two places");
export const purchaseRequestSchema = z.object({ purchase_amount: engineMoney.refine(v => decimalCents.parse(v) >= 0), purchase_date: engineDay }).strict();
export const forecastRequestSchema = z.object({ start_date: engineDay, end_date: engineDay }).strict().refine(v => v.end_date >= v.start_date);
// This UI offers purchase/date alternatives only; no arbitrary stress mutations.
export const compareRequestSchema = z.object({ scenarios: z.array(purchaseRequestSchema.extend({ name: z.string().min(1).max(200) }).strict()).min(1).max(5) }).strict().refine(v => new Set(v.scenarios.map(s => s.name)).size === v.scenarios.length);
const timelineEvent = z.object({ id: z.string(), date: engineDay, description: z.string().max(200), amount: engineMoney, type: z.enum(["income", "expense"]), source_status: z.enum(["confirmed", "estimated"]), balance: engineMoney });
const assumptions = z.object({ snapshot: z.string(), same_day_order: z.string(), coverage: z.string(), estimated_transaction_ids: z.array(z.string()), missing_information: z.array(z.string()), currency_precision: z.string(), source_notes: z.array(z.string()) });
const common = { customer_id: z.string().min(1).max(200), currency: z.literal("USD"), starting_balance: engineMoney, ending_balance: engineMoney, minimum_balance: engineMoney, minimum_balance_date: engineDay, shortfall_occurs: z.boolean(), transaction_timeline: z.array(timelineEvent).max(2000), assumptions };
export const engineSimulationSchema = z.object({ ...common, as_of_date: engineDay, horizon_end: engineDay });
export const engineComparisonSchema = z.object({ customer_id: z.string().min(1).max(200), currency: z.literal("USD"), horizon_end: engineDay, scenarios: z.array(engineSimulationSchema.extend({ name: z.string() })).min(1).max(5) });
export const engineForecastSchema = z.object({ ...common, start_date: engineDay, end_date: engineDay, daily_balances: z.array(z.object({ date: engineDay, ending_balance: engineMoney })).min(1).max(3661), negative_balance_days: z.array(engineDay), minimum_daily_ending_balance: engineMoney, minimum_daily_ending_balance_date: engineDay });
export const engineHistorySchema = z.object({ customer_id: z.string().min(1).max(200), currency: z.literal("USD"), as_of_date: engineDay, months: z.array(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), spending: engineMoney, income: engineMoney, net: engineMoney, by_category: z.array(z.object({ category: z.string(), amount: engineMoney })), transaction_count: z.number().int().nonnegative() })).max(24), selected_month: z.string().nullable().optional(), transactions: z.array(z.object({ id: z.string(), account_type: z.string(), date: engineDay, amount: engineMoney, source: z.enum(["deposit", "withdrawal", "purchase", "transfer", "bill"]), merchant: z.string(), category: z.string(), description: z.string(), is_transfer: z.boolean(), is_spending: z.boolean(), is_income: z.boolean() })), notes: z.array(z.string()) });
export type EngineSimulation = z.infer<typeof engineSimulationSchema>;
export type EngineComparison = z.infer<typeof engineComparisonSchema>;
export type EngineForecast = z.infer<typeof engineForecastSchema>;
export type EngineHistory = z.infer<typeof engineHistorySchema>;
export type EnginePurchase = z.infer<typeof purchaseRequestSchema>;
