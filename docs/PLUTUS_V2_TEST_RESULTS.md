# V2 local verification

External services are not verified by these tests. All test financial records and
provider responses are fictional fixtures. Live Nessie/NVIDIA/Photon checks remain
unverified because credentials/authorization are absent. No messages are sent.

Baseline: Python 92 passed / 1 skipped; frontend 157 passed / 2 skipped;
frontend and Photon TypeScript and production Node build passed. Checkpoint e8435ab.

Milestone gates below are recorded by `scripts/verify_v2.py` after actual execution.

## Milestone 1 - Nessie provenance

- `-m pytest tests -q`: PASS 94 passed, 1 skipped, 2 warnings in 7.10s
- `test --prefix frontend`: PASS Test Files  25 passed | 2 skipped (27); Tests  157 passed | 2 skipped (159)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS 
- `run check --prefix photon_service`: PASS 
- `run build --prefix frontend`: PASS 
- `scripts/local_smoke.py`: PASS 
- `diff --check`: PASS 
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).
