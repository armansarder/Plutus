# Plutus frontend and Photon integration — schema 1.0

## Start the combined agent/API server

From the repository root, activate `.venv`. Your NVIDIA key remains in
`nemotron_agent/.env`; the service loads it automatically. Existing environment
variables take precedence. This server includes all existing engine/history routes
plus `POST /api/agent/run`, so the frontend can use a single backend origin.
Do not start it on a port already occupied by the old engine server.

Synthetic demo, with a fresh local service token:

```sh
source .venv/bin/activate
export AGENT_DATA_SOURCE=demo
export FINPILOT_CUSTOMER_ID=synthetic_demo
export FINPILOT_API_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export FINPILOT_CORS_ORIGINS=http://localhost:5173
python -m uvicorn nemotron_agent.main:app --host 127.0.0.1 --port 8000
```

The token stays in this shell; use the same configured token in your trusted
application server/proxy. The agent service does not create browser sessions.
This is one configured customer per service, not multi-user authentication.
For the shared demo, coordinate the service token privately with the backend owner.
Never expose NVIDIA or Nessie keys, or put the service token in committed frontend
code, Vite public variables, URLs, or localStorage. For deployment use an authenticated
application proxy and the existing production security settings with TLS.

Live integrated data: use `AGENT_DATA_SOURCE=engine` and the *same* existing engine
settings that Azzam verified (`FINPILOT_DATA_SOURCE=nessie`, customer/account IDs,
Nessie key/base URL, and `FINPILOT_UPCOMING_FILE`). If those are in the root `.env`,
start with `python -m uvicorn nemotron_agent.main:app --env-file .env --port 8000`.
The upcoming schedule must match the current UTC snapshot date. Refresh extraction
and transformation through Azzam's existing workflow; the agent does not seed or
write Nessie data. Missing or stale source data returns 503, never fake live data.
`AGENT_DATA_SOURCE` defaults to `demo` deliberately; always inspect provenance.

## Request

```json
{
  "purchase_amount": "400.00",
  "reserve": "200.00",
  "horizon_days": 30,
  "allow_model": true,
  "channel": "web"
}
```

Use `Authorization: Bearer <service token>` and `Content-Type: application/json`.
Optional `purchase_date` is YYYY-MM-DD. Omit it to use the earliest supported date:
today for opening snapshots, tomorrow for intraday snapshots. Explicit unsupported
dates return 422; the service never silently moves a selected date. The horizon
includes the start date and at most 90 days. Amounts use decimal strings and the
snapshot currency. No customer ID or source URL is accepted from clients.

`message` is accepted for future conversation UI compatibility, but free-text
intent extraction is not implemented. The structured purchase fields drive the
analysis. Neither user message nor merchant descriptions/source notes are sent to
the model. Only the decision amount, dates, reserve, currency, and reduced numeric
simulation summaries are shared. `allow_model=false` runs an explicit deterministic
fallback without contacting NVIDIA. `channel` records the caller's intended UI
contract; it does not trigger delivery.

## Response and UI mapping

See `frontend.ts`, `/docs`, and `response.schema.json` for exact types. The agent
response is the JSON object itself (unlike engine routes wrapped in `data`).
`example-response.json` is a generated synthetic fallback response for UI development.

| UI | Response field |
| --- | --- |
| Answer card | `summary`, `risk_level` |
| Comparison chart | `scenarios[].forecast.daily_balances` |
| Shortfall marker | `minimum_balance`, `minimum_balance_date`, `negative_balance_days` |
| Safe dates | `safe_purchase_dates` (baseline purchase conditions only) |
| Available spending | `safe_to_spend_on_purchase_date` |
| Stress badge | `stress_tests_passed` / `stress_tests_total` |
| Decision Passport | `passport`, `provenance`, referenced `scenarios` |
| Trust Shield | `trust_shield`, `tool_trace` |
| Future You draft | `photon.text` |

Render strings as plain React text, never HTML. Convert decimal strings with
`Number()` only for plotting, not financial calculations. Display negative values.
Keep both the synthetic label and fallback label visible. Distinguish transaction
minimums (expenses before same-day income) from daily ending balances. A positive
end-of-day chart can hide a temporary shortfall; show minimum-balance markers.
Do not log or publicly share responses. Passports are returned, not persisted or
published; printable/downloadable cards are frontend work.

All five scenarios use the same immutable snapshot and horizon. Baseline/purchase
are guaranteed; Nemotron chooses additional investigations from an enum allowlist.
The server fills missing tests if the model fails, with explicit fallback mode.
Delayed income shifts the next scheduled income three days; if none exists it is
marked `applicable=false` and excluded from stress counts. Unexpected expense adds
200.00 in the snapshot currency. Buy-later uses the day after next income, capped
at horizon end (or horizon end if no income). These are explicit assumptions,
not exhaustive risk estimates. Safe dates are tested from the selected purchase
date through horizon end; baseline reserve breaches make all dates unsafe.

Model recommendations are schema constrained and checked against the deterministic
verdict. Displayed narrative is a server template grounded in computed results;
raw reasoning and unconstrained model prose are never returned. No financial
probability is generated. Every analysis has a snapshot fingerprint and timestamp.

## Photon handoff

Awsaf calls the same endpoint from his authenticated backend, using `channel=photon`.
He receives a short draft without balances, account IDs, or merchant details.
This service never sends messages, processes Photon webhooks, or generates public
passport links. Awsaf owns verified webhook authentication, conversation/customer
binding, opt-in and provider delivery. Add a link only after an authenticated
application route exists. Voice and scheduled reminders are deferred.

## Failure behavior

- 401/403: invalid service token or configured customer mismatch.
- 422: request/date/schema issue. Ask the user to correct inputs.
- 429/503: backend limits or source unavailable. Retry explicitly later.
- 200 with `mode=deterministic_fallback`: valid engine results; Nemotron is disabled,
  unavailable, or failed the tool/output contract. Show this clearly.

At most three model investigation rounds plus one decision call, 12-second network
timeouts per call, five enum tool calls per round, no automatic retries. Allow a
loading state and cancellation; do not retry automatically on every React render.
No payment, transaction write, arbitrary URL, shell, or messaging tool exists.
Financial snapshots are not persisted by the agent. At-rest encryption is not
claimed; deployment/database controls remain the team's responsibility.

## Verification

```sh
python -m pytest tests -q
python -m nemotron_agent.check connectivity
python -m nemotron_agent.check tool
```

The tests cover authentication, CORS, request validation, model tool/decision flow,
prompt-injection exclusion, unauthorized tools, malformed output, failure fallback,
snapshot immutability, intraday dates, absent income, and safe-date forecasts.
