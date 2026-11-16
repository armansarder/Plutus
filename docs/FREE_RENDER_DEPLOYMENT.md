# $0 recruiter demo on Render

Use **two Free Web Services**, no databases, disks, workers or paid workspace
subscription. `render.free.yaml` is the reference for this profile. The original
`render.yaml` deliberately retains paid production persistence: **do not select it**
for this deployment. Manual setup below avoids selecting the wrong Blueprint.
Nothing has been pushed or deployed by this preparation.

## Publish only when ready

Run from the repository root after reviewing the local commits:

```powershell
git switch feature/plutus-v2
git status --short
git remote get-url origin
git push -u origin feature/plutus-v2
```

Confirm origin is `https://github.com/raiyan11111/Plutus-v2.git`. Do not push main
or upstream. Keep private values out of Git, chat, screenshots and browser variables.

## Create the API first

1. Use Render's free Hobby workspace. For a strict $0 cap, do not add a payment
   method or upgrade services. Review Billing usage limits; over-limit services may
   suspend instead of remaining available. Do not create a paid resource if prompted.
2. Dashboard **New > Web Service**, connect the fork, branch **feature/plutus-v2**.
   Name `plutus-demo-api` (Render may append a suffix). Runtime **Python 3**,
   Root Directory empty. Choose your preferred region.
3. Build: `pip install -r requirements-production.txt`
4. Start: `python -m uvicorn nemotron_agent.main:app --host 0.0.0.0 --port $PORT --workers 1 --proxy-headers --forwarded-allow-ips '*'`
5. **Instance Type: Free ($0/month)**. No disk. No database. Auto Deploy **Off**.
   Advanced Health Check Path: `/health`.
6. Enter these environment variables before creating the service:

| Variable | Value |
| --- | --- |
| `PYTHON_VERSION` | `3.12.10` |
| `FINPILOT_MODE` | `production` |
| `FINPILOT_ALLOWED_HOSTS` | Actual assigned API hostname, e.g. `plutus-demo-api.onrender.com`, no scheme/path |
| `FINPILOT_API_TOKEN` | Private random 48+ character value |
| `PLUTUS_SESSION_SECRET` | Different private random 48+ character value |
| `FINPILOT_CUSTOMER_ID` | `synthetic_demo` |
| `PLUTUS_DATA_MODE`, `AGENT_DATA_SOURCE` | `demo` |
| `FINPILOT_DATA_SOURCE` | `mock` |
| `FINPILOT_CURRENCY` | `USD` |
| `PLUTUS_COUNCIL_ENABLED`, `PLUTUS_PUBLIC_DEMO` | `1` |
| `PLUTUS_PRIVATE_TOOLS`, `PLUTUS_RESEARCH_ENABLED` | `0` |
| `PLUTUS_DELIVERY_MODE` | `preview` |
| `PLUTUS_ALERT_POLL_SECONDS` | `0` |
| `PHOTON_RECIPIENT_OPTED_IN`, `PLUTUS_DEMO_MODE` | `false` |
| `PLUTUS_NOTIFICATIONS_DB` | `/tmp/plutus-demo/notifications.sqlite3` |
| `NVIDIA_API_KEY` | Empty; no external API required |

Generate two separate values locally (run twice):
`python -c "import secrets; print(secrets.token_urlsafe(48))"`.
Use the project Python executable if `python` is not installed on PATH.
Copy values privately into Render; reuse each matching value on Node below.
Do not use Render's shorter generated default for the 48-character session secret.
Do not configure Nessie, Photon, recipient or operator credentials.

7. Create the Free service. Copy its actual **HTTPS onrender.com URL**. If its
   hostname differs, update `FINPILOT_ALLOWED_HOSTS` and deploy the configuration.
   Visit `<API URL>/health`; it must return `{"status":"ok"}` (additional fields
   are acceptable). A direct account API request without a bearer must return 401.

## Create the website

1. **New > Web Service**, same fork, branch and region; name `plutus-demo-web`.
   Runtime **Node**, Root Directory `frontend`.
2. Build: `npm ci --include=dev --no-audit --no-fund && npm run build`
3. Start: `npm start`.
4. **Instance Type: Free ($0/month)**; no disks/databases. Auto Deploy **Off**;
   Health Check Path `/health`.
5. Enter:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `24.20.0` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `VITE_DATA_MODE` | `remote` |
| `VITE_COUNCIL_ENABLED` | `true` |
| `FINPILOT_BACKEND_URL` | Actual API HTTPS origin, no `/api` path |
| `PLUTUS_PUBLIC_ORIGIN` | Actual website HTTPS origin, no path |
| `FINPILOT_API_TOKEN` | Same private API token as Python |
| `PLUTUS_SESSION_SECRET` | Same separate session secret as Python |
| `PLUTUS_PRIVATE_TOOLS` | `0` |

6. Create the Free service. Correct `PLUTUS_PUBLIC_ORIGIN` if Render appended a
   suffix. Its **onrender.com URL is the recruiter-facing link**. No custom domain
   is needed. Never put server tokens in a `VITE_` variable.
7. First open the API `/health` to wake the backend, then open the website.
   Check Dashboard, Cash Flow/history, Simulator, Multiverse and Talk.
   Visitors need no login. Guest cookies isolate Council chats; this is fictional
   banking, not personal-bank authentication.
8. From the local repository, verify both actual URLs:

```powershell
.venv/Scripts/python.exe scripts/production_smoke.py --web-url https://YOUR-WEB.onrender.com --api-url https://YOUR-API.onrender.com --source synthetic_demo
```

Only share the website after this passes. Public `/operator`, `/research` and
operator APIs must return 404. No provider key is needed for this smoke check.

## Functionality and free-tier limits

- Dashboard, current simulator, five Multiverse timelines and cash-flow/history
  views use explicitly fictional backend records. All forecasts use the Python engine.
  Browser mode `remote` means connected to our API, **not live banking**.
- No standalone feature named Spending Fingerprint was found in the current
  frontend routes/components. Existing spending/history functionality is preserved;
  a standalone Fingerprint feature is not claimed as implemented or verified here.
- Council conversations and deterministic recommendations work without NVIDIA.
  Model-disabled/unavailable output is labeled; no synthetic response is called
  live Nemotron. Optional NVIDIA or Nessie credentials are not needed or funded by
  this profile. Live API functionality remains unverified.
- Photon delivery is off: no sender deployed, no recipient/credentials/opt-in,
  preview-only transport, no polling. Public alert previews/settings may still
  work. Operator controls and research administration are disabled.
- SQLite is an embedded temporary **file**, not a hosted database or disk purchase.
  The application creates its missing directory automatically. Preferences, watches,
  job records and Council conversations can disappear at spin-down/restart/deploy.
  Durable delivery/history and real multi-user banking are not supported here.
- Render currently sleeps Free services after 15 idle minutes; waking takes about
  a minute. Two services can wake separately. The gateway can time out while the
  backend wakes: open API `/health`, wait for JSON, then refresh/retry the website.
  No always-on availability or instant first visit is promised; no keepalive pinger
  is included. Both services share 750 free instance hours per workspace/month,
  so two continuously active services exceed the allowance. Monitor usage.
- Bandwidth/build quotas also apply. Without a payment method, exhausted quotas
  suspend services/builds rather than incurring an overage charge. Stay on Free;
  do not add paid resources or use a payment method for this strict-$0 demo.
- Hosted Linux startup, Free memory limits and external HTTPS have not been tested
  until you deploy. Local tests do not prove hosted availability.

Render source: [Free deployment and current limitations](https://render.com/docs/free).
This guide was checked November 16, 2026. Retain `render.yaml` for future paid
production use; never deploy both profiles accidentally.
