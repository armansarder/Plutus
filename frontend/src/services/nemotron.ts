import { requestJson, ApiError } from "./apiClient";
import { DATA_MODE } from "./config";
import { ENDPOINTS } from "./endpoints";
import { nemotronRequestSchema, nemotronResponseSchema, type NemotronRequest } from "@/types/nemotron";
import type { SituationSnapshot } from "./situation";
import { centsValue, forecastStart } from "./engine";
import { addDays } from "@/lib/dateOnly";

export const nemotronAdapter = {
  async run(snapshot: SituationSnapshot, input: NemotronRequest, signal?: AbortSignal) {
    if (DATA_MODE !== "remote") throw new ApiError("The backend agent is disabled in Alex demo mode.");
    const request = nemotronRequestSchema.parse(input);
    const response = await requestJson("", ENDPOINTS.agentRun, nemotronResponseSchema, { method: "POST", body: JSON.stringify(request), signal });
    if ((response.fallback_reason === "model_disabled") !== !request.allow_model || (!request.allow_model && (response.mode === "nemotron" || response.trust_shield.model_data_shared))) throw new ApiError("Unexpected model operation.");
    const start = forecastStart(snapshot), end = addDays(start, request.horizon_days - 1);
    const purchase = response.scenarios.find(s => s.name === "purchase")!;
    if ((snapshot.source === "nessie_sandbox" && response.provenance.source !== "nessie_sandbox") || response.provenance.snapshot_as_of !== snapshot.startDate || response.provenance.currency !== snapshot.currency || response.scenarios.some(s =>
      s.forecast.customer_id !== snapshot.customer.displayName || s.forecast.currency !== snapshot.currency ||
      centsValue(s.forecast.starting_balance) !== snapshot.startingBalanceCents || s.forecast.start_date !== start || s.forecast.end_date !== end ||
      s.forecast.daily_balances.length !== request.horizon_days || s.forecast.daily_balances.some((day, i) => day.date !== addDays(start, i)))) throw new ApiError("The agent snapshot changed. Refresh your financial records.");
    if (response.passport.id !== response.request_id || response.passport.purchase_amount !== request.purchase_amount || response.passport.reserve !== request.reserve || response.passport.horizon_end !== end || purchase.purchase_date !== (request.purchase_date ?? start)) throw new ApiError("The agent returned a different purchase analysis.");
    return response;
  },
};
