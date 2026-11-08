# Welcome to your Lovable project

## Plutus Stage 2/3 — shared customer data

Eight focused pages: Home (/), Current Situation (/dashboard), Monthly Plan (/monthly-plan), Simulator (/simulator), Cash Flow (/cash-flow), Suggestions (/suggestions), Alerts (/alerts) and Talk to Plutus (/talk). In Alex demo mode, synthetic cash starts at $1,800; November income estimate is $3,200, allocations $3,100 and unallocated money $100. Fun has $40 remaining. A $120 concert exceeds its plan by $80 while checking stays positive; approving an $80 allocation increase preserves $600 planned savings and leaves $20 unallocated. Backend-connected mode uses only the configured backend customer's records, with unavailable states for missing data and unconnected capabilities.

- Financial contracts: `src/types/financial.ts`, validated with Zod at adapter ingress.
- Temporary budget reads/drafts/approval: `BudgetPlanAdapter` in `src/services/budgets.ts`; synthetic fixture and state in `src/mocks/`. Plan edits reset on reload.
- Last submitted hypothetical requests stay in React memory across client navigation. Cash Flow recalculates through SimulationAdapter against the current approved plan. Suggestions are labeled example prompts, not live AI.
- Deterministic mock simulation: `src/mocks/syntheticSimulationAdapter.ts` and `assessBudget.ts`. Shared results drive category bars, savings, comparisons, explanations and cash charts.
- `VITE_DATA_MODE` selects the source through `src/services/config.ts`. Backend-connected snapshots, purchase calculations, comparisons, forecasts, history and the confirmed agent endpoint use the secure FastAPI proxy. Category budget endpoints remain unconnected. No silent synthetic fallback after remote errors.
- Arman's future budget proposal enters through `BudgetProposalAdapter` and `budgetProposalSchema`. Budget proposals remain unconnected; the remote Talk page uses the existing Nemotron purchase-analysis agent instead.
- December's plan is deliberately unavailable. December comparisons show unknown budget/savings impact; cash forecasts disclose absent December bills and undated earmarks. Goal delay is not estimated without a deadline and confirmed contribution schedule.
- Tests: `bunx vitest run`; accounting uses integer cents and end-of-day date-only aggregation. See `SECURITY_HANDOFF.md` for frontend protections and hosting/backend responsibilities.
- The existing Python engine powers remote Simulator and Cash Flow; Talk connects to the existing Nemotron agent through the authenticated proxy. No Photon, account linking, sign-in, database, investing functionality, or payment execution is connected. Demo alerts and generated history remain confined to Alex mode.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Application-wide customer data modes and engine integration

Nessie setup is implemented in the existing backend adapter. See
[`calculation_engine/NESSIE.md`](../calculation_engine/NESSIE.md) for exact Git Bash
commands. Select `AGENT_DATA_SOURCE=nessie`, `FINPILOT_DATA_SOURCE=nessie` and the
server-side Nessie customer/account configuration; keep `VITE_DATA_MODE=remote`.
The shared snapshot now preserves the backend's explicit `source` field, and the
header and page provenance show **Nessie sandbox data** on every financial page.
The account's intraday balance and explicitly dated future bills drive Simulator,
Cash Flow and Talk. History reads the same selected account. Alex's demo and the
$800 backend fixture remain separate explicit modes, never failure fallbacks.
Unknown category budgets, savings allocations and inferred future income remain
unavailable. No raw extraction/seed script is run to start the app.

`VITE_DATA_MODE` selects one customer source for the entire application. It is
`synthetic_demo` by default (Alex's existing $1,800 frontend dataset), or `remote`
(the customer configured in FastAPI, currently the $800 `synthetic_demo` customer).
The old `VITE_SITUATION_DATA_MODE` variable remains an application-wide alias;
conflicting values fail explicitly. This is a startup/build setting, not a browser
customer selector. Restart Vite or rebuild to change modes.

All seven financial pages share the same snapshot adapter and mode-scoped query
cache through `services/financial.ts` and `CustomerFinancialData`. In remote mode,
Current Situation shows the supplied balance and upcoming income; Current Situation,
Cash Flow and Alerts show supplied upcoming transactions with provenance. Missing
category budgets and savings allocations are unavailable. The remote Simulator calls
`POST /api/simulate` then `POST /api/compare` for buy-now, buy-later and skip results.
Cash Flow calls `POST /api/forecast` for 30 daily closing balances, and
`GET /api/history?months=12` when History is selected. History errors do not block
forecasts. The last completed purchase comparison is shared in memory with Cash Flow.
Alerts do not claim an all-clear; personalized budget suggestions remain unavailable.
Talk uses `/api/agent/run` with explicitly confirmed purchase fields; no Photon connection is added. Alex's calculations, approved demo budgets,
history and assistant remain available only in `synthetic_demo` mode.

From `frontend/`, set these in the PowerShell session that starts Vite:

```powershell
$env:VITE_DATA_MODE = 'remote'
# Use the same privately configured token as the running backend:
$env:FINPILOT_API_TOKEN = '<backend service token>'
$env:FINPILOT_BACKEND_URL = 'http://127.0.0.1:8003' # current running FastAPI service
npm run dev -- --port 8080
```

Use `VITE_DATA_MODE=synthetic_demo` (the default) for Alex on every page. Remove any
conflicting legacy `VITE_SITUATION_DATA_MODE` setting. Invalid mode values fail explicitly. Restart Vite after changing its
environment. For production, set the nonsecret mode at build time and supply the
token and backend URL to the server runtime. Use the full TanStack server build;
a static file host cannot serve this proxy. Never put the token in a `VITE_`
variable, browser storage, URLs, or committed files.

The browser requests only the allowlisted financial paths and `/api/agent/run` on its own origin. The server
adds the bearer token, uses fixed upstream paths, permits only bounded `month`/`months`
queries on history, rejects unknown request fields, bounds JSON bodies, forbids
redirects, allows HTTP only on loopback, times out after 12 seconds, and returns
safe errors with no-store caching. JSON is validated at both boundaries. Historical
records remain excluded from `/api/financial-data`; the dedicated history route exposes
only its validated contract. Decimal strings convert exactly to safe integer cents.
Only USD is supported by the current page; other currencies are rejected rather
than mislabeled. Source notes, snapshot basis and individual estimated/confirmed
statuses remain visible. `synthetic_demo` is identified as synthetic; other customer
IDs are labeled configured backend data, without claiming they are live or complete.

The local proxy exposes the backend's configured single customer to callers able
to access the frontend server. Origin checks are not user authentication. Keep the
demo local; a shared deployment must protect the application/proxy with its existing
authenticated access boundary. This change does not add a login system.

Verify at `http://localhost:8080/dashboard`: backend mode should show the current
$800 snapshot for `synthetic_demo`, synthetic/estimated labels, upcoming events and
unavailable budget/savings cards. In browser Network tools, the request should be
same-origin with no service Authorization header. Stop the backend and reload:
an explicit error and Try again button should appear, never Alex's balance.
No backend token or source data is logged or persisted by this integration.

Visit `/monthly-plan`, `/simulator`, `/cash-flow`, `/alerts`, `/suggestions` and
`/talk`: every page must keep the backend customer identity, with honest unavailable
states and no Alex budget or transactions. In Simulator, submit an amount and two
dates, then switch Buy now / Buy later / Skip purchase to inspect Python results.
Cash Flow shows the 30-day backend graph and the last completed comparison. Select
History to load the optional history source. Stop the backend and refresh: it must show a
retryable error, never Alex's data. Restore the backend and choose Try again.

For Alex mode, set `$env:VITE_DATA_MODE = 'synthetic_demo'` and restart Vite. No
FastAPI service is needed. Confirm the $1,800 balance, $600 planned savings, monthly
plan editor, demo comparisons, alerts, suggestions and demo assistant still work.

Checks from `frontend/`: `npm test`, `npx tsc --noEmit`, `npm run build`.
Build a second time with `VITE_DATA_MODE=remote` to check backend-connected bundling.

For authenticated adapter → proxy → FastAPI verification, set the existing service's
`FINPILOT_API_TOKEN` privately in the shell (never a `VITE_` variable), then run:

```powershell
$env:FINPILOT_LIVE_CHECK = '1'
npx vitest run src/test/engine-live.test.ts
```

This opt-in check targets port 8003 and prints only route statuses. It accepts 503
for history because that endpoint requires a separately configured history source.
Without opt-in, the live test is skipped. The normal suite uses synthetic fixtures
produced by the existing Python engine, not real customer records.

Engine limits: simulations/comparisons cover all supplied events; their horizon can
differ from the fixed 30-day forecast. Comparison charts carry forward server-returned
event balances for plotting; the frontend never recalculates those balances. Minimum
markers and summaries use event-level minima, which may be below daily closes.
Intraday snapshots start purchases/forecasts the next day. Response customer, currency,
snapshot date and starting balance are checked; the API provides no snapshot revision
or atomic cross-request snapshot identifier. Re-run after source changes. Category
affordability and savings protection remain unknown even when projected cash is positive.

```powershell
npm test
npx tsc --noEmit
npm run build
```

## Talk to Plutus with the existing Nemotron agent

In remote mode, `/talk` now calls the confirmed `POST /api/agent/run` contract
through the same authenticated proxy and backend origin as Current Situation.
The response is a flat schema-1.0 object, not a `{ data: ... }` envelope. The
Alex demo assistant and its unrelated fixtures are used only in synthetic mode.

The current agent supports purchase analysis, not general conversational intent
extraction. Enter a question, then explicitly confirm purchase amount/date, cash
reserve and a 1–90-day horizon before sending. Text does not override those fields;
prior chat turns are not supplied to the agent. Every request returns baseline,
purchase, three-day delayed income, hypothetical $200 expense and buy-later
scenarios. The UI shows backend figures, applicable stress counts, projected
balances, ordinary reserve-preserving dates, capacity and source assumptions.
Budget affordability remains unknown without category budgets and protected savings.

Recent analyses are kept only in the existing in-memory query cache, scoped to
customer snapshot and opening balance. Navigation preserves completed turns;
leaving during a request cancels it and offers an explicit retry. Clear conversation
removes the visible history; a full refresh clears it too. No browser storage,
conversation backend, Photon delivery or automatic retry is added.

To test locally:

1. Use the existing combined server (`nemotron_agent.main:app`) on port 8003.
   Keep its financial/customer settings unchanged. If replacing an engine-only
   entrypoint, use `AGENT_DATA_SOURCE=engine` with the same existing source settings,
   rather than switching financial datasets. See `nemotron_agent/INTEGRATION.md`.
2. Keep `FINPILOT_API_TOKEN` only in the backend and frontend **server** environment.
   Set `FINPILOT_BACKEND_URL=http://127.0.0.1:8003` and `VITE_DATA_MODE=remote`, then
   start Vite from `frontend/` with `npm run dev -- --port 8080`.
3. For actual model investigation, configure `NVIDIA_API_KEY` and, if needed,
   `NVIDIA_MODEL` on the agent server (`nemotron_agent/.env` is already loaded by
   its entrypoint), then restart that service. Never put these values in Vite
   variables or browser code.
4. Open `/talk`, ask about a purchase, enter its amount/date, and submit. With
   valid model access, the result says “Nemotron investigation”. With a missing key,
   provider failure or rejected model protocol, the backend may still return a
   valid calculation labeled “Deterministic fallback” with its actual reason.
   Turning off the model checkbox explicitly requests deterministic-only analysis.
   HTTP/source/authentication failures stay errors; no mock reply is substituted.
5. With the existing token privately configured, run the authenticated synthetic
   live check from `frontend/`:

```powershell
$env:PLUTUS_AGENT_LIVE_CHECK = '1'
npx vitest run src/test/nemotron-live.test.ts
```

The live check verifies adapter → proxy → agent and reports only statuses and
actual Nemotron/fallback mode. Without opt-in it is skipped; no NVIDIA calls occur
in the ordinary test suite. The agent route has a 60-second proxy deadline for up
to four sequential 12-second provider calls. Other financial routes keep their
12-second deadline. General budgeting/savings chat and free-text purchase extraction
still require future backend capabilities; this integration does not pretend to
provide them.
