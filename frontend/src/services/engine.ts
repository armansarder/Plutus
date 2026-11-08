import { z } from "zod";
import { addDays } from "@/lib/dateOnly";
import { requestJson, ApiError } from "./apiClient";
import { decimalCents } from "./backendFinancial";
import type { SituationSnapshot } from "./situation";
import { DATA_MODE } from "./config";
import { purchaseRequestSchema, compareRequestSchema, forecastRequestSchema, engineSimulationSchema, engineComparisonSchema, engineForecastSchema, engineHistorySchema, type EnginePurchase } from "@/types/engine";

export const centsValue = (value: string) => decimalCents.parse(value);
export function moneyString(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new ApiError("Invalid amount");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
export const forecastStart = (snapshot: SituationSnapshot) => snapshot.backend?.basis === "intraday" ? addDays(snapshot.startDate, 1) : snapshot.startDate;

function connected() { if (DATA_MODE !== "remote") throw new ApiError("Backend calls are disabled in Alex demo mode"); }
function customer(snapshot: SituationSnapshot, result: { customer_id: string; currency: string }) {
  if (result.customer_id !== snapshot.customer.displayName || result.currency !== snapshot.currency) throw new ApiError("Backend customer changed. Refresh your financial records.");
}
function snapshotMatch(snapshot: SituationSnapshot, result: { as_of_date: string; starting_balance: string }) {
  if (result.as_of_date !== snapshot.startDate || centsValue(result.starting_balance) !== snapshot.startingBalanceCents) throw new ApiError("Backend snapshot changed. Refresh your financial records.");
}
export const engineAdapter = {
  async simulate(snapshot: SituationSnapshot, purchase: EnginePurchase, signal?: AbortSignal) {
    connected();
    const { data } = await requestJson("", "/api/simulate", z.object({ data: engineSimulationSchema }), { method: "POST", body: JSON.stringify(purchaseRequestSchema.parse(purchase)), signal });
    customer(snapshot, data); snapshotMatch(snapshot, data);
    return data;
  },
  async compare(snapshot: SituationSnapshot, scenarios: Array<EnginePurchase & { name: string }>, signal?: AbortSignal) {
    connected();
    const request = compareRequestSchema.parse({ scenarios });
    const { data } = await requestJson("", "/api/compare", z.object({ data: engineComparisonSchema }), { method: "POST", body: JSON.stringify(request), signal });
    customer(snapshot, data);
    if (data.scenarios.length !== scenarios.length || new Set(data.scenarios.map(s => s.name)).size !== scenarios.length) throw new ApiError("Incomplete scenario comparison");
    for (const scenario of data.scenarios) {
      customer(snapshot, scenario); snapshotMatch(snapshot, scenario);
      if (!scenarios.some(s => s.name === scenario.name) || scenario.horizon_end !== data.horizon_end) throw new ApiError("Unexpected scenario comparison");
    }
    return data;
  },
  async forecast(snapshot: SituationSnapshot, signal?: AbortSignal) {
    connected();
    const start = forecastStart(snapshot), end = addDays(start, 29);
    const { data } = await requestJson("", "/api/forecast", z.object({ data: engineForecastSchema }), { method: "POST", body: JSON.stringify(forecastRequestSchema.parse({ start_date: start, end_date: end })), signal });
    customer(snapshot, data);
    if (centsValue(data.starting_balance) !== snapshot.startingBalanceCents) throw new ApiError("Backend snapshot changed. Refresh your financial records.");
    if (data.start_date !== start || data.end_date !== end || data.daily_balances.length !== 30 || data.daily_balances.some((d, i) => d.date !== addDays(start, i))) throw new ApiError("Unexpected forecast dates");
    return data;
  },
  async history(snapshot: SituationSnapshot, signal?: AbortSignal) {
    connected();
    const { data } = await requestJson("", "/api/history?months=12", z.object({ data: engineHistorySchema }), { signal });
    customer(snapshot, data);
    return data;
  },
};
