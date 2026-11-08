import { demoYearHistory } from "@/mocks/demoYearHistory";
import { yearHistorySchema, type HistoryAdapter, type YearHistory } from "@/types/history";
import { requestJson, resolveBaseUrl } from "./apiClient";
import { API_BASE_URL, DATA_MODE } from "./config";
import { ENDPOINTS } from "./endpoints";
import { unavailable } from "./unavailable";

/** Future: GET /api/financial/history?year=YYYY — normalized Nessie records from the backend. */
export class HttpHistoryAdapter implements HistoryAdapter {
  constructor(private baseUrl = resolveBaseUrl(API_BASE_URL, import.meta.env.PROD)) {}
  getYearHistory(year: number, signal?: AbortSignal) {
    return requestJson(this.baseUrl, `${ENDPOINTS.financialHistory}?year=${year}`, yearHistorySchema, { signal });
  }
}

export class SyntheticHistoryAdapter implements HistoryAdapter {
  getYearHistory(year: number, signal?: AbortSignal): Promise<YearHistory> {
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    if (year !== demoYearHistory.year) {
      return Promise.resolve(yearHistorySchema.parse({ source: "synthetic_demo", generated: true, year, months: [] }));
    }
    return Promise.resolve(yearHistorySchema.parse(structuredClone(demoYearHistory)));
  }
}

export const historyAdapter: HistoryAdapter =
  DATA_MODE === "remote" ? { getYearHistory: unavailable } : new SyntheticHistoryAdapter();

export const yearHistoryQueryOptions = (year: number) => ({
  queryKey: ["year-history", DATA_MODE, year] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => historyAdapter.getYearHistory(year, signal),
  staleTime: Infinity,
});
