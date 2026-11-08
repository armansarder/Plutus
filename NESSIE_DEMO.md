# Nessie customer demonstration

This adds a local sandbox customer selector, not a production bank login. Anyone
who can access this local demo can select any explicitly approved sandbox profile.
It never discovers customers from a browser request, uses enterprise endpoints,
seeds records, creates transactions, or sends external messages. Use one worker.
Existing financial and council API contracts remain unchanged.

## Backend setup

From the repository root, activate `.venv` (`source .venv/bin/activate`). Keep the
existing `NVIDIA_API_KEY`, `NVIDIA_MODEL` and `FINPILOT_API_TOKEN`. The same service
token must be configured on the frontend server. Do not share keys in chat.

Add these settings to `nemotron_agent/.env`:

```dotenv
AGENT_DATA_SOURCE=nessie
FINPILOT_DATA_SOURCE=nessie
FINPILOT_MODE=local
NESSIE_BASE_URL=https://prod-api.nessieisreal.com
NESSIE_API_KEY=PASTE_YOUR_NESSIE_KEY_LOCALLY
PLUTUS_COUNCIL_ENABLED=1
PLUTUS_DEMO_PROFILES_FILE=nemotron_agent/demo-profiles.json
```

Keep an existing FINPILOT_CUSTOMER_ID configured if present; the gateway binds each
profile to its own customer instead. Unset FINPILOT_UPCOMING_FILE. Do not set both
profile JSON environment variables.

Read available customer/account candidates without modifying Nessie:

```sh
python -m nemotron_agent.discover_profiles > /tmp/plutus-profile-candidates.json
```

Review that JSON before copying it to `nemotron_agent/demo-profiles.json`. The
helper inspects at most 12 customers and skips ambiguous/missing cash-account
selections. If a customer is skipped, use `demo-profiles.example.json` and explicitly
specify their owned Checking/Savings account. Keep only profiles you want judges to
access. Labels should be fictional aliases, not real personal information. For a
second account of one customer, add a separately labeled profile with its account
ID. Other owned balances are displayed but never combined into spending capacity.

```sh
python -m uvicorn nemotron_agent.main:app --host 127.0.0.1 --port 8003 --workers 1
```

## Frontend setup

In `frontend/.env.local`, retain the existing matching server-only
FINPILOT_API_TOKEN, then set:

```dotenv
FINPILOT_BACKEND_URL=http://127.0.0.1:8003
PLUTUS_DEMO_CUSTOMERS=1
VITE_DATA_MODE=remote
VITE_SITUATION_DATA_MODE=remote
VITE_COUNCIL_ENABLED=true
```

Restart the frontend from `frontend/` using `npm run dev -- --host 127.0.0.1 --port 8080`.
Open http://127.0.0.1:8080/dashboard. Never put Nessie/NVIDIA/service credentials in
VITE variables. No additional hosted model deployment is required.

## Judge walkthrough

1. Select Customer 1. Inspect their account, month-to-date income/spending, merchant
   and category breakdowns. Click a category or merchant to inspect its records.
2. Review upcoming dated bills. Open loan coverage: loan type/status availability
   is shown, not unsupported principal/interest/payment calculations. Open Cash Flow
   for the full transaction history and existing projections.
3. If future income is missing, expand the confirmation form. Enter its amount/date
   and save. The UI replaces the previous manual event and reloads all decisions.
   It is a user-confirmed estimate, not a Nessie deposit. Do not duplicate a bill.
4. Ask the Council to compare a purchase with your reserve. All specialists use the
   selected customer's frozen snapshot, including the manually confirmed event.
   Inspect engine results, minimums, safe-to-spend, Passport, provenance and fallback
   status. With no confirmed future income, delayed-income tests are inapplicable.
5. Switch Customer 2 and repeat exactly the same purchase. Account data, events,
   evidence and outcomes derive from Customer 2. Different records need not always
   produce a different recommendation; the app never fabricates a difference.
6. End the demo session. Previously issued profile credentials are revoked and
   financial views are hidden. Another tab detects switches on focus. Sessions and
   manual events expire after 30 minutes or backend restart.

## Interfaces and limits

- GET/POST/DELETE `/api/demo/session`: approved aliases, select, end session.
- PUT `/api/demo/schedule`: `{ "events": [...] }` using the existing Transaction
  contract, max 50, unique IDs, dates tomorrow through 90 days. Server normalizes
  descriptions and marks events estimated. Empty list clears manual events.
- GET `/api/nessie/insights`: Pydantic/OpenAPI contract in insights.py and matching
  Zod contract in frontend/src/types/nessie.ts. Exact decimal monetary strings.
- Frontend forwards only the HttpOnly session cookie as the profile credential;
  arbitrary browser identity headers are ignored. Credentials are never in JSON.
- Top ten category/payee totals and up to 200 spending drill-down records. Account
  overview shows up to 12 owned accounts; projections use exactly one cash account.
- Nessie facts may be cached for 30 seconds. Histories are never replayed onto the
  current balance. Future income is never inferred automatically from old deposits.
- Optional loan lookup failure is shown as unavailable. Required snapshot/history
  failures never silently switch to demo data. No debt-interest, investment,
  retirement, statistical forecasting, ATM locator or bank transaction execution.
- Existing Passport and Photon draft-only behavior is preserved. No new external
  sharing or messaging is introduced. No additional raw records go to NVIDIA.
- For real users, replace this demo selector with verified identity/account binding,
  durable secured sessions, and production deployment controls before public use.

## Verification

```sh
python -m pytest tests -q
cd frontend
npx tsc --noEmit
npm test
npm run build
```

Synthetic REST fixture tests cover customer-specific balances/history/outcomes,
conversation isolation even with the same signed browser identity, revoked/expired
sessions, rejected profile forgery, request bounds, and session-owned confirmed
schedules affecting engine results. Live Nessie verification requires your key and
approved profiles; successful fixture checks are not live API verification.

## Disable

Unset PLUTUS_DEMO_PROFILES_FILE and PLUTUS_DEMO_PROFILES on the backend and set
PLUTUS_DEMO_CUSTOMERS=0 on the frontend server. Restart both. The original configured
single-customer experience returns. PLUTUS_COUNCIL_ENABLED=0 and
VITE_COUNCIL_ENABLED=false independently disable Council. Keep existing source and
customer settings appropriate for the original single-customer mode.
