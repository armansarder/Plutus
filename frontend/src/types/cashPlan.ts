import { z } from "zod";
import { engineDay, engineMoney } from "./engine";
import { decimalCents } from "@/services/backendFinancial";
const allocation = engineMoney.refine(v => decimalCents.parse(v)>=0 && decimalCents.parse(v)<=100_000_000);
export const cashPlanRequestSchema = z.object({savings_target:allocation, reserve:allocation, essential_buffer:allocation}).strict();
export const cashPlanResultSchema = z.object({customer_id:z.string(), currency:z.literal("USD"), snapshot_as_of:engineDay,
  starting_balance:engineMoney, month:z.string().regex(/^\d{4}-\d{2}$/), horizon_end:engineDay,
  planned_savings:engineMoney, reserve:engineMoney, essential_buffer:engineMoney, protected_amount:engineMoney, projected_minimum:engineMoney,
  available_flexible_spending:engineMoney, funding_gap:engineMoney, schedule_complete:z.literal(false), assumptions:z.array(z.string())});
export type CashPlanResult = z.infer<typeof cashPlanResultSchema>;
