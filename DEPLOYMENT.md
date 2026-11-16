# Plutus V2 deployment preparation

**Strict $0 recruiter demo:** follow [Free Render deployment](docs/FREE_RENDER_DEPLOYMENT.md)
and `render.free.yaml`. The setup below uses paid persistence and is **not** the
free-demo path. Both configurations are retained independently.

No service has been deployed. All commits remain local on `feature/plutus-v2`.
Publishing/pushing and deployment require explicit user approval. Never use the
upstream team repository or either `main` branch for this release.

## Architecture and exact commands

| Service | Root directory | Build | Start |
| --- | --- | --- | --- |
| Python FastAPI | empty (repository root) | `pip install -r requirements-production.txt` | `python -m uvicorn nemotron_agent.main:app --host 0.0.0.0 --port $PORT --workers 1 --proxy-headers --forwarded-allow-ips '*'` |
| Node TanStack Start/Nitro | `frontend` | `npm ci --include=dev --no-audit --no-fund && npm run build` | `npm start` |

The frontend is React 19/TanStack Start, Vite 8 and Nitro `node-server`, not a
static SPA or Next.js site. `npm start` runs `node .output/server/index.mjs`.
Do not deploy Vite dev/preview, `start_local.py`, a Static Site, or an extra
calculation-engine server. Render supplies PORT; both services bind 0.0.0.0.
Node uses HTTPS to the backend and injects credentials server-side. Browsers call
same-origin `/api/*`; no browser bearer token or cross-origin CORS setup is needed.

Use one backend instance and one Uvicorn worker. SQLite jobs require the configured
persistent disk; Council histories are bounded in-memory and reset on restart.
Do not add autoscaling/multiple workers until shared storage and coordination are
implemented. Uvicorn's trust-all forwarded-proxy setting assumes Render's hosting
boundary; do not use it on a directly internet-exposed standalone Uvicorn server.

## Public fictional demo settings

The Blueprint defaults to `demo`, which needs no Nessie or NVIDIA credentials.
All banking information/history is explicitly fictional. The Python engine
calculates every projection. Alerts only preview; no sender service is deployed.
Visitors need no personal login; signed anonymous guest sessions isolate Council
conversations. Public alert preferences/watchlists intentionally share one fictional
customer. Never enter private data or use this as real multi-user banking.

| Python variable | Value |
| --- | --- |
| `PYTHON_VERSION` | `3.12.10` |
| `FINPILOT_MODE` | `production` |
| `FINPILOT_ALLOWED_HOSTS` | Actual API hostname, without scheme/path/wildcard |
| `FINPILOT_API_TOKEN` | Private random 48+ character token, same on Node |
| `PLUTUS_SESSION_SECRET` | Separate private random 48+ character secret, same on Node; must differ from bearer |
| `FINPILOT_CUSTOMER_ID` | `synthetic_demo` |
| `PLUTUS_DATA_MODE` | `demo` |
| `AGENT_DATA_SOURCE` | `demo` |
| `FINPILOT_DATA_SOURCE` | `mock` |
| `FINPILOT_CURRENCY` | `USD` |
| `PLUTUS_COUNCIL_ENABLED` | `1` |
| `PLUTUS_PUBLIC_DEMO` | `1` |
| `PLUTUS_PRIVATE_TOOLS`, `PLUTUS_RESEARCH_ENABLED` | Both `0` |
| `PLUTUS_DELIVERY_MODE` | `preview` (enforced for public mode) |
| `PLUTUS_ALERT_POLL_SECONDS` | `0` |
| `PHOTON_RECIPIENT_OPTED_IN`, `PLUTUS_DEMO_MODE` | Both `false` |
| `PLUTUS_NOTIFICATIONS_DB` | `/var/data/notifications.sqlite3` |

Generate two independent values privately with
`python -c "import secrets; print(secrets.token_urlsafe(48))"`. Do not paste them
into chat or commit them. Render's default generated 256-bit base64 values can
be shorter than the session-secret length requirement; enter a 48+ character
value explicitly. Never use VITE_ prefixes for any secret.

| Node variable | Value |
| --- | --- |
| `NODE_VERSION` | `24.20.0` |
| `NODE_ENV`, `HOST` | `production`, `0.0.0.0` |
| `VITE_DATA_MODE`, `VITE_COUNCIL_ENABLED` | `remote`, `true` (build-time public flags) |
| `FINPILOT_BACKEND_URL` | Actual API HTTPS origin, no `/api` path |
| `FINPILOT_API_TOKEN`, `PLUTUS_SESSION_SECRET` | Matching private Python values |
| `PLUTUS_PUBLIC_ORIGIN` | Actual frontend HTTPS origin, no path |
| `PLUTUS_PRIVATE_TOOLS` | `0` |

Node pins the external origin to keep same-origin checks and Secure cookies correct
behind Render TLS termination. It rejects an unexpected host rather than trusting
arbitrary forwarded-host headers. `/health` is public liveness, not proof of source
or provider access. Account routes still require the backend bearer; Council also
requires the separate signed guest credential. The former production Council
startup conflict is resolved for this explicit fictional-demo policy and tested
with a production-mode backend over verified local TLS. Personal-bank login remains
out of scope, not silently bypassed.

## Optional Nessie sandbox mode

To use actual live HTTP responses from the simulated Nessie sandbox, change Python:

- `PLUTUS_DATA_MODE=nessie`, `AGENT_DATA_SOURCE=nessie`, `FINPILOT_DATA_SOURCE=nessie`
- `FINPILOT_CUSTOMER_ID=<dedicated fictional sandbox customer>`
- `NESSIE_ACCOUNT_ID=<owned Checking/Savings account>`
- `NESSIE_API_KEY=<private sandbox key>`
- `NESSIE_BASE_URL=https://prod-api.nessieisreal.com`

Leave Node `VITE_DATA_MODE=remote`. No keys move to Node/browser. Unset file/history/
inferred-schedule overrides. A failure returns a visible error, never a demo
substitute. Current balance is intraday UTC; projections start next day. Only
explicitly dated future bills/deposits are used, as estimates. Historical records
are not reapplied to balance. Records may be cached for up to 30 seconds.

NVIDIA is optional: set `NVIDIA_API_KEY` on Python and optionally `NVIDIA_MODEL`
(current code default `nvidia/nemotron-3.5-bolt-e4b`). Without provider access the
UI reports deterministic-only/fallback, not live Nemotron success. No key/provider
connectivity has been verified here. Do not deploy Photon sender/recipient secrets.
Operator and research tools stay disabled publicly; private setup is documented
in PHOTON_INTEGRATION.md and docs/RESEARCH_MODE.md.

## Render dashboard steps (after approval only)

Choose **one** setup method: the root Blueprint or the manual two-service setup.
Do not create both sets of services. The manifest deliberately disables automatic
deploys. Its paid Starter instances plus a 1 GB disk can incur charges once created;
review Render's current plan terms before approving deployment.

1. After approval, publish only `feature/plutus-v2` to your fork. Sign in to Render,
   choose **New > Web Service > Git Provider**, select `raiyan11111/Plutus-v2`,
   and select branch **feature/plutus-v2**.
2. Name the Python service `plutus-api` (or an available name), choose Python 3,
   leave Root Directory empty, choose your region and a paid disk-compatible plan.
   Copy the Python build/start commands above exactly. Set Auto Deploy **Off**.
3. In Advanced set Health Check Path `/health`. Add a persistent disk, mount
   `/var/data`, size 1 GB. Enter all Python settings from the table. The actual
   assigned API hostname must match FINPILOT_ALLOWED_HOSTS. Create the service.
4. Create a second **Web Service**, same fork/branch/region, Node runtime, root
   directory `frontend`. Use the Node commands above, Auto Deploy Off, health `/health`.
5. Enter Node settings with the actual API HTTPS origin and actual frontend HTTPS
   origin, and matching secrets. If Render appends a hostname suffix, update the
   host/origin values accordingly. Create the service and wait for healthy deploys.
6. If using a Blueprint instead, choose **New > Blueprint**, select this fork and
   feature branch and root `render.yaml`. Review costs; enter prompted secrets/
   hostnames/URLs. Do not also create manual services. Existing Blueprint updates
   may need newly added secrets entered manually in each service environment.
7. Run the deployed smoke check below. Open Dashboard, Simulator/Multiverse,
   Cash Flow/history, Talk and Alerts. Confirm provenance/fallback labels and that
   `/operator`, `/research` and private APIs are unavailable. Share only the
   frontend URL after these external checks succeed.
8. Subsequent approved releases use **Manual Deploy > Deploy latest commit**.
   Custom DNS is a later separately approved step using Render-provided records.

## Verification and smoke commands

```sh
python -m pip install -r nemotron_agent/requirements.txt
npm ci --include=dev --prefix frontend
npm ci --ignore-scripts --prefix photon_service
python scripts/verify_v2.py "Final regression"
```

The runner performs Python/frontend tests, both type checks, production build,
local built-server smoke, production-mode backend TLS/authentication/private-tools
smoke, a full local HTTP Nessie-wire fixture integration, Render YAML/config
invariants, whitespace and changed-file credential-pattern scans. Local TLS smoke
requires OpenSSL (Git for Windows provides it here). It uses temporary test-only
certificates, not insecure TLS bypasses. No external services or messages are used.

After an approved deployment, from the root:

```sh
python scripts/production_smoke.py --web-url https://YOUR-WEB.onrender.com --api-url https://YOUR-API.onrender.com --source synthetic_demo
# Use --source nessie_sandbox only when explicitly configured and genuinely available.
```

These checks create temporary fictional Council chats, run model-disabled analyses,
and make no bank writes or sends. Payloads/credentials are not printed. See
`docs/PLUTUS_V2_TEST_RESULTS.md` for actual local outcomes and skips. Render Linux,
external HTTPS, provider credentials/quotas and a public URL remain unverified
until an approved deployment. Local YAML checks are not a remote Blueprint validation.

Persistent disk data survives service replacement; Council chats do not. Logs use
safe status/attempt metadata, not recipient/message/account payloads. Review disk
usage and failure rates, keep backups/retention under operator control, and keep
one backend worker. Unknown delivery outcomes require manual reconciliation; they
are not auto-retried. No real messages should be tested without separate approval.

Render references: [Web Services](https://render.com/docs/web-services),
[Blueprint fields](https://render.com/docs/blueprint-spec),
[persistent disks](https://render.com/docs/disks),
[health checks](https://render.com/docs/health-checks).
