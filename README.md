# Plutus

## Independent V2

Plutus explores how a financial decision changes future cash flow. The independent
V2 preserves the HackUTD frontend and deterministic Python engine while adding:

- Financial Multiverse inside Simulator: buy now/later/skip, explicit setbacks,
  shared daily timelines, event minima, reserve breaches and accessible tables.
- Explicit Fictional Demo/Nessie Sandbox provenance and source failures without
  hidden fixture substitution. Demo history is separate and labeled.
- Engine-grounded Nemotron Council with independently authorized guest sessions
  for the public fictional demo; optional NVIDIA access has honest fallback labels.
- Persistent alert jobs/attempts, bounded safe retries and a private operator site.
  Public alerts are preview-only; no payment or real message is executed.
- A private, reproducible fictional research pilot with four presentation styles,
  balanced synthetic assignment and test-only export. No participant collection.

There is **no public deployment yet**. Local readiness does not verify Render or
live Nessie/NVIDIA/Photon service access. See the [implementation report](docs/PLUTUS_V2_IMPLEMENTATION_REPORT.md),
[architecture](docs/PLUTUS_V2_ARCHITECTURE.md), [test results](docs/PLUTUS_V2_TEST_RESULTS.md)
and [deployment steps](DEPLOYMENT.md).

### Recruiter demo locally (no provider credentials)

From the repository root, run **`npm run dev:demo`**, then open
**http://127.0.0.1:8080/dashboard**. This starts Vite/Node on 8080 and FastAPI on
8000 using the existing fictional customer and Python engine. No production build
or `.env` is required. Local-only bearer/session secrets are generated in memory;
saved live settings are ignored. Alerts preview only; operator/research tools are
off. Ctrl+C stops both services; temporary settings/chats reset. Ports must be free.
The existing `npm run dev` remains the explicitly configured Nessie launcher and
requires its sandbox account/key; it does not silently switch data sources.
Install backend dependencies into `.venv` and frontend dependencies as below first.

For the alternative **built production preview** (port 18080):

```sh
python -m pip install -r nemotron_agent/requirements.txt
npm ci --include=dev --prefix frontend
npm run build:demo --prefix frontend
python scripts/preview_demo.py
```

Alternatively `python scripts/verify_v2.py "Final regression"` runs all gates and
builds with the Council flag enabled (also requires Photon dev dependencies and
OpenSSL). Preview opens at `http://127.0.0.1:18080/dashboard`. It uses ephemeral
local demo storage, preview alerts and no live providers. Ctrl+C stops both services.

Suggested walkthrough: inspect Dashboard/source labels; compare a purchase in
Simulator; explore Multiverse reserve/setback controls and the accessible timeline;
stage an ordinary purchase for Council and explicitly confirm it; inspect Cash
Flow/history; add a preview watch in Alerts. With NVIDIA absent, Council reports
deterministic-only. Private operator/research pages are intentionally unavailable
in the public demo. Projections are simulations, not guarantees or financial advice.

### Attribution

Built originally by the HackUTD Plutus team. This fork retains the original Git
history and team contributions: Arman (orchestration/contracts), Shiv (financial
engine), Azzam (Nessie pipeline), Raiyan (frontend/Multiverse and independent V2),
and Awsaf (Photon integration). Historical Multiverse references: `4835326` and
`97a08da`; original team repository: https://github.com/armansarder/Plutus.
Changes here remain on `feature/plutus-v2`; no upstream/main merge or history rewrite.

For the independent public fictional-customer demo, see [Render deployment](DEPLOYMENT.md)
for exact production commands, private environment configuration, dashboard steps,
and smoke checks. Deployment uses a Node web service plus one combined Python API;
the Photon operator interface is blocked in production. Do not use the local
launcher as a production start command.

Financial council and four specialist chats are available locally; see
[Council integration](nemotron_agent/COUNCIL.md) for contracts and limitations.

Start the local Nessie API and website together from the repository root:

```powershell
npm run dev
```

The launcher reads existing `calculation_engine/.env` and `nemotron_agent/.env` values and gives the frontend
server the same bearer token automatically. No credential copying or edits are
needed. It verifies authenticated Nessie access, then starts the website at
http://127.0.0.1:8080/dashboard. The command works from the repository root or
`frontend/`. An already running, matching app is reused. Conflicting servers are
reported without stopping unrelated processes. Ctrl+C stops services started here.
Saving either configuration file reloads both services and clears temporary chats.
Invalid configuration saves leave the current services running until corrected.
Install backend dependencies with `.\.venv\Scripts\python.exe -m pip install -r
nemotron_agent/requirements.txt` and frontend dependencies with `npm install --prefix
frontend` before the first launch. `npm run dev:frontend` from `frontend/` starts
only Vite for development with an independently managed backend.
The combined backend also supports the existing Talk endpoint.
People can track where their money goes, but they lack the tools to understand how today's financial decisions will affect their future financial stability. Plutus is a platform for user's to understand and predict the impact of their long-term financial goals.


## Nemotron agent API

The independent FastAPI agent is ready for frontend integration. It includes the
existing financial-data, history, forecast, and simulation routes. See
[nemotron_agent/INTEGRATION.md](nemotron_agent/INTEGRATION.md) for startup, live
Nessie configuration, request/response contracts, and Photon handoff.

```sh
python -m pip install -r nemotron_agent/requirements.txt
python -m pytest tests -q
python -m uvicorn nemotron_agent.main:app --host 127.0.0.1 --port 8000
```

Defaults to explicitly labeled synthetic demo data and loopback access. Configure
the service bearer token and frontend origin before connecting the UI. Never
commit keys. No payment or external message is executed.

## Optional financial council and specialist chats

See [nemotron_agent/COUNCIL.md](nemotron_agent/COUNCIL.md) for the opt-in v2 council,
four specialist chats, signed demo sessions, chart evidence, startup and rollback.
Existing purchase analysis and financial routes remain compatible.

# Free recruiter demo deployment

For a $0 Node + FastAPI Render demo, use
[the Free deployment guide](docs/FREE_RENDER_DEPLOYMENT.md) and `render.free.yaml`.
No paid disk/database or external API is required. Fictional financial records,
Python-engine Simulator/Multiverse, spending/history views and deterministic Council
remain available. Free services sleep; all temporary settings/chat history can reset.
The original `render.yaml` retains the separate paid production configuration.
