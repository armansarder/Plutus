# Plutus v1 final: original design + Photon alerts

## V2 reliability update

The public demo remains preview-only. `notifications/jobs.py` now commits stable
trigger claims, public events and durable jobs together before transport. SQLite
stores a delivery attempt ledger; jobs have queued, submitting, preview,
provider_accepted, delivery_unconfirmed, failed or cancelled states. A provider
receipt endpoint is not available; no state means confirmed delivered.

Connection refusal before submission can make at most three attempts, with 10/20
second backoff. Due jobs run on explicit checks, private Process due jobs, or the
opt-in polling loop. Unknown outcomes/timeouts and interrupted submitting jobs
never retry automatically. Disable preferences to cancel pending work on its next
processing check. Durable storage must be configured on a single instance.

Private `/operator` now uses the existing design with real job summaries and
engine-backed evaluation. The old shadow/bank-mutation console is no longer
installed. To enable private tools on a trusted local/private deployment, configure
`PLUTUS_PRIVATE_TOOLS=1` on Node and Python, `PLUTUS_OPERATOR_TOKEN` (same separate
32+ character server-only secret on both), and `PLUTUS_OPERATOR_PASSWORD` (32+
characters, Node only). HTTP Basic username is `operator`; public hosts require
HTTPS. Missing credentials/flag deny access, and the ordinary public demo leaves
all private-tool flags off. Do not put any of these secrets in `VITE_*` variables.
Every backend operator call requires both the service bearer and operator token;
the Node gateway also checks same-origin mutations. Summaries omit message bodies,
account records and recipients. Retry/cancel rejects unsafe states and foreign jobs.

The Spectrum sender is an iMessage integration, not verified SMS. Live provider
acceptance/delivery remain unverified. No sender was started and no messages were
sent during V2 implementation. Provider credentials, enrollment and an authorized
test send are still required for external verification.

Branch `Plutus-v1-final` starts at `arman-shiv-combined-branch` commit `cab91b5`.
No full branch merge was used. The Photon sender/package lock were copied from
`photon-alerts`; its alert workflow was adapted to the real configured account.
The synthetic operator console and its public default secret were not imported.
The combined branch's advisor labels, separate graphs, source-note cleanup,
Current Situation cash planning, Simulator, Cash Flow, Passport and Trust Shield
remain intact. Monthly Plan and Suggestions stay retired. Alerts is restored.

## Start the existing experience

From the repository root:

```sh
source .venv/bin/activate
npm run dev
```

This uses your existing backend `.env` and service token. Frontend remains
http://127.0.0.1:8080 and backend remains http://127.0.0.1:8000. Both bind to
loopback. No GPU/model deployment or extra model key is needed. One backend worker
is supported for polling. Do not start two alert-polling backend processes.

## Preview first (no messages)

Existing settings default to preview. Optional settings in `nemotron_agent/.env`:

```dotenv
PLUTUS_DELIVERY_MODE=preview
PLUTUS_ALERT_POLL_SECONDS=0
PHOTON_RECIPIENT_OPTED_IN=false
```

Open /alerts. Enable notifications and save settings. Preview doesn't require a
phone number or Photon credentials. Add a purchase directly, or use **Watch this
purchase** on a Council/advisor result. The saved amount, date, horizon and reserve
are validated on the backend. If the Council reserve includes your approved cash
plan, that combined protected amount is the saved reserve; future cash-plan edits
are not silently applied to existing watches. Remove/re-save to change parameters.

Press **Check for updates**. All watches use one newly fetched account snapshot.
The expected and applicable stress results are evaluated by the unchanged
`run_agent(..., allow_model=False)` calculation path. No extra Nemotron calls occur.
A purchase alert requires a transition from not ready to ready after saving; an
already-ready purchase does not produce a false 'became ready' alert on first check.
Late saved dates roll to the snapshot's earliest supported date; no same-day
intraday balance is replayed. Missing future income still makes delay testing
inapplicable, never successful by default.

Enable budget warnings only after entering a category name and monthly limit.
Spending comes from the selected account's completed historical category totals
using the existing history normalizer. Transfers are excluded. The API does not
invent a monthly budget, groceries spending, income, or future transactions.
If history is unavailable, the check reports a limitation rather than an all-clear.
A read failure fails the check and sends nothing based on substitute data.

With preview mode, events appear as **Preview — no text sent**. A genuine balance,
schedule, or spending change must make an item eligible; the final branch does not
alter Nessie or add fake bank transactions to manufacture an alert. Synthetic tests
cover both purchase and category-threshold transitions reproducibly.

## Enable Photon delivery yourself

Actual sending has not been enabled or verified by this integration. Use an
explicitly enrolled demo recipient and the official Photon project credentials.
Do not paste credentials or personal phone numbers into chat or commit them.

1. Copy `photon_service/.env.example` to `photon_service/.env` and fill in:

   ```dotenv
   PHOTON_PROJECT_ID=YOUR_PROJECT_ID
   PHOTON_PROJECT_SECRET=YOUR_PROJECT_SECRET
   PHOTON_INTERNAL_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
   PHOTON_TEST_RECIPIENT=+1XXXXXXXXXX
   PHOTON_RECIPIENT_OPTED_IN=true
   ```

2. Add the same internal secret, recipient and opt-in setting to the backend's
   `nemotron_agent/.env`, alongside existing Nessie/NVIDIA/service credentials:

   ```dotenv
   PLUTUS_DELIVERY_MODE=photon
   PHOTON_INTERNAL_SECRET=THE_SAME_INTERNAL_SECRET
   PHOTON_TEST_RECIPIENT=THE_SAME_ENROLLED_NUMBER
   PHOTON_RECIPIENT_OPTED_IN=true
   PLUTUS_ALERT_POLL_SECONDS=60
   ```

3. Start the separate sender in its own terminal:

   ```sh
   cd photon_service
   npm ci --ignore-scripts
   npm run dev
   ```

4. Restart the main app with `npm run dev`, open Alerts, review the masked enrolled
   number, and explicitly enable/save notifications. Only then check for updates or
   let the optional timer run. To stop sending, disable notifications in Alerts or
   return backend delivery mode to `preview` and restart.

The sender listens only on 127.0.0.1:8790 and targets its configured number; neither
the browser nor model can choose a destination. Keep both copies of the recipient
and shared secret identical. Sender submission is shown as **delivery unconfirmed**,
never 'delivered'. Missing enrollment/secret blocks sending. A timeout may mean a
message was accepted; uncertain submissions are not retried automatically.

Default polling is OFF. A nonzero interval must be 60–86400 seconds. Polling uses
the same checks while the one backend process is running, and only when alerts are
enabled. Failures are shown in settings and never trigger a synthetic-data fallback.
At most three new notifications are submitted per cycle to bound transport time;
other eligible purchase transitions wait for the next check. No financial action
is executed. Current limitation: no provider delivery-receipt webhook or automatic
retry/reconciliation. Phone enrollment is trusted server demo configuration, not
phone verification or production login.

## Storage, ownership and contracts

- SQLite defaults to ignored `private_data/notifications.sqlite3`, mode 0600.
  It contains settings, watch parameters, duplicate-suppression claims and delivery
  history. It never stores provider credentials or raw account histories.
- Every record is bound server-side to the configured customer and selected account.
  Client customer/account query parameters are rejected. The service token remains
  a local single-customer boundary, not multi-user authentication.
- Configure an explicit `NESSIE_ACCOUNT_ID` for notification use; the existing local
  launcher already requires it. Changing customer/account scopes hides old records.
- At most ten watches and 100 visible history events per account. Separate delivery
  claims survive history trimming so old alerts cannot be resent just because they
  are no longer visible. One purchase-opportunity event per watch; one category
  threshold warning per category/month/limit/threshold setting.
- Only generic alert text goes to Photon. No balances, IDs, merchants, purchase
  labels or raw financial records are included. Opening the app shows the evidence.
- New routes: GET/PUT `/api/notifications/settings`, GET/POST `/watchlist`, DELETE
  `/watchlist/{id}`, GET `/history`, POST `/check` (all under `/api/notifications`).
  Frontend uses a server-only allowlisted proxy, bounded bodies, same-origin checks,
  strict schemas and the existing private service bearer token. No operator routes
  or broad arbitrary forwarding were imported. Existing financial/v1/v2 routes and
  response contracts are unchanged.
- Contracts: `notifications/models.py`, `frontend/src/types/notifications.ts` and
  server-generated FastAPI OpenAPI. No public sharing or outbound chat tool exists.

## Verification and rollback

```sh
AGENT_DATA_SOURCE=engine FINPILOT_DATA_SOURCE=mock python -m pytest tests -q
cd frontend
npx tsc --noEmit
npm test
npm run build
cd ../photon_service
npm run check
```

Tests cover same-engine numerical agreement, transitions, account/customer isolation,
forged identity, duplicate submissions, explicit source failures, enrollment,
uncertain delivery, spending thresholds, missing history, honest frontend errors and
existing Council/engine behavior. V2 pins the existing Spectrum SDK at 12.15.0 and
overrides OpenTelemetry core to 2.12.0 for its baggage-allocation advisory. The
production npm audit now reports zero vulnerabilities; SDK imports and TypeScript
pass. This is not live provider verification, and no major SDK downgrade was used.

To return to the original presentation, stop these processes and switch back to
`arman-shiv-combined-branch` after preserving final-branch changes. Credentials
remain local; neither source branch was merged into or pushed by this work.
