# Welcome to your Lovable project

## Plutus Stage 2/3 — shared customer data

Eight focused pages: Home (/), Current Situation (/dashboard), Monthly Plan (/monthly-plan), Simulator (/simulator), Cash Flow (/cash-flow), Suggestions (/suggestions), Alerts (/alerts) and Talk to Plutus (/talk). In Alex demo mode, synthetic cash starts at $1,800; November income estimate is $3,200, allocations $3,100 and unallocated money $100. Fun has $40 remaining. A $120 concert exceeds its plan by $80 while checking stays positive; approving an $80 allocation increase preserves $600 planned savings and leaves $20 unallocated. Backend-connected mode uses only the configured backend customer's records, with unavailable states for missing data and unconnected capabilities.

- Financial contracts: `src/types/financial.ts`, validated with Zod at adapter ingress.
- Temporary budget reads/drafts/approval: `BudgetPlanAdapter` in `src/services/budgets.ts`; synthetic fixture and state in `src/mocks/`. Plan edits reset on reload.
- Last submitted hypothetical requests stay in React memory across client navigation. Cash Flow recalculates through SimulationAdapter against the current approved plan. Suggestions are labeled example prompts, not live AI.
- Deterministic mock simulation: `src/mocks/syntheticSimulationAdapter.ts` and `assessBudget.ts`. Shared results drive category bars, savings, comparisons, explanations and cash charts.
- `VITE_DATA_MODE` selects the source through `src/services/config.ts`. Backend-connected snapshots, purchase calculations, comparisons, forecasts and optional history use the existing secure FastAPI proxy. Budget and agent endpoints remain unconnected. No silent synthetic fallback after remote errors.
- Arman's future budget proposal enters through `BudgetProposalAdapter` and `budgetProposalSchema`. Proposals are unapproved until the user reviews/edits/confirms; no Nemotron call is implemented.
- December's plan is deliberately unavailable. December comparisons show unknown budget/savings impact; cash forecasts disclose absent December bills and undated earmarks. Goal delay is not estimated without a deadline and confirmed contribution schedule.
- Tests: `bunx vitest run`; accounting uses integer cents and end-of-day date-only aggregation. See `SECURITY_HANDOFF.md` for frontend protections and hosting/backend responsibilities.
- The existing Python engine powers remote Simulator and Cash Flow. No Nemotron, Photon, account linking, sign-in, database, investing functionality, or payment execution is connected in this phase. Demo alerts and generated history remain confined to Alex mode.

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
Alerts do not claim an all-clear; personalized suggestions and chat remain unavailable.
No Nemotron or Photon connection is added. Alex's calculations, approved demo budgets,
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

The browser requests only the five allowlisted financial paths on its own origin. The server
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
