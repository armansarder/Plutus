import { z } from "zod";
import { categoryIdSchema, compareScenariosRequestSchema } from "./financial";

/**
 * Contracts for the proposed Nemotron agent backend (POST /api/agent/message).
 * The frontend never fabricates tool results: structured payloads are either
 * produced by the backend or, in demo mode, computed by the same deterministic
 * simulation engine the Simulator uses.
 */
const cents = z.number().int().safe();

export const agentRequestSchema = z.object({ message: z.string().min(1).max(500) });

export const affordabilitySchema = z.object({
  purchaseLabel: z.string().max(80),
  purchaseAmountCents: cents.nonnegative(),
  categoryId: categoryIdSchema,
  categoryRemainingCents: cents.nullable(),
  assessment: z.enum(["Fits your plan", "Stretches your plan", "Cash-flow concern", "More information needed"]),
  lowestBalanceCents: cents,
  savingsImpact: z.enum(["intact", "requires_reallocation", "unknown"]),
  alternatives: z.array(z.string().max(160)).max(4),
});

export const stressScenarioSchema = z.object({
  id: z.string(),
  label: z.string().max(80),
  outcome: z.enum(["within_reserve", "below_reserve", "negative"]),
  lowestBalanceCents: cents,
  budgetImpact: z.string().max(200),
  savingsImpact: z.string().max(200),
  explanation: z.string().max(240),
});

export const agentResponseSchema = z.object({
  source: z.enum(["synthetic_demo", "nemotron"]),
  reply: z.string().min(1).max(2000),
  affordability: affordabilitySchema.nullable(),
  stressTest: z.object({ summary: z.string().max(200), scenarios: z.array(stressScenarioSchema).max(4) }).nullable(),
  simulatorRequest: compareScenariosRequestSchema.nullable(),
});

export const messagingStatusSchema = z.object({
  connected: z.boolean(),
  demo: z.boolean(),
  channel: z.string().nullable(),
  instructions: z.string().nullable(),
});

export type Affordability = z.infer<typeof affordabilitySchema>;
export type StressScenario = z.infer<typeof stressScenarioSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type MessagingStatus = z.infer<typeof messagingStatusSchema>;

export interface AgentAdapter {
  ask(message: string, signal?: AbortSignal): Promise<AgentResponse>;
}

export interface MessagingAdapter {
  getStatus(signal?: AbortSignal): Promise<MessagingStatus>;
}
