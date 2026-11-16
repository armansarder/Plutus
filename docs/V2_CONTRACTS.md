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
