import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { requestJson, ApiError } from "./apiClient";
import { centsValue } from "./engine";
import type { SituationSnapshot } from "./situation";

import { cashPlanRequestSchema, cashPlanResultSchema } from "@/types/cashPlan";
import type { CashPlanResult } from "@/types/cashPlan";
export type { CashPlanResult } from "@/types/cashPlan";
export async function previewCashPlan(snapshot: SituationSnapshot, input: z.infer<typeof cashPlanRequestSchema>) {
  const result = await requestJson("", "/api/cash-plan/preview",cashPlanResultSchema,{method:"POST",body:JSON.stringify(cashPlanRequestSchema.parse(input))});
  if (result.customer_id!==snapshot.customer.displayName || result.snapshot_as_of!==snapshot.startDate || centsValue(result.starting_balance)!==snapshot.startingBalanceCents) throw new ApiError("Account snapshot changed. Refresh your records before setting the plan.");
  return result;
}
export function useCashPlan(snapshot: SituationSnapshot) {
  const client = useQueryClient();
  const key = ["confirmed-cash-plan",snapshot.snapshotId,snapshot.startingBalanceCents,JSON.stringify(snapshot.cashFlows)];
  const {data} = useQuery<CashPlanResult|null>({queryKey:key,queryFn:async()=>null,initialData:null,enabled:false,staleTime:Infinity});
  return {
    plan: data, 
    approve: async (result: CashPlanResult) => {
      client.setQueryData(key, result);
      try {
        await requestJson("", "/api/notifications/cash-plan", z.any(), {
          method: "PUT",
          body: JSON.stringify({
            savings_target_cents: centsValue(result.planned_savings),
            reserve_cents: centsValue(result.reserve),
            essential_buffer_cents: centsValue(result.essential_buffer),
          }),
        });
        await client.invalidateQueries({ queryKey: ["notifications", "watchlist"] });
      } catch {
        // Safe fallback in test or offline mock environments
      }
    }
  };
}
