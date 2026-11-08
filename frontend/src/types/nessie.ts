import { z } from "zod";
import { engineDay, engineMoney } from "./engine";
export const demoSessionSchema = z.object({ enabled: z.boolean(), profiles: z.array(z.object({ id: z.string(), label: z.string() })).max(12), active: z.string().nullable(), generation: z.string().nullable().optional(), notice: z.string() });
export const insightsSchema = z.object({source: z.literal("nessie_sandbox"), currency: z.literal("USD"), as_of_date: engineDay, fetched_at: z.string().nullable().optional(), period_start: engineDay,
 accounts: z.array(z.object({selected: z.boolean(), type: z.string(), balance: engineMoney, label: z.string()})).max(12),
 income: engineMoney, spending: engineMoney, transfer_volume: engineMoney, transaction_count: z.number().int().nonnegative(),
 categories: z.array(z.object({label: z.string(), amount: engineMoney})).max(10), merchants: z.array(z.object({label: z.string(), amount: engineMoney})).max(10),
 activity: z.array(z.object({date: engineDay, amount: engineMoney, merchant: z.string(), category: z.string(), source: z.string()})).max(200),
 bills: z.array(z.object({id: z.string(), date: engineDay, description: z.string(), amount: engineMoney, type: z.enum(["income","expense"]), source_status: z.enum(["estimated","confirmed"])})).max(1000),
 loans: z.array(z.object({type: z.string(), status: z.string()})).max(100), loan_status: z.enum(["available","unavailable","unsupported"]), notes: z.array(z.string()) });
export type NessieInsights = z.infer<typeof insightsSchema>;
