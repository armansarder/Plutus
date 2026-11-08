# Plutus — Security & Integration Handoff

The frontend alone cannot secure a real financial app. This lists what the frontend does in the browser and what the backend **must** add.

## Stage 2/3 additions
- Alerts are derived locally from the plan, snapshot and baseline simulation (`src/lib/alerts.ts`) — no random or fabricated warnings.
- The Talk to Plutus demo assistant computes every number through the same simulation engine as the Simulator; it never invents tool results, and stress-test cards report tested outcomes ("N of 4 scenarios"), never probabilities.
- Chat input is capped at 500 characters; all agent text renders through React escaping. Voice input uses the browser's speech recognition only when present, requires a user gesture, and never auto-submits — the user reviews the transcript first.
- The Photon section shows real status when a backend provides it and otherwise honestly reports "Messaging demo — not connected." No fake phone numbers or channels.
- Proposed backend paths live in `src/services/endpoints.ts`; these prototype HTTP adapters remain unselected. Remote mode uses `services/engine.ts` and the secure proxy allowlist: `/api/financial-data`, `/api/simulate`, `/api/compare`, `/api/forecast`, `/api/history`. Unconnected category budgets, savings, agent and messaging capabilities remain unavailable. No Alex fallback.

## At rest
**Frontend (done):** demo or backend records stay in memory only; no financial data in localStorage/sessionStorage/IndexedDB/URLs; state lives in React memory and resets on reload; no persistent query cache; no secrets or API keys in source; no analytics scripts. One application-wide mode and mode-scoped snapshot cache prevent cross-customer substitution.
**Backend (to do):** encrypt databases and backups, per-user authorization / row-level policies, secret management and rotation, retention and deletion policy.

## In transit
**Frontend (done):** same-origin relative API paths by default (`src/services/config.ts`); remote base URLs must be HTTPS in production (`resolveBaseUrl`); `fetch` with `cache: "no-store"`, abort signals and Zod-validated responses; nothing sensitive in query strings; no direct browser calls to Nessie, Nemotron or Photon.
**Hosting/backend (to do):** TLS + HSTS, strict CORS allow-list, secure HttpOnly session cookies, CSRF protection, server-side rate limiting. Provider keys stay server-side.

## In use
**Frontend (done):** all text rendered through React escaping, no `dangerouslySetInnerHTML`/`eval`; UI validation of amounts, category IDs and dates; scenarios are immutable hypothetical overlays — no financial transactions, transfers or payments; budget revisions require explicit confirmation and remain in memory only; error messages never echo payloads; reduced-motion and keyboard support; no invented confidence scores.
**Backend (to do):** re-validate every input, identify the user from the session (never from a client-supplied customer ID), authoritative simulation math.

## Swapping in the real backend
- Contracts + Zod schemas: `src/types/financial.ts`.
- Demo adapters: `src/mocks/syntheticSimulationAdapter.ts` (fixture in `src/mocks/demoFinancialSnapshot.ts`).
- HTTP adapters (ready, unused): `src/services/financial.ts` → `GET /api/v1/financial/snapshot`, `src/services/simulation.ts` → `POST /api/v1/simulations/compare`.
- Set `VITE_DATA_MODE=remote` at startup/build time (`VITE_SITUATION_DATA_MODE` remains a global compatibility alias). All pages use the configured backend customer's snapshot; missing records are unavailable. There is no silent fallback to demo data on error. The existing proxy still requires its server-only token and preserves validation, fixed upstream path, same-origin checks and no-store behavior. See README for deployment access-boundary requirements.
- Engine proxy additions enforce method/path allowlists, strict purchase/forecast/comparison schemas, 16 KiB JSON bodies, same-origin access and only validated history query parameters. Upstream credentials remain server-side. Browser credentials and provider errors are never forwarded to the UI. No model, arbitrary URL, payment or messaging proxy is exposed. Backend duplicate-key validation is preserved by forwarding the validated original JSON. Engine results stay separate from the budget-aware demo contract; missing budgets and protected savings are not fabricated.
- Budget adapters: `src/services/budgets.ts` → `GET /api/v1/budgets?month=YYYY-MM`, `PUT /api/v1/budgets/current`. The remote service must require authentication for user-approved edits. Stage 1 never calls these endpoints.
- Future Arman proposal boundary: `BudgetProposalAdapter.proposeBudget` and `budgetProposalSchema` → `POST /api/v1/budgets/propose`. Proposal allocations require user approval; no live agent/model call is implemented or triggered by the current UI.
- Monthly budget fit, savings funding feasibility and cash liquidity are separate findings returned together. Spent is historical; committed categories are not duplicated as cash debits; allocations do not move cash. Undated earmarks and unavailable December bills are disclosed forecast limitations.
- Calculation rules the backend should match: integer cents; horizon = start + 29 days inclusive; all same-day events summed before end-of-day balance (intraday overdrafts not detected); ties for lowest balance resolve to the earliest date.
