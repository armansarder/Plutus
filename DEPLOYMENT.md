# Public demo deployment (Render)

> **V2 audit: deployment blocked.** The configuration below currently enables
> Council in production, which `nemotron_agent/council_api.py` deliberately rejects
> until application authentication is integrated. The earlier local smoke used a
> local-mode backend and did not verify this combination. See
> [Milestone 0 audit](docs/MILESTONE_0_AUDIT.md). Do not deploy this checkpoint as-is;
> complete the V2 milestones and obtain deployment approval first.

Only deploy this independent repository, `raiyan11111/Plutus-v2`, branch
`feature/plutus-v2`. Do not connect the HackUTD original repository or `main`.
Local preparation does not authorize a push or deployment. Review the diff and
approve publishing the feature branch before following the dashboard steps below.

## What actually runs

| Question | Repository finding |
| --- | --- |
| Frontend framework | React 19, TanStack Start/Router, Vite 8, Tailwind, Nitro server. The package name does not mean this is a static SPA or Next.js app. |
| Production frontend | In `frontend/`: `npm ci --include=dev --no-audit --no-fund`, `npm run build`, then `npm start` (`node .output/server/index.mjs`). Node 24.20.0. |
| Backend | From repository root: `python -m uvicorn nemotron_agent.main:app`. This includes the calculation engine routes, agent, optional council, and notifications. Do not run a second calculation-engine server. |
| Local launcher | Root `npm run dev` launches `frontend/scripts/dev.mjs` and `start_local.py`: it loads existing local backend env files, verifies Nessie, runs Uvicorn on 8000 and Vite dev on 8080. It requires local mode and Nessie credentials. It is not a production process manager. |
| Browser communication | Same-origin `/api/...` requests to the Node server. Strict server-only financial, council, and notification proxies inject the backend bearer token. Council also uses signed HttpOnly session cookies. |
| Localhost dependencies | Proxy defaults are `http://127.0.0.1:8000`; override with `FINPILOT_BACKEND_URL=https://YOUR-API.onrender.com`. The optional Photon sender is hardcoded to local port 8790; it is not needed in preview mode. `start_local.py` is deliberately localhost-only. |
| Separate Render services | Yes: Node **Web Service** plus Python **Web Service**. A Static Site would lose SSR and the secret-bearing proxies. |
| Visitor authentication | No login is required for this deliberately public fictional-customer demo. Backend authentication remains mandatory. All public visitors can see the same sandbox customer and share alert settings/watchlists. This is not private multi-user banking. Council conversations are separately session-bound. |

## Data and external services

The recommended configuration preserves the current Nessie integration. Balances,
account selection, transaction history, and explicit future bill dates come from
the configured **Nessie sandbox**, never real banking. Account/customer IDs must
belong to a dedicated fictional demo customer containing no personal information.
No seed scripts or financial writes are needed to deploy.

Forecasts, hypothetical purchases, reserve checks and stresses are deterministic
calculations over that snapshot, not bank predictions. Unavailable monthly budgets
remain unknown; the remote adapter does not invent an approved budget. Homepage
illustrations are synthetic examples. NVIDIA is optional hosted orchestration,
not the calculation engine; unavailable/disabled models are honestly labeled as
deterministic fallback. No local GPU/model server is needed.

An intentional synthetic deployment can instead set `AGENT_DATA_SOURCE=demo`,
`FINPILOT_DATA_SOURCE=mock`, and `FINPILOT_CUSTOMER_ID=synthetic_demo`, omitting
Nessie settings. Its fixture schedule rolls to the current UTC date. History is
unavailable in that mode; use Nessie for the existing full history experience.
Never change sources automatically after a Nessie error.

Photon runs in `preview` mode: drafts and simulated alerts only. Do not deploy
`photon_service`, enable `PLUTUS_DEMO_MODE`, configure operator secrets, or set
delivery/recipient credentials for this public demo. Production blocks `/operator`
and operator proxy routes and never installs backend operator handlers.

## Render dashboard: exact manual setup

These steps create live services and can incur charges. Perform them only after
approving the push and deployment. The checked-in `render.yaml` is an equivalent
Blueprint configuration, with manual environment prompts and auto-deploy disabled.
Manual setup is easiest because Render may choose a unique hostname suffix.

1. After approving and publishing the feature branch, sign in to Render. Choose
   **New → Web Service → Git Provider**, connect GitHub, and select
   **raiyan11111/Plutus-v2**. Select branch **feature/plutus-v2**.
2. Name it `plutus-api` (or an available name). Choose **Python 3**, leave **Root
   Directory empty**, and choose your region/instance plan. Use a paid always-on
   instance for recruiter reliability; free instances have cold-start limitations.
3. Enter backend **Build Command**:
   `pip install -r requirements-production.txt`
4. Enter backend **Start Command**:
   `python -m uvicorn nemotron_agent.main:app --host 0.0.0.0 --port $PORT --workers 1 --proxy-headers --forwarded-allow-ips '*'`
   Use one worker/instance: council state is in memory, and notification state is
   local SQLite. Render terminates public TLS; Uvicorn trusts forwarded protocol
   headers at that hosting boundary. Do not reuse this trust-all proxy setting on
   a directly internet-exposed Uvicorn host outside Render.
5. In **Advanced**, set **Health Check Path** `/health`, disable **Auto Deploy**,
   and enter the backend environment variables below. Use the actual assigned
   API hostname for `FINPILOT_ALLOWED_HOSTS` (no scheme/path/wildcard). If the final
   hostname differs, update it before testing financial endpoints. Click
   **Create Web Service** and wait for a successful deploy.
6. Choose **New → Web Service**, same repository/branch/region. Name it
   `plutus-web`; choose **Node**, **Root Directory** `frontend`.
7. Frontend **Build Command**:
   `npm ci --include=dev --no-audit --no-fund && npm run build`
   Frontend **Start Command**: `npm start`.
8. Set **Health Check Path** `/health`, disable **Auto Deploy**, and add the
   frontend environment below. `FINPILOT_BACKEND_URL` must be the actual backend
   **HTTPS origin**, with no API path. Both services need exactly the same private
   `FINPILOT_API_TOKEN`. Click **Create Web Service**.
9. Wait for both services to be healthy. Open `/dashboard`, `/simulator`,
   `/cash-flow`, `/talk`, and `/alerts` at the frontend URL. Verify source labels,
   chart values, visible fallback/model mode, and that `/operator` returns 404.
10. Run the smoke command below against the actual URLs before sharing the
    **frontend URL**. A green `/health` alone does not verify Nessie or NVIDIA.
    Subsequent releases use **Manual Deploy → Deploy latest commit** only after
    approval. A failed source request remains a visible error with retry controls.

## Backend environment

| Variable | Value / requirement |
| --- | --- |
| `PYTHON_VERSION` | `3.12.10` |
| `FINPILOT_MODE` | `production` |
| `FINPILOT_API_TOKEN` | New private random token, at least 32 non-whitespace ASCII characters; same on Node. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"` locally and enter privately. |
| `FINPILOT_ALLOWED_HOSTS` | Actual API hostname, e.g. `plutus-api.onrender.com` |
| `FINPILOT_CUSTOMER_ID` | Dedicated fictional Nessie customer ID |
| `AGENT_DATA_SOURCE`, `FINPILOT_DATA_SOURCE` | Both `nessie` |
| `NESSIE_API_KEY` | Private sandbox API key, backend only |
| `NESSIE_ACCOUNT_ID` | Owned demo Checking/Savings account ID; explicit selection avoids ambiguity |
| `NESSIE_BASE_URL` | `https://prod-api.nessieisreal.com` (sandbox provider despite hostname) |
| `FINPILOT_CURRENCY` | `USD` |
| `PLUTUS_COUNCIL_ENABLED` | `1` to preserve the existing local council experience |
| `NVIDIA_API_KEY` | Optional private backend key; omit for deterministic fallback |
| `NVIDIA_MODEL` | Optional; current default `nvidia/nemotron-3.5-bolt-e4b` |
| `PLUTUS_DEMO_MODE` | `false`; production additionally refuses operator installation |
| `PLUTUS_DELIVERY_MODE` | `preview` |
| `PLUTUS_ALERT_POLL_SECONDS` | `0` |
| `PHOTON_RECIPIENT_OPTED_IN` | `false` |
| `PLUTUS_NOTIFICATIONS_DB` | `/tmp/plutus/notifications.sqlite3`; temporary demo state |

Leave `FINPILOT_CORS_ORIGINS` unset: browser calls stay same-origin at Node; Node
calls FastAPI server-to-server. Do not set `FINPILOT_UPCOMING_FILE`, custom history
files, Photon recipient/secret, or file-source variables. Never upload local `.env`
files. Check environment values privately rather than logging keys or source bodies.

## Frontend environment

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `24.20.0` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `VITE_DATA_MODE` | `remote` (even when using the backend's synthetic fixture) |
| `VITE_COUNCIL_ENABLED` | `true` |
| `FINPILOT_BACKEND_URL` | Actual API HTTPS origin |
| `FINPILOT_API_TOKEN` | Same private backend service token, **without** a `VITE_` prefix |

Render provides `PORT`; do not hardcode it. `VITE_*` values are public build-time
configuration: never put credentials there. NVIDIA and Nessie keys belong only on
Python. Changing a `VITE_*` flag requires a rebuild. Server-only proxy variables
are read at runtime.

## Verification and operational limits

From the root after installing Python dependencies:

```sh
python -m pytest tests -q
npm test --prefix frontend
cd frontend
npm run build
# Runtime: npm start (not Vite dev/preview)
```

After deployment, from the repository root:

```sh
python scripts/production_smoke.py --web-url https://YOUR-WEB.onrender.com --api-url https://YOUR-API.onrender.com --source nessie_sandbox
```

The smoke test makes no bank writes or external sends and disables model calls.
It checks built pages/assets, both health endpoints, direct-backend authentication,
source provenance, a forecast, all five agent scenarios, alert/council availability,
and blocked operator paths. It suppresses account payloads and credentials.
NVIDIA connectivity checks are separate opt-in synthetic tests; deployment work
does not change the model protocol or require provider calls.

Health is process liveness only, deliberately independent of rate limits, bearer
credentials, and third-party services. Application API routes retain authentication,
host validation, HTTPS enforcement, body/concurrency/rate limits and no-store headers.
Public endpoints can still consume the shared demo's request budget and optional
model quota. Leave NVIDIA unset if an unmetered public demo is preferred.

All visitors share the fictional account's alert preferences and watchlist. Changes
do not affect Nessie balances; messages never leave preview mode. Notification data
is temporary and resets on instance replacement; council chats reset on restart.
Do not enter private data, promise persistence, or scale to multiple workers.
This deployment adds no database, queue, financial action, or new product feature.

Render references: [Web Services](https://render.com/docs/web-services),
[FastAPI](https://render.com/docs/deploy-fastapi),
[health checks](https://render.com/docs/health-checks), and
[Blueprint fields](https://render.com/docs/blueprint-spec).

### Local verification completed

On 2026-11-15: Python suite **92 passed, 1 skipped**; frontend suite **157
passed, 2 skipped**; Node production build passed. The built Node server was
started on a temporary loopback port and passed the HTTP smoke checks against an
authenticated synthetic backend. That local backend used local HTTP mode; the
backend production HTTPS/authentication boundaries were tested separately with
FastAPI TestClient. No live Nessie/NVIDIA calls, Render deployment, git commit or
push were performed. Run the deployed HTTPS smoke check after deploying; Linux
hosting, Render proxy behavior, and live provider access remain unverified locally.
