import { z } from "zod";
import { engineDay, engineMoney, engineForecastSchema } from "./engine";
import { decimalCents } from "@/services/backendFinancial";
import { addDays } from "@/lib/dateOnly";
export const multiverseRequestSchema = z.object({
  purchase_amount: engineMoney, purchase_date: engineDay, later_date: engineDay,
  reserve: engineMoney, horizon_days: z.number().int().min(1).max(90), stress_expense: engineMoney,
  extra_expenses: z.array(z.object({date: engineDay, amount: engineMoney}).strict()).max(20).default([]),
}).strict();
export const multiverseSchema = z.object({schema_version: z.literal("1.0"),
  source: z.object({source: z.enum(["nessie_sandbox","synthetic_demo","configured_backend","research_scenario"]), label:z.string(), snapshot_date:engineDay, snapshot_id:z.string(), observed_at:z.string(), cache_max_seconds:z.number(), schedule_complete:z.literal(false)}),
  reserve:engineMoney,input:multiverseRequestSchema,assumptions:z.array(z.string()),
  scenarios:z.array(z.object({name:z.enum(["buy_now","buy_later","skip","unexpected_expense","delayed_income"]), applicable:z.boolean(),maintains_reserve:z.boolean(),first_reserve_breach:engineDay.nullable(),forecast:engineForecastSchema,differences:z.array(z.object({date:engineDay,balance_difference:engineMoney}))})).length(5),
}).superRefine((value,ctx)=>{
  const baseline=value.scenarios[0]?.forecast;
  if(new Set(value.scenarios.map(s=>s.name)).size!==5)ctx.addIssue({code:"custom",message:"Duplicate futures"});
  for(const s of value.scenarios)if(s.forecast.start_date!==baseline?.start_date || s.forecast.end_date!==baseline?.end_date || s.forecast.daily_balances.map(p=>p.date).join()!==baseline?.daily_balances.map(p=>p.date).join())ctx.addIssue({code:"custom",message:"Unaligned futures"});
  // Validate returned evidence only; never generate a financial projection here.
  const skip=value.scenarios.find(s=>s.name==='skip');
  for(const s of value.scenarios){
    if(s.forecast.customer_id!==baseline?.customer_id || s.forecast.currency!==baseline?.currency || s.forecast.daily_balances.length!==value.input.horizon_days || s.differences.length!==s.forecast.daily_balances.length || s.maintains_reserve!==(decimalCents.parse(s.forecast.minimum_balance)>=decimalCents.parse(value.reserve)) || (s.name!=='delayed_income'&&!s.applicable))ctx.addIssue({code:'custom',message:'Inconsistent future evidence'});
    s.forecast.daily_balances.forEach((point,i)=>{
      const difference=s.differences[i],base=skip?.forecast.daily_balances[i];
      if(point.date!==addDays(s.forecast.start_date,i) || !difference || difference.date!==point.date || !base || decimalCents.parse(difference.balance_difference)!==decimalCents.parse(point.ending_balance)-decimalCents.parse(base.ending_balance))ctx.addIssue({code:'custom',message:'Inconsistent timeline difference'});
    });
  }
});
export type Multiverse = z.infer<typeof multiverseSchema>;
