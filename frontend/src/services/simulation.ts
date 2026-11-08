import { SyntheticSimulationAdapter } from "@/mocks/syntheticSimulationAdapter";
import { HORIZON_DAYS, scenarioComparisonSchema, type SimulationAdapter } from "@/types/financial";
import { requestJson, resolveBaseUrl } from "./apiClient";
import { API_BASE_URL, DATA_MODE } from "./config";
import { unavailable } from "./unavailable";

/** Future: POST /api/v1/simulations/compare — backend is the authoritative calculator. */
export class HttpSimulationAdapter implements SimulationAdapter {
  constructor(private baseUrl = resolveBaseUrl(API_BASE_URL, import.meta.env.PROD)) {}
  compareScenarios(request: Parameters<SimulationAdapter["compareScenarios"]>[0], signal?: AbortSignal) {
    return requestJson(this.baseUrl, "/api/v1/simulations/compare", scenarioComparisonSchema, {
      method: "POST",
      body: JSON.stringify(request),
      signal,
    });
  }
}

export const simulationAdapter: SimulationAdapter =
  DATA_MODE === "remote" ? { compareScenarios: unavailable } : new SyntheticSimulationAdapter();

export function baselineQueryOptions(snapshotId: string, startDate: string, bufferCents = 20000) {
  return {
    queryKey: ["baseline", DATA_MODE, snapshotId, bufferCents] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      simulationAdapter.compareScenarios(
        {
          snapshotId,
          startDate,
          horizonDays: HORIZON_DAYS,
          bufferCents,
           scenarios: [{ id: "baseline", name: "Baseline", purchaseAmountCents: 0, purchaseDate: null, categoryId: "fun" }],
        },
        signal,
      ),
    staleTime: Infinity,
  };
}
