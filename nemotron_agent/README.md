# Nemotron checkpoint 1

Run all commands from the repository root. This checkpoint uses only synthetic
data and the existing Shiv simulator. It neither accesses Nessie nor moves money.

1. Revoke any key exposed in screenshots and generate a replacement.
2. Copy `.env.example` to `.env` inside this directory and paste the replacement
   after `NVIDIA_API_KEY=`. Never commit or share `.env`. Existing environment
   variables take precedence over the file.
3. Create a Python virtual environment and install:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r nemotron_agent/requirements.txt
python -m pytest tests/test_nemotron_check.py -q
python -m nemotron_agent.check connectivity
python -m nemotron_agent.check tool
```

The connectivity command makes one NVIDIA request. The tool command makes two:
a forced structured tool selection, then a follow-up with the validated result.
This proves the protocol; autonomous scenario planning comes in a later checkpoint.
No fallback is used here, so a failure cannot be mistaken for real NVIDIA success.

Expected synthetic results: minimum -100.00 USD, ending 900.00 USD, shortfall true.
No provider reasoning, raw response bodies, secrets, or unvalidated model prose
are printed. The network timeout is 45 seconds per request; no automatic retries.

The default model alias follows the NVIDIA Build Python example:
`nvidia/nemotron-3.5-bolt-e4b`. The API reference currently documents a different
staging-prefixed alias; use the Build example for this checkpoint. HTTP 404
indicates an unavailable model alias or endpoint, 401 authentication, 403 access,
and 429 rate/quota limits. Environment variables override the local .env file.
HTTP 202 is reported as pending rather than success.

Verified documentation, November 7, 2026:
https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-bolt-e4b-infer

Next checkpoint: stable agent request/response contracts and snapshot adapter.
The independent FastAPI endpoint and autonomous stress tests are not built yet.

Full agent API and frontend setup: [INTEGRATION.md](INTEGRATION.md).
