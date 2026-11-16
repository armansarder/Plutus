# Milestone 0 — V2 baseline and integration audit

Audit date: 2026-11-15. This is an inventory, not a V2 implementation or deployment.

## Repository and preservation

- Working branch: `feature/plutus-v2`.
- Baseline HEAD: `1f7d8c510cab0cc2fab5800ca5ed51623d3b127f`.
- `origin`: `https://github.com/raiyan11111/Plutus-v2.git`.
- `upstream`: `https://github.com/armansarder/Plutus.git` (read-only reference).
- Fork `main`, feature branch and upstream `main` currently reference that baseline.
  Neither main branch was checked out, edited, reset, merged or pushed.
- Existing deployment work was reviewed and retained. Nothing is staged or committed.
  `git diff --check` passes. The generated `frontend/src/routeTree.gen.ts` is reported
  dirty by Git but has no content diff; it should not be hand-edited or included as
  a deliberate source change.
- Pattern scan of all 16 initial changed/untracked files found no credential
  candidates. No actual `.env`, private-key or SQLite files are tracked. This is
  a bounded scan, not a guarantee that the entire Git history contains no secrets.
- No backend/frontend/Photon env files or inherited external credentials are
  available in this workspace. No provider bodies, secrets or recipient values
  were printed. No banking writes or outbound messages were executed.
- `PLUTUS_V2_Codex_Implementation_Brief.md` was not found in the checkout or the
  accessible temporary-file search. The complete brief pasted in the user request
  supplies the milestone plan; a separate on-disk copy has not been read or invented.

## Runtime and actual contracts

```text
Browser (React / TanStack Router)
  -> Node (TanStack Start / Vite / Nitro node-server)
     -> financialProxy.server.ts / councilProxy.server.ts / notificationsProxy.server.ts
        -> authenticated FastAPI nemotron_agent.main:app
           -> calculation_engine: source, history, cash planning, simulator
           -> Nemotron v1 + optional Council specialist invocations
           -> notifications: scoped SQLite, readiness checks, preview/Photon transport
              -> optional loopback Photon sender (:8790), never needed for preview
```

The browser does not receive the service bearer token. Proxies enforce path/schema
allowlists, bounded bodies and same-origin checks. Council adds signed HttpOnly
browser-session ownership. This is not application login or production operator
authorization. Frontend public-demo banking/alert state is one fictional customer.

Production frontend: `frontend/`, `npm ci --include=dev --no-audit --no-fund`,
`npm run build`, `npm start` (`node .output/server/index.mjs`). Combined backend:
repository root, `pip install -r requirements-production.txt`, then Uvicorn
`nemotron_agent.main:app`. Do not run the calculation-engine app as a second service.
`npm run dev`/`start_local.py` are local launchers, not production supervisors.

Backend money is exact decimal strings; the frontend validates and converts to
integer cents for presentation. Existing wire contracts differ deliberately:

- `/api/simulate`: `purchase_amount`, `purchase_date`; event timeline/minimum,
  starting/ending balances and full supplied-event horizon.
- `/api/compare`: scenarios, with Python support for typed delayed-income and
  unexpected-expense changes; one snapshot, aligned full-event horizon. The current
  frontend validator allows purchase/date alternatives only, at most five.
  Comparison results contain event balances, not daily scenario arrays.
- `/api/forecast`: `start_date`, `end_date`; daily closing balances AND event minimums.
- `/api/agent/run`: `AgentRequest` -> schema-1.0 `AgentResponse`; bounded 1–90 day
  window, reserve, five scenarios (`baseline`, `purchase`, `delayed_income`,
  `unexpected_expense`, `buy_later`), applicability and stress counts, safe dates,
  Passport, provenance and truthful model/fallback mode.
- `/api/v2/council/status`, `/conversations`, conversation messages/read/delete/cancel:
  implemented under `/api/v2`, not the proposed independent retained-run API.
- `/api/notifications/settings`, `/watchlist`, `/watchlist/{id}`, `/history`, `/check`:
  account/customer-scoped preferences, watches, events and explicit evaluation.

## Integration inventory

| Status | Surface / code path | Evidence and limits |
| --- | --- | --- |
| Working locally | `/dashboard`; `CustomerFinancialData`, `services/situation.ts`, `/api/financial-data` | Shared validated snapshot/cache. Remote-customer UI tests pass; actual provider access is not configured. |
| Working locally | `/simulator`; `BackendSimulator.tsx` -> `services/engine.ts` -> `/api/simulate`, `/api/compare` | Editable amount/two dates, buy now/later/skip, engine minima and event chart. Two separate HTTP calculations are compared for consistency; not a frozen snapshot across the whole browser session. |
| Working locally | `/cash-flow`; `BackendCashFlow.tsx`, `/api/forecast` | Backend daily series; distinguishes event minimum from daily closing. Comparison reuse is in-memory. |
| Working locally | Cash planning; `cashPlan.ts`, `/api/cash-plan/preview`, `calculation_engine/planning.py` | Preview-only explicit allocations, no bank writes. Simulator copy says it does not apply the saved plan/category budgets. |
| Working locally / mocked providers | `/talk`; `TalkWorkspace`, `CouncilWorkspace`, `council_api.py`, `council.py`, `council_store.py` | Four chats, bounded calls, typed findings, evidence checks, idempotency, handoff and cancellation covered by fake-provider tests. Histories are bounded memory, lost on restart. NVIDIA not live-verified. |
| Working locally | V1 agent; `service.py`, `adapter.py`, `contracts.py` | Python engine owns arithmetic/verdict. Strict `simulate_scenario` enum/tool policy; missing/invalid provider output uses explicit fallback. No model payment/send tool. |
| Partial, live access unverified | Nessie; `NessieHistorySource` -> `outbound.read_json_https` -> `NessieAdapter` | Actual GET-only HTTPS code, owned selected account, 30-second cache and failure propagation. Fake source integration and transport tests pass; no credentials exist for live reads here. |
| Demo/mock (intentional) | `AGENT_DATA_SOURCE=demo`, `demo_snapshot()` | Backend fixture rolls to current UTC date. `FINPILOT_DATA_SOURCE=mock` alone selects the engine fixture when using engine mode. No runtime automatic Nessie error fallback found. |
| Partial | Data-mode selection; `services/config.ts`, `nemotron_agent/main.py`, `calculation_engine/main.py` | Browser accepts only `remote`; backend independently selects `demo/engine/nessie` and `mock/file/nessie`. Old frontend synthetic adapters remain but ordinary config rejects that mode. No research mode. |
| Partial | Provenance; `AppShell`, `BackendRecords`, agent Passport/provenance, source notes | Nessie/fictional labels and dates exist. Research label absent. Not all derived engine responses carry a shared explicit source/fetched-at/fingerprint contract. |
| Working preview / partial reliability | `/alerts`; `AlertsWorkspace`, `notifications/router.py`, `evaluator.py`, `store.py` | Same-engine readiness, selected-account history, SQLite claims before sending, duplicate suppression and truthful uncertain-submission statuses tested. Not an in-memory alert store, but Render configuration puts SQLite on ephemeral `/tmp`; no durable multi-instance job/attempt queue, retry/backoff, cancel/reconciliation lifecycle. |
| Preview/control only; live unverified | `/operator`; `notifications/operator_demo.py` | Explicit opt-in secret plus service auth locally; production page/proxy/handler blocked. Shadow balances/budget are demo state; local opt-in mutations can write Nessie. Shadow `_watchlist` computes separately from the engine and is not suitable as V2 authoritative evidence. Never enabled in audit. |
| Partial / live unverified | `photon_service/sender.ts` | Spectrum `imessage` provider, fixed enrolled recipient, loopback-only sender. HTTP 202 means submitted, not delivered. No provider receipt callback or provider idempotency/reconciliation path found. This is not evidence of proven live SMS delivery. |
| Broken configuration | `render.yaml`, `DEPLOYMENT.md` Council flags | Production mode plus `PLUTUS_COUNCIL_ENABLED=1` triggers an explicit startup `ValueError` in `council_api.py:install_council`. Reproduced separately. Current production test disables Council and local HTTP smoke uses local backend mode, so neither detects this combination. Do not deploy it as-is. |
| Partial | Health/security deployment preparation | Node production build and public credential-free liveness pass; operator denied. Backend health middleware short-circuits before host/rate/auth checks with no financial payload. API host/auth/HTTPS protections remain. Render Linux/TLS proxy behavior not externally verified. |
| Not present in checkout | Financial Multiverse / Future Lab | No `/future-lab` route/components in current tree. Historical implementation found below. Existing simulator is not the full requested Multiverse. |
| Not present | Shareable fictional scenario snapshots | No opt-in safe snapshot-sharing/export contract; do not publish raw financial/account data. |
| Not present | Controlled research experiment mode | No versioned persona/treatment/randomization/consent-event/export implementation found. No participant recruitment/data collection performed. |

### Nessie request and failure trace

`BackendSituationAdapter` -> same-origin `/api/financial-data` -> Node financial
proxy (server bearer) -> engine `get_data()` -> `NessieAdapter.load()` -> shared
`NessieHistorySource.load_raw()` -> allowlisted HTTPS GETs for owned accounts,
selected-account transactions and merchants. Normalized current balance is intraday
UTC. Future explicitly dated bills/deposits are estimated; past/same-day history is
not applied to that balance again. Failed/expired reads raise a sanitized 503.

`/api/simulate`, `/compare`, `/forecast`, `/agent/run`, cash-plan preview, Council
analysis and notification checks use the authorized financial dependency. History
uses the same selected raw source. The default backend without source configuration
uses demo data, so a successful server start is not proof of Nessie selection.
The UI's `remote` flag means backend-connected, not necessarily Nessie-backed.

Current integration tests replace `read_json_https` with wire fixtures; one test
also exercises `httpx.MockTransport`. They are not a fake HTTP server end to end
through Node. Milestone 1 must close that gap and prove a changed sandbox fixture
propagates across relevant routes without substitution. Live-provider checks remain
opt-in and were skipped because credentials are absent.

## Older Multiverse and Photon evidence

Read remote heads, then fetched only these historical reference branches, without
checkout/merge/rebase/cherry-pick. Only this clone's reference/object inventory changed.

| Reference | SHA | Findings |
| --- | --- | --- |
| `upstream/raiyan/frontend-final` | `483532687bb2b3002bb0264cfafd35029a0cf7c4` | Raiyan's original Financial Multiverse commit. Adds Future Lab, chart, comparison service, explanation work and tests. |
| `upstream/integration/arman-raiyan-final` | `97a08daec9e9d34567207a15d0182fb09fb0af29` | Later isolated Multiverse integration on the live-Council frontend. Best selective source; does not require wholesale frontend replacement. |
| `upstream/photon-alerts` | `f945c63d69e270e6b46124bb2336877d78848cd3` | Earlier dedicated operator UI and notification/sender prototype. Different preference/state routes, synthetic mutations and no receipt callback. Not a drop-in authoritative service. |

`raiyan/nemotron-chat` is not an advertised branch on either remote. No other
Plutus clone was found in the available Projects directory; this is the sole worktree.
Historical code was inspected, not executed or counted in current passing tests.

Reusable paths from `97a08da`:

- `frontend/src/components/future-lab/FutureLab.tsx` and `FutureLabChart.tsx`:
  existing design tokens, debounced edits, request abortion/generation guards,
  shared chart scale, reserve/zero lines, event minima, accessible date inspection.
- `frontend/src/services/futureLab.ts`: one atomic `/api/compare` request for
  buy now/later/skip; chart selects/carries forward returned balances only.
- Associated `future-lab*.test*` and engine-generated test fixtures: race handling,
  validation, same-day minima, source identity, error/retry and no mock substitution.
- `futureLabCouncil.ts` is explicitly an unavailable adapter; its disabled send
  button must not be presented as completed Council integration.

Limitations: standalone `/future-lab` navigation rather than the requested Simulator
integration; ordinary three-way comparison only; reserve breach computed from returned
events in the frontend; no explicit stress UI; no sharing; full-event rather than
bounded daily scenario comparison. Extend/reuse backend contracts before exposing
new numerical claims. Wholesale branch import would remove newer Alerts/operator
files and modify Council/proxy code: do not merge/replace the frontend.

## Fresh baseline verification

| Check | Result |
| --- | --- |
| `.venv/Scripts/python.exe -m pytest tests -q` | 92 passed, 1 skipped. Skip is opt-in live Nessie; Starlette/httpx deprecation warning. |
| `npm test --prefix frontend` | 157 passed, 2 skipped, 25 passing files. Skips are opt-in engine/Nemotron running-service checks. |
| `npm exec --prefix frontend -- tsc --noEmit -p frontend/tsconfig.json` | Passed, exit 0. |
| `npm run build` in `frontend/` | Passed; Nitro Node server generated. Existing tsconfig-plugin and bundle-size warnings. |
| Built Node + authenticated synthetic local-mode backend HTTP smoke | Passed: six pages, built asset, health, financial proxy, forecast, five scenarios, alert settings, Council status and blocked public operator. Processes stopped afterward. This does not prove production backend startup or live sandbox access. |
| Production backend with Council enabled | Failed as designed by existing auth guard; reproduced and recorded as a configuration blocker, not hidden by the passing checks. |
| `.venv/Scripts/python.exe -m pip check` | Passed: no broken requirements. |
| `git diff --check` | Passed, generated-route line-ending warning only. |
| Photon install / TypeScript | Locked dependencies installed with lifecycle scripts disabled; `npm run check` in `photon_service/` passed. Initial sandbox network denial was retried with approved network access. No sender started. |

## Proposed checkpoint (approval required)

Suggested local commit: `chore: checkpoint deployment preparation and V2 baseline audit`.
This is a preservation checkpoint with a documented production blocker, not a release.
This audit adds this report and an explicit deployment-blocked notice to
`DEPLOYMENT.md`/`render.yaml`; it makes no application-code changes. Existing
deployment-preparation application changes are retained for the checkpoint.

Files proposed for staging (none staged yet):

```text
README.md
DEPLOYMENT.md
render.yaml
requirements-production.txt
calculation_engine/security.py
nemotron_agent/main.py
frontend/package.json
frontend/vite.config.ts
frontend/src/components/app/AppShell.tsx
frontend/src/notificationsProxy.server.ts
frontend/src/routes/operator.tsx
frontend/src/server.ts
frontend/src/test/customer-remote.test.tsx
frontend/src/test/production-deployment.test.ts
scripts/production_smoke.py
tests/test_production_deployment.py
docs/MILESTONE_0_AUDIT.md
```

Exclude actual env files, SQLite/private data, dependencies/build products, temporary
test files and the generated route file with no content diff. Inspect the actual
staged diff and report staged paths before any approved commit. No push is proposed.

Next: approve the local checkpoint, then start Milestone 1's source/provenance and
HTTP-integration work. Keep public deployment blocked. During hardening resolve the
Council production-auth gate through a reviewed authorization design; never remove
the guard simply to make Render start. The later durable alert/operator/research
milestones remain unimplemented by this audit.
