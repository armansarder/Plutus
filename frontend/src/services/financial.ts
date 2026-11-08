import { financialSnapshotSchema, type FinancialDataAdapter } from "@/types/financial";
import { requestJson, resolveBaseUrl } from "./apiClient";
import { API_BASE_URL } from "./config";
import { customerFinancialAdapter, situationQueryOptions } from "./situation";

/** Future: GET /api/v1/financial/snapshot — the server identifies the user from its session. */
export class HttpFinancialDataAdapter implements FinancialDataAdapter {
  readonly source = "nessie_sandbox" as const;
  constructor(private baseUrl = resolveBaseUrl(API_BASE_URL, import.meta.env.PROD)) {}
  getSnapshot(signal?: AbortSignal) {
    return requestJson(this.baseUrl, "/api/v1/financial/snapshot", financialSnapshotSchema, { signal });
  }
}

// Every page and the legacy Current Situation API share one adapter and cache entry.
export const financialDataAdapter = customerFinancialAdapter;
export const snapshotQueryOptions = situationQueryOptions;
