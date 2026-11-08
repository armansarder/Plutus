# Nessie-backed Plutus (read only)

Nessie is Capital One's banking **sandbox**, not a real bank connection. All
financial routes and the existing Nemotron agent share one server-selected
customer and cash account. No Nessie write methods or seed scripts run.

References reviewed: [published docs](https://nessieisreal.com/docs),
[official account SDK](https://github.com/nessieisreal/nessie-javascript-sdk/blob/master/lib/account.js),
[deposit SDK](https://github.com/nessieisreal/nessie-javascript-sdk/blob/master/lib/deposit.js),
[purchase SDK](https://github.com/nessieisreal/nessie-javascript-sdk/blob/master/lib/purchase.js),
and [bill SDK](https://github.com/nessieisreal/nessie-javascript-sdk/blob/master/lib/bills.js).
Use `https://prod-api.nessieisreal.com`, not older SDK HTTP defaults.

## Reused architecture and selection

`NessieHistorySource` reuses Azzam's extraction shape and the existing history
normalizer. It GETs `/customers/{customer_id}/accounts`, then the selected account's
purchases, deposits, withdrawals, transfers and bills, plus merchant metadata.
The same source object feeds `NessieAdapter` and `/api/history`. Explicit ownership
and account-reference checks reject foreign records. Credit-card balances are not
treated as cash. With no account ID configured, exactly one Checking account is
preferred; otherwise exactly one cash account is required. Ambiguity fails closed.

The cache lasts 30 seconds, does not cross UTC date boundaries, and never returns
expired data after a source failure. Collection 404 responses mean empty lists;
account discovery, authentication and other failures are errors, not demo fallback.

The combined server supports `AGENT_DATA_SOURCE=nessie`, or the existing
`AGENT_DATA_SOURCE=engine` plus `FINPILOT_DATA_SOURCE=nessie`. Setting only the latter
also selects Nessie when no agent mode is explicit. Demo/Nessie conflicts fail.
Financial calculations and Nemotron orchestration are unchanged.

`/api/financial-data` now returns a top-level `source` alongside `data`, reflected
in FastAPI's OpenAPI schema. The secure proxy preserves it while stripping
snapshot history. Shared frontend state and badges identify `nessie_sandbox` as
**Nessie sandbox data**. Older backends without metadata remain labeled configured
data, rather than being assumed to be Nessie.

## Financial semantics and limitations

- Use the selected account's current balance as an intraday UTC snapshot. Never
  replay history onto it. Purchases/forecasts start strictly after the snapshot day.
- History is scoped to that same account. Only completed/executed records count
  toward spending/income. Pending records are not counted; future dates are excluded.
  Transfers keep the existing pipeline semantics and are excluded from those totals.
- Only explicit future `upcoming_payment_date` values on pending/recurring bills
  are projected. A pending one-time bill may instead supply a future `payment_date`.
  Dates are marked estimated. Completed/cancelled, same-day and stale bills are
  excluded. No stale date is rolled forward; no later recurrence is extrapolated.
- No paycheck, subscription, budget or protected savings allocation is inferred.
  `FINPILOT_UPCOMING_FILE` is rejected in Nessie mode because the current pipeline
  output contains inferred paychecks and rolled-forward bill dates. Existing raw
  and clean pipeline files are preserved and never substituted after a live failure.
- With no eligible future dates, upcoming events are empty. A flat forecast does
  not establish affordability. Schedule completeness and unscheduled spending are
  unknown. Category budget affordability and savings protection remain unknown.
- Currency is configured (`FINPILOT_CURRENCY=USD`); Nessie balances do not establish
  it. The current frontend supports USD only.

## Exact Git Bash startup (Windows worktree)

Use an available backend port; replace the old dev server manually if it already
occupies 8003. Start both processes in the same shell so the frontend server inherits
the service token without printing or saving it. The ignored `.venv` was prepared
for the backend tests.

```bash
cd /c/Users/there/PlutusFake-integration
./.venv/Scripts/python.exe -m pip install -r nemotron_agent/requirements.txt

read -rsp 'Nessie API key: ' NESSIE_API_KEY; printf '\n'
export NESSIE_API_KEY
read -rp 'Nessie customer ID: ' FINPILOT_CUSTOMER_ID
read -rp 'Account ID (blank for unambiguous Checking selection): ' NESSIE_ACCOUNT_ID
export FINPILOT_CUSTOMER_ID NESSIE_ACCOUNT_ID
export NESSIE_BASE_URL=https://prod-api.nessieisreal.com
export AGENT_DATA_SOURCE=nessie FINPILOT_DATA_SOURCE=nessie
export FINPILOT_MODE=local FINPILOT_CURRENCY=USD
export FINPILOT_ALLOWED_HOSTS=localhost,127.0.0.1
export FINPILOT_CORS_ORIGINS=http://localhost:8080
unset FINPILOT_UPCOMING_FILE
export FINPILOT_API_TOKEN="$(./.venv/Scripts/python.exe -c 'import secrets; print(secrets.token_urlsafe(48))')"

./.venv/Scripts/python.exe -m uvicorn nemotron_agent.main:app --host 127.0.0.1 --port 8003 &

export VITE_DATA_MODE=remote
unset VITE_SITUATION_DATA_MODE
export FINPILOT_BACKEND_URL=http://127.0.0.1:8003
cd frontend
npm run dev -- --port 8080
```

Open `http://localhost:8080/dashboard`, then Simulator, Cash Flow, Alerts,
Suggestions and Talk. They retain the same Nessie customer and source badge.
Monthly Plan remains unavailable. Talk keeps its confirmed purchase fields and
backend-supported stress scenarios. Actual Nemotron investigation additionally
requires the existing server-only `NVIDIA_API_KEY` configuration; missing model
access is labeled deterministic fallback, never a financial-source fallback.

Never put Nessie/NVIDIA/service keys in `VITE_` variables, browser storage, source
files, command literals or Git. Nessie uses a server-side key query parameter;
outbound URL logging remains suppressed and errors are sanitized. Shared deployment
still needs the existing authenticated application access boundary; same-origin
checks alone are not user authentication.

## Verification

```bash
cd /c/Users/there/PlutusFake-integration
./.venv/Scripts/python.exe -m pytest tests -q
cd frontend
npm test
npx tsc --noEmit
VITE_DATA_MODE=remote npm run build
```

Normal tests use synthetic Nessie wire fixtures, not customer records or remote
NVIDIA calls. With real keys configured, opt into authenticated read-only checks:

```bash
cd /c/Users/there/PlutusFake-integration
PLUTUS_NESSIE_LIVE_CHECK=1 ./.venv/Scripts/python.exe -m pytest tests/test_nessie_live.py -q -s
```

This runs the combined FastAPI app in-process with its bearer-token boundary and
the real Nessie GET adapter. It verifies `/api/financial-data`, `/api/simulate`,
`/api/compare`, `/api/forecast`, `/api/history` and `/api/agent/run` against the selected
customer. The agent request uses `allow_model=false` to check source wiring without
sending records to an external model. Only route statuses are printed. Missing
credentials skip the check; a Nessie error fails it. No live success is claimed
without running this check.
