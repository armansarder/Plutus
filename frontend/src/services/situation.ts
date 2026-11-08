import { SyntheticDataAdapter } from "@/mocks/syntheticSimulationAdapter";
import type { FinancialDataAdapter, FinancialSnapshot } from "@/types/financial";
import { requestJson } from "./apiClient";
import { backendFinancialSchema } from "./backendFinancial";
import { DATA_MODE } from "./config";

export const SITUATION_DATA_MODE = DATA_MODE;
export type SituationSnapshot = FinancialSnapshot & { backend?: { notes: string[]; synthetic: boolean; basis: string; source?: "nessie_sandbox" | "synthetic_demo" | "configured_backend" } };
export class BackendSituationAdapter implements FinancialDataAdapter {
  readonly source = "configured_backend" as const;
  async getSnapshot(signal?: AbortSignal): Promise<SituationSnapshot> {
    const { data, source: reportedSource } = await requestJson("", "/api/financial-data", backendFinancialSchema, { signal });
    const source = reportedSource ?? (data.customer_id === "synthetic_demo" ? "synthetic_demo" : "configured_backend");
    const synthetic = source === "synthetic_demo";
    return {
      snapshotId: `backend:${source}:${data.customer_id}:${data.as_of_date}`, customer: { displayName: data.customer_id, persona: "Backend customer" },
      currency: data.currency, source, startDate: data.as_of_date,
      startingBalanceCents: data.current_balance,
      cashFlows: data.upcoming_transactions.map(t => ({ id: t.id, date: t.date, label: t.description, amountCents: t.amount, type: t.type, provenance: t.source_status === "estimated" ? "assumed" : "scheduled" })),
      backend: { notes: data.source_notes, synthetic, basis: data.snapshot_basis, source },
    };
  }
}
export const customerFinancialAdapter = DATA_MODE === "remote" ? new BackendSituationAdapter() : new SyntheticDataAdapter();
export const situationQueryOptions = {
  queryKey: ["customer-financial-snapshot", DATA_MODE],
  queryFn: ({ signal }: { signal: AbortSignal }): Promise<SituationSnapshot> => customerFinancialAdapter.getSnapshot(signal),
  retry: false, staleTime: DATA_MODE === "remote" ? 30000 : Infinity,
};
