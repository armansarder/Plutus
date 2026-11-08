# Financial Multiverse / Future Lab

Open `/future-lab` or choose **Future Lab** in the application navigation. This is
a standalone frontend feature; existing Simulator, Cash Flow, Talk and backend
contracts are unchanged.

## Local setup

Use the existing authenticated FastAPI/Nessie service and its selected customer.
The same privately configured `FINPILOT_API_TOKEN` must be available to the frontend
server. Never set it as a `VITE_` variable. From Git Bash:

```bash
cd /c/Users/there/PlutusFake-integration/frontend
unset VITE_SITUATION_DATA_MODE
VITE_DATA_MODE=remote FINPILOT_BACKEND_URL=http://127.0.0.1:8003 npm run dev -- --port 8080
```

Open `http://localhost:8080/future-lab`. Change the amount, purchase date,
comparison date and minimum reserve. Valid edits debounce for 350 ms, then all
three scenarios are recomputed. Old results disappear immediately; pending
requests are aborted and late responses ignored. Invalid inputs do not trigger
network requests. Failures have explicit retry without demo/stale substitution.

## Evidence and limits

- `services/futureLab.ts` reuses `engineAdapter.compare`, the existing same-origin
  proxy, response validation and customer/snapshot guards. A single `/api/compare`
  call keeps the alternatives on one backend snapshot and common horizon.
- Buy now and buy later apply the same amount on the two explicit dates; skip uses
  a zero purchase. No future paycheck, bill, goal or budget is inferred.
- The engine compares all supplied events. It cannot trim comparisons to a custom
  horizon. Purchase date controls are limited to the next 90 supported dates.
- The comparison endpoint returns event balances, not daily scenario forecasts.
  The stepped graph carries forward those returned values for display only. It
  never adds events, subtracts purchase amounts or forecasts new financial balances.
  `/api/forecast` accepts no hypothetical purchase; `/api/simulate` would read a
  separate snapshot and is not needed for this atomic three-way comparison.
- Scrubbing/selecting event dates shows the returned closing balance and each
  supplied event's post-event balance. Same-day negative minima remain visible
  even when a closing balance is positive. Reserve breaches compare the selected
  threshold with the engine's returned balances.
- Reserve preservation is not budget affordability; category budgets, protected
  savings and schedule completeness may remain unknown. Nessie sandbox/source
  labels and assumptions stay visible.
- Future Lab is explicitly unavailable in Alex synthetic-demo mode, since this
  feature requires the Python engine. It never substitutes mock trajectories.

## Council boundary

`services/futureLabCouncil.ts` defines a local typed handoff request containing
the selected future, confirmed fields and backend evidence. It is **not** a
published Council API contract. No contract or route was found at implementation
time, so the send button is disabled with an explanation. The adapter returns
`{ status: "unavailable", sent: false }` without any HTTP request. Council owners
can replace that adapter after agreeing their contract; no Council agent,
orchestration, conversation or Photon code is changed here.

## Verification

```bash
npm test
npx tsc --noEmit
VITE_DATA_MODE=remote npm run build
```

Tests cover routing, three-way requests, source identity, exact returned balances,
date scrubbing, reserve breaches, debouncing, invalid inputs, response races,
retry, synthetic-mode gating, chart data and the unavailable Council handoff.
Fixtures are calculated by the existing Python engine and are test-only.

If the existing service token and a Nessie-backed server are configured:

```bash
PLUTUS_FUTURE_LAB_LIVE_CHECK=1 npx vitest run src/test/future-lab-live.test.ts
```

The opt-in test exercises the frontend adapter, authenticated proxy and running
comparison API with a small hypothetical purchase. It requires an actual
`nessie_sandbox` snapshot and prints only route statuses. Without opt-in, it is
skipped. No model calls, bank writes, Council requests or messages are made.
