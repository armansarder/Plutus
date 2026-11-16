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

## Milestone 2 - Financial Multiverse

- `-m pytest tests -q`: PASS 97 passed, 1 skipped, 2 warnings in 7.35s
- `test --prefix frontend`: PASS Test Files  26 passed | 2 skipped (28); Tests  159 passed | 2 skipped (161)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS 
- `run check --prefix photon_service`: PASS 
- `run build --prefix frontend`: PASS 
- `scripts/local_smoke.py`: PASS 
- `diff --check`: PASS 
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).

## Milestone 3 - durable alerts and private operator

- `-m pytest tests -q`: PASS 102 passed, 1 skipped, 2 warnings in 11.26s
- `test --prefix frontend`: PASS Test Files  27 passed | 2 skipped (29); Tests  160 passed | 2 skipped (162)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS 
- `run check --prefix photon_service`: PASS 
- `run build --prefix frontend`: PASS 
- `scripts/local_smoke.py`: PASS 
- `diff --check`: PASS 
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).

## Milestone 4 - production Council authorization and TLS

- `-m pytest tests -q`: PASS 104 passed, 1 skipped, 2 warnings in 8.03s
- `test --prefix frontend`: PASS Test Files  27 passed | 2 skipped (29); Tests  161 passed | 2 skipped (163)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS 
- `run check --prefix photon_service`: PASS 
- `run build --prefix frontend`: PASS 
- `scripts/local_smoke.py`: PASS 
- `scripts/production_tls_smoke.py`: PASS 
- `diff --check`: PASS 
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).

## Milestone 5 - isolated reproducible research pilot

- `-m pytest tests -q`: PASS 107 passed, 1 skipped, 2 warnings in 14.18s
- `test --prefix frontend`: PASS Test Files  28 passed | 2 skipped (30); Tests  162 passed | 2 skipped (164)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS 
- `run check --prefix photon_service`: PASS 
- `run build --prefix frontend`: PASS 
- `scripts/local_smoke.py`: PASS 
- `scripts/production_tls_smoke.py`: PASS 
- `diff --check`: PASS 
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).
