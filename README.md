# Plutus

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
