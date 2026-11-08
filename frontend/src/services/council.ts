import { z } from "zod";
import type { SituationSnapshot } from "./situation";
import { centsValue } from "./engine";
import type { CouncilRun } from "@/types/council";
import { ApiError, requestJson } from "./apiClient";
import { ENDPOINTS } from "./endpoints";
import { councilMessageSchema, conversationSchema, councilRunSchema, councilStatusSchema, type CouncilRole, type CouncilMessage } from "@/types/council";
export const COUNCIL_UI_ENABLED = import.meta.env["VITE_COUNCIL_ENABLED"] === "true";
const path = (id: string) => {if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Invalid conversation"); return ENDPOINTS.councilConversations + "/" + id;};
export const councilAdapter = {
  status: (signal?: AbortSignal) => requestJson("", ENDPOINTS.councilStatus, councilStatusSchema, {signal}),
  create: (role: CouncilRole, signal?: AbortSignal) => requestJson("", ENDPOINTS.councilConversations, conversationSchema, {method: "POST", body: JSON.stringify({role}), signal}),
  read: (id: string, signal?: AbortSignal) => requestJson("", path(id), conversationSchema, {signal}),
  send: (id: string, input: CouncilMessage, signal?: AbortSignal) => requestJson("", path(id) + "/messages", councilRunSchema, {method: "POST", body: JSON.stringify(councilMessageSchema.parse(input)), signal}),
  cancel: (id: string, key: string) => requestJson("", path(id) + "/messages/" + encodeURIComponent(key) + "/cancel", z.object({cancel_requested: z.boolean()}), {method: "POST"}),
  clear: (id: string) => requestJson("", path(id), z.object({cleared: z.boolean()}), {method: "DELETE"}),
};

export function assertCouncilSnapshot(result: CouncilRun, snapshot: SituationSnapshot) {
  if (!result.analysis) return;
  const analysis = result.analysis;
  if (analysis.provenance.snapshot_as_of !== snapshot.startDate || analysis.provenance.currency !== snapshot.currency ||
    (snapshot.source === "nessie_sandbox" && analysis.provenance.source !== "nessie_sandbox") ||
    analysis.scenarios.some(s => s.forecast.customer_id !== snapshot.customer.displayName ||
      centsValue(s.forecast.starting_balance) !== snapshot.startingBalanceCents)) {
    throw new ApiError("Financial snapshot changed. Refresh Current Situation before continuing.");
  }
}
