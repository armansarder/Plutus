# Plutus
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
