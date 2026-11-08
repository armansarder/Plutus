import { z } from "zod";
import { engineDay, engineMoney, engineForecastSchema } from "./engine";
import { decimalCents } from "@/services/backendFinancial";

const boundedMoney = engineMoney.refine(value => decimalCents.parse(value) >= 0 && decimalCents.parse(value) <= 100_000_000);
/** Purchase-analysis contract; free-text intent extraction is not implemented by the backend. */
export const nemotronRequestSchema = z.object({
  message: z.string().max(2000).default(""),
  purchase_amount: boundedMoney.refine(value => decimalCents.parse(value) > 0),
  purchase_date: engineDay.optional(), reserve: boundedMoney.default("200.00"),
  horizon_days: z.number().int().min(1).max(90).default(30),
  allow_model: z.boolean().default(true), channel: z.literal("web").default("web"),
}).strict();
export const scenarioName = z.enum(["baseline", "purchase", "delayed_income", "unexpected_expense", "buy_later"]);
export const nemotronResponseSchema = z.object({
  schema_version: z.literal("1.0"), request_id: z.string().min(1),
  mode: z.enum(["nemotron", "deterministic_fallback"]), model: z.string().nullable(),
  fallback_reason: z.enum(["model_disabled", "model_unavailable", "model_protocol_failed"]).nullable(),
  summary: z.string().max(10000), risk_level: z.enum(["high", "medium", "low"]),
  scenarios: z.array(z.object({ name: scenarioName, purchase_date: engineDay.nullable(), applicable: z.boolean(), maintains_reserve: z.boolean(), forecast: engineForecastSchema })).length(5),
  safe_purchase_dates: z.array(engineDay).max(90), safe_to_spend_on_purchase_date: engineMoney,
  stress_tests_passed: z.number().int().min(0).max(2), stress_tests_total: z.number().int().min(1).max(2),
  provenance: z.object({ source: z.string(), snapshot_as_of: engineDay, snapshot_id: z.string(), generated_at: z.string().datetime({ offset: true }), currency: z.literal("USD"), synthetic: z.boolean(), schedule_complete: z.boolean() }),
  passport: z.object({ id: z.string(), purchase_amount: engineMoney, reserve: engineMoney, horizon_end: engineDay, recommendation: z.enum(["consider_purchase", "consider_waiting", "reserve_at_risk"]), evidence_scenarios: z.array(scenarioName).max(5), assumptions: z.array(z.string()), payment_executed: z.literal(false) }),
  trust_shield: z.object({ permissions: z.array(z.string()), payment_execution: z.literal(false), external_message_sent: z.literal(false), model_data_shared: z.boolean(), untrusted_text_excluded: z.literal(true), security_scope: z.string() }),
  tool_trace: z.array(z.object({ tool: z.enum(["simulate_scenario", "decision"]), scenario: scenarioName.nullable().optional(), status: z.enum(["completed", "rejected", "fallback"]), initiated_by: z.enum(["nemotron", "server"]) })).max(25),
  photon: z.object({ text: z.string(), simulated: z.literal(true), delivery_status: z.literal("draft_only"), requires_authenticated_delivery: z.literal(true) }),
}).superRefine((result, ctx) => {
  const names = new Set(result.scenarios.map(s => s.name));
  const stresses = result.scenarios.filter(s => ["delayed_income", "unexpected_expense"].includes(s.name) && s.applicable);
  if (names.size !== 5 || result.stress_tests_total !== stresses.length || result.stress_tests_passed !== stresses.filter(s => s.maintains_reserve).length ||
    result.scenarios.some(s => s.name !== "delayed_income" && !s.applicable) ||
    (result.mode === "nemotron" ? result.fallback_reason !== null || !result.model || !result.trust_shield.model_data_shared || !result.tool_trace.some(t => t.tool === "decision" && t.status === "completed" && t.initiated_by === "nemotron") : result.fallback_reason === null)) ctx.addIssue({ code: "custom", message: "Inconsistent agent evidence" });
});
export type NemotronRequest = z.infer<typeof nemotronRequestSchema>;
export type NemotronResponse = z.infer<typeof nemotronResponseSchema>;
