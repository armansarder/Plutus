import { z } from "zod";
import { nemotronRequestSchema, nemotronResponseSchema, scenarioName } from "./nemotron";
import { engineDay, engineMoney } from "./engine";
import { decimalCents } from "@/services/backendFinancial";
export const councilRoleSchema = z.enum(["council", "budget", "risk", "simulator"]);
export type CouncilRole = z.infer<typeof councilRoleSchema>;
const id = z.string().regex(/^[a-f0-9]{32}$/);
const snapshotId = z.string().regex(/^[a-f0-9]{24}$/);
export const conversationCreateSchema = z.object({ role: councilRoleSchema }).strict();
export const councilMessageSchema = z.object({
  request_key: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/), message: z.string().min(1).max(2000),
  analysis: nemotronRequestSchema.nullable().optional(),
  handoff: z.string().regex(/^[a-f0-9]{32}:[a-f0-9]{32}$/).nullable().optional(),
  expected_snapshot_id: snapshotId.nullable().optional(), allow_model: z.boolean().default(true),
}).strict();
export const reviewSchema = z.object({ role: councilRoleSchema,
  stage: z.enum(["framing", "initial_review", "evidence_review", "direct_reply", "synthesis"]),
  status: z.enum(["complete", "unavailable", "rejected", "disabled", "cancelled"]),
  position: z.string().max(100), findings: z.array(z.object({id: z.string().max(200), text: z.string().max(2000), evidence_ids: z.array(z.string().max(200)).max(8)})).max(8),
  summary: z.string().max(3000), recommendation: z.string().max(1000).nullable().optional(), revised: z.boolean(), model: z.string().nullable(),
});
export const councilChartSchema = z.object({ id, snapshot_id: snapshotId, kind: z.literal("line"),
  currency: z.string().length(3), reserve: engineMoney,
  series: z.array(z.object({scenario: scenarioName, points: z.array(z.object({date: engineDay,
    balance: engineMoney, difference_from_baseline: engineMoney, reserve_headroom: engineMoney})).min(1).max(90)})).max(5),
  markers: z.array(z.object({scenario: scenarioName, date: engineDay, balance: engineMoney,
    kind: z.enum(["minimum", "first_reserve_breach"])})).max(10), assumptions: z.array(z.string()).max(20),
});
export const councilRunSchema = z.object({ schema_version: z.literal("2.0"), run_id: id,
  conversation_id: id, role: councilRoleSchema,
  status: z.enum(["complete", "partial", "needs_clarification", "unsupported", "cancelled"]),
  mode: z.enum(["nemotron_council", "nemotron_specialist", "partial", "deterministic_only", "no_analysis"]),
  message: z.string().max(10000), next_question: z.string().nullable(), snapshot_id: snapshotId,
  reviews: z.array(reviewSchema).max(8), events: z.array(z.object({sequence: z.number().int().positive(),
    role: councilRoleSchema, action: z.string().max(100), status: z.enum(["completed", "failed", "cancelled"])})).max(30),
  analysis: nemotronResponseSchema.nullable(), chart: councilChartSchema.nullable(),
  handoff_reference: z.string().regex(/^[a-f0-9]{32}:[a-f0-9]{32}$/).nullable(), limitations: z.array(z.string()).max(20),
}).superRefine((result, ctx) => {
  if (result.events.some((e, i) => e.sequence !== i + 1)) ctx.addIssue({code: "custom", message: "Invalid action sequence"});
  if (result.reviews.some(r => r.findings.some(f => f.evidence_ids.some(e => !e.startsWith(result.snapshot_id + ":"))))) ctx.addIssue({code: "custom", message: "Foreign evidence"});
  if (result.chart) {
    const chart = result.chart, analysis = result.analysis;
    if (!analysis || chart.snapshot_id !== result.snapshot_id || analysis.provenance.snapshot_id !== result.snapshot_id ||
      chart.currency !== analysis.provenance.currency || chart.reserve !== analysis.passport.reserve ||
      chart.series.length !== analysis.scenarios.filter(s => s.applicable).length || new Set(chart.series.map(s => s.scenario)).size !== chart.series.length) {
      ctx.addIssue({code: "custom", message: "Chart evidence mismatch"}); return;
    }
    const baseline = analysis.scenarios.find(s => s.name === "baseline")!;
    for (const series of chart.series) {
      const source = analysis.scenarios.find(s => s.name === series.scenario);
      if (!source || !source.applicable || series.points.length !== source.forecast.daily_balances.length || series.points.some((p, i) => {
        const expected = source.forecast.daily_balances[i], base = baseline.forecast.daily_balances[i];
        return !expected || !base || expected.date !== p.date || expected.ending_balance !== p.balance ||
          decimalCents.parse(p.difference_from_baseline) !== decimalCents.parse(p.balance) - decimalCents.parse(base.ending_balance) ||
          decimalCents.parse(p.reserve_headroom) !== decimalCents.parse(p.balance) - decimalCents.parse(chart.reserve);
      })) ctx.addIssue({code: "custom", message: "Chart numbers differ from verified engine evidence"});
    }
    for (const marker of chart.markers) {
      const scenario = analysis.scenarios.find(s => s.name === marker.scenario);
      if (!scenario || (marker.kind === "minimum" && (scenario.forecast.minimum_balance !== marker.balance || scenario.forecast.minimum_balance_date !== marker.date))) ctx.addIssue({code: "custom", message: "Invalid minimum marker"});
    }
  }
  if (result.mode.startsWith("nemotron_") && result.reviews.some(r => r.status !== "complete")) ctx.addIssue({code: "custom", message: "Incomplete council labeled live"});
});
export const conversationSchema = z.object({id, role: councilRoleSchema,
  messages: z.array(z.object({request_key: z.string(), message: z.string().max(2000), result: councilRunSchema})).max(10), busy: z.boolean(), temporary: z.literal(true),
}).superRefine((c, ctx) => {if (c.messages.some(m => m.result.conversation_id !== c.id || m.result.role !== c.role)) ctx.addIssue({code: "custom", message: "Conversation context mismatch"});});
export const councilStatusSchema = z.object({enabled: z.boolean(), model_configured: z.boolean().optional(), roles: z.array(councilRoleSchema).max(4), temporary: z.literal(true), scope: z.string()});
export type CouncilRun = z.infer<typeof councilRunSchema>;
export type CouncilConversation = z.infer<typeof conversationSchema>;
export type CouncilMessage = z.infer<typeof councilMessageSchema>;
