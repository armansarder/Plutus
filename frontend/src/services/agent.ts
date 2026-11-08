import { SyntheticAgentAdapter } from "@/mocks/syntheticAgentAdapter";
import { agentResponseSchema, messagingStatusSchema, type AgentAdapter, type MessagingAdapter } from "@/types/agent";
import { requestJson, resolveBaseUrl } from "./apiClient";
import { API_BASE_URL, DATA_MODE } from "./config";
import { ENDPOINTS } from "./endpoints";
import { unavailable } from "./unavailable";

/** Future: POST /api/agent/message — Nemotron orchestrates simulation tools on the backend. */
export class HttpAgentAdapter implements AgentAdapter {
  constructor(private baseUrl = resolveBaseUrl(API_BASE_URL, import.meta.env.PROD)) {}
  ask(message: string, signal?: AbortSignal) {
    return requestJson(this.baseUrl, ENDPOINTS.agentMessage, agentResponseSchema, {
      method: "POST",
      body: JSON.stringify({ message }),
      signal,
    });
  }
}

/** Future: GET /api/messaging/status — real Photon connection state from the backend. */
export class HttpMessagingAdapter implements MessagingAdapter {
  constructor(private baseUrl = resolveBaseUrl(API_BASE_URL, import.meta.env.PROD)) {}
  getStatus(signal?: AbortSignal) {
    return requestJson(this.baseUrl, ENDPOINTS.messagingStatus, messagingStatusSchema, { signal });
  }
}

export class SyntheticMessagingAdapter implements MessagingAdapter {
  getStatus() {
    return Promise.resolve(messagingStatusSchema.parse({ connected: false, demo: true, channel: null, instructions: null }));
  }
}

export const agentAdapter: AgentAdapter = DATA_MODE === "remote" ? { ask: unavailable } : new SyntheticAgentAdapter();
export const messagingAdapter: MessagingAdapter = DATA_MODE === "remote" ? { getStatus: unavailable } : new SyntheticMessagingAdapter();
