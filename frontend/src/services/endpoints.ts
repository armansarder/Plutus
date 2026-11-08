/**
 * Single source of truth for backend endpoint paths.
 * The /api/* routes are PROPOSED internal endpoints (Stage 2/3 brief) — teammates may not
 * have implemented them yet. Adjust paths here only. Existing /api/v1/* paths are the
 * Stage 1 contracts.
 */
export const ENDPOINTS = {
  // Confirmed combined FastAPI agent route (schema 1.0).
  agentRun: "/api/agent/run",
  // Stage 1 contracts
  snapshot: "/api/v1/financial/snapshot",
  compareScenarios: "/api/v1/simulations/compare",
  budgets: "/api/v1/budgets",
  budgetCurrent: "/api/v1/budgets/current",
  budgetPropose: "/api/v1/budgets/propose",
  // Proposed Stage 2/3 routes
  financialSummary: "/api/financial/summary",
  financialHistory: "/api/financial/history",
  financialForecast: "/api/financial/forecast",
  alerts: "/api/alerts",
  simulate: "/api/simulate",
  agentMessage: "/api/agent/message",
  agentRecommendations: "/api/agent/recommendations",
  messagingStatus: "/api/messaging/status",
} as const;
