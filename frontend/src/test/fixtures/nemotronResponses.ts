import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nemotronResponseSchema } from "@/types/nemotron";

// The repository's existing synthetic fallback response, not a fabricated runtime reply.
export const agentFallback = nemotronResponseSchema.parse(JSON.parse(readFileSync(resolve(process.cwd(), "../nemotron_agent/example-response.json"), "utf8")));
// Explicit test double for successful model-mode presentation; never selected by application code.
export const agentNemotron = nemotronResponseSchema.parse({ ...agentFallback, mode: "nemotron", fallback_reason: null, model: "synthetic-test-provider", trust_shield: { ...agentFallback.trust_shield, model_data_shared: true }, tool_trace: [...agentFallback.tool_trace.filter(t => t.tool !== "decision"), { tool: "decision", scenario: null, status: "completed", initiated_by: "nemotron" }] });
