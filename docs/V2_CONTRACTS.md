# V2 additive contracts

Existing v1 engine/agent and Council wire contracts remain compatible. New routes
require the same backend bearer token and are accessed through the Node proxy.
Money remains decimal strings in JSON; dates are UTC snapshot-based YYYY-MM-DD.

## Source record

`GET /api/source`: `schemas/source.schema.json`, generated from `SourceInfo`.
Example (fictional):

```json
{"source":"synthetic_demo","label":"Fictional Demo","snapshot_date":"2026-11-15","snapshot_id":"example-fingerprint","observed_at":"2026-11-15T00:00:00+00:00","cache_max_seconds":0,"schedule_complete":false}
```

`PLUTUS_DATA_MODE=demo|nessie` is optional explicit backend configuration. Existing
`AGENT_DATA_SOURCE`/`FINPILOT_DATA_SOURCE` remain supported. Conflicting settings
fail at startup; research cannot be selected as an account source. Nessie source
notes preserve sandbox, intraday, estimated schedule and 30-second cache limits.
The fingerprint is an identifier, not an authenticity signature. `observed_at` is
the cached wire-fetch timestamp for Nessie and generation time for a demo fixture.

The frontend's `remote` means connected to the selected backend source. It does
not certify Nessie access. No source failure changes the selected mode.

## Multiverse

`POST /api/multiverse`: strict schemas `multiverse-request.schema.json` and
`multiverse-response.schema.json`; Python models in `calculation_engine/multiverse.py`,
matching TypeScript validators in `types/multiverse.ts`. Example input:

```json
{"purchase_amount":"400.00","purchase_date":"2026-11-16","later_date":"2026-11-23","reserve":"200.00","stress_expense":"200.00","horizon_days":30,"extra_expenses":[]}
```

All five futures freeze one source snapshot; Python returns daily series,
event-level minima, first reserve breach, applicability and daily differences from
skip. No account balance/schedule is overwritten. Extra expenses are explicit
hypotheticals applying to all futures; stress expense applies only to its scenario.
Delays move the next eligible income three days; out-of-window income is clipped.
Equal purchase dates are allowed. Council remains a separately confirmed analysis
with a new snapshot; custom Multiverse changes are not silently handed off.
