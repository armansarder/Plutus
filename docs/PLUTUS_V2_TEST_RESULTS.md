# V2 local verification

## Credential-free development launcher

- Root command: `npm run dev:demo`; URL `http://127.0.0.1:8080/dashboard`.
- Reuses `start_local.py` and the existing fictional snapshot/engine; skips saved
  dotenv/provider settings, generates two server-only secrets and temporary SQLite.
- Actual npm launcher HTTP smoke: PASS (Node/Vite + FastAPI, dashboard, simulator,
  forecast, Multiverse, history, Council fallback, bearer rejection/private boundaries).
  Harness stops its owned process tree afterward; no external API or message used.
- Full Python suite: 110 passed, 1 skipped (one dependency deprecation warning).
- Launcher-focused Python tests: 7 passed.
- Full frontend suite: 166 passed, 2 skipped; TypeScript `--noEmit`: PASS.
- `git diff --check`: PASS. Both Render manifests unchanged; no `.env` written.
- This is HTTP verification of the development runtime, not a browser interaction
  or live provider verification claim. Existing production preview remains available.

External services are not verified by these tests. All test financial records and
provider responses are fictional fixtures. Live Nessie/NVIDIA/Photon checks remain
unverified because credentials/authorization are absent. No messages are sent.

Baseline: Python 92 passed / 1 skipped; frontend 157 passed / 2 skipped;
frontend and Photon TypeScript and production Node build passed. Checkpoint e8435ab.

Milestone gates below are recorded by `scripts/verify_v2.py` after actual execution.

Security maintenance: production `npm audit --omit=dev --json` initially reported
2 high frontend advisories (Vite/Zod) and 18 moderate Photon dependency findings.
After Vite 8.1.6, Zod 4.6.7 and the Photon OpenTelemetry core 2.12.0 override,
both production audits returned **0 vulnerabilities**. Photon SDK remains pinned
at its existing 12.15.0; imports/type checks pass without provider initialization.
This does not certify all development dependencies or live provider behavior.
Python `pip check` passed compatibility checks; no separate Python CVE audit is claimed.

Baseline-to-working-tree credential-pattern scan covered 86 changed/new files
before final dependency metadata changes and found no candidates. Actual env/key/
database artifacts are not tracked. Built public JS contained no server-secret
environment references. Pattern scans do not prove the whole original history safe.

Browser: local Simulator accessibility/navigation/source/controls observed.
Chart interaction and complete responsive screenshots remain unverified: native
input geometry was unavailable and further Brave control was denied by automatic
approval review. Browser automation host was unavailable. No screenshot pass claimed.

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

## Milestone 6 - production readiness

- `-m pytest tests -q`: PASS 108 passed, 1 skipped, 2 warnings in 9.11s
- `test --prefix frontend`: PASS Test Files  29 passed | 2 skipped (31); Tests  163 passed | 2 skipped (165)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS
- `run check --prefix photon_service`: PASS
- `run build --prefix frontend`: PASS
- `scripts/local_smoke.py`: PASS
- `scripts/production_tls_smoke.py`: PASS
- `scripts/nessie_wire_smoke.py`: PASS
- `scripts/check_render.mjs`: PASS
- `diff --check`: PASS
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).

## Milestone 6 - completed local readiness gates

- `-m pytest tests -q`: PASS 109 passed, 1 skipped, 2 warnings in 8.79s
- `test --prefix frontend`: PASS Test Files  29 passed | 2 skipped (31); Tests  163 passed | 2 skipped (165)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS
- `run check --prefix photon_service`: PASS
- `run build --prefix frontend`: PASS
- `scripts/local_smoke.py`: PASS
- `scripts/production_tls_smoke.py`: PASS
- `scripts/nessie_wire_smoke.py`: PASS
- `scripts/check_render.mjs`: PASS
- `diff --check`: PASS
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).

## Milestone 6 - readiness checkpoint validation

- `-m pytest tests -q`: PASS 109 passed, 1 skipped, 2 warnings in 8.90s
- `test --prefix frontend`: PASS Test Files  31 passed | 2 skipped (33); Tests  166 passed | 2 skipped (168)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS
- `run check --prefix photon_service`: PASS
- `run build --prefix frontend`: PASS
- `scripts/local_smoke.py`: PASS
- `scripts/production_tls_smoke.py`: PASS
- `scripts/nessie_wire_smoke.py`: PASS
- `scripts/check_render.mjs`: PASS
- `diff --check`: PASS
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).

## Milestone 6 - patched dependency readiness

- `-m pytest tests -q`: PASS 109 passed, 1 skipped, 2 warnings in 8.64s
- `test --prefix frontend`: PASS Test Files  31 passed | 2 skipped (33); Tests  166 passed | 2 skipped (168)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS
- `run check --prefix photon_service`: PASS
- `run build --prefix frontend`: PASS
- `scripts/local_smoke.py`: PASS
- `scripts/production_tls_smoke.py`: PASS
- `scripts/nessie_wire_smoke.py`: PASS
- `scripts/check_render.mjs`: PASS
- `diff --check`: PASS
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).

## Final system-wide regression

- `-m pytest tests -q`: PASS 109 passed, 1 skipped, 2 warnings in 8.91s
- `test --prefix frontend`: PASS Test Files  31 passed | 2 skipped (33); Tests  166 passed | 2 skipped (168)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS
- `run check --prefix photon_service`: PASS
- `run build --prefix frontend`: PASS
- `scripts/local_smoke.py`: PASS
- `scripts/production_tls_smoke.py`: PASS
- `scripts/nessie_wire_smoke.py`: PASS
- `scripts/check_render.mjs`: PASS
- `diff --check`: PASS
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).

## Free recruiter deployment profile

- `-m pytest tests -q`: PASS 109 passed, 1 skipped, 2 warnings in 9.27s
- `test --prefix frontend`: PASS Test Files  31 passed | 2 skipped (33); Tests  166 passed | 2 skipped (168)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS
- `run check --prefix photon_service`: PASS
- `run build --prefix frontend`: PASS
- `scripts/local_smoke.py`: PASS
- `scripts/production_tls_smoke.py`: PASS
- `scripts/nessie_wire_smoke.py`: PASS
- `scripts/check_render.mjs`: PASS
- `scripts/check_render_free.mjs`: PASS
- `scripts/free_demo_smoke.py`: PASS
- `diff --check`: PASS
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).

## Notification history concurrency recovery

- `-m pytest tests -q`: PASS 112 passed, 1 skipped, 2 warnings in 12.30s
- `test --prefix frontend`: PASS Test Files  31 passed | 2 skipped (33); Tests  169 passed | 2 skipped (171)
- `frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: PASS
- `run check --prefix photon_service`: PASS
- `run build --prefix frontend`: PASS
- `scripts/local_smoke.py`: PASS
- `scripts/production_tls_smoke.py`: PASS
- `scripts/nessie_wire_smoke.py`: PASS
- `scripts/check_render.mjs`: PASS
- `scripts/check_render_free.mjs`: PASS
- `scripts/free_demo_smoke.py`: PASS
- `diff --check`: PASS
- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).
