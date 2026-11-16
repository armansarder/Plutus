# Controlled fictional research pilot

This is infrastructure for a future university-reviewed study, not an active
participant experiment. It draws no conclusions about human trust or behavior.
No participant recruitment, banking credentials, personal data, response ingestion
or automatic research telemetry exists. The public recruiter demo leaves it off.

The optional private `/research` page uses the operator gateway (separate Basic
password and backend operator token). Set `PLUTUS_RESEARCH_ENABLED=1` on Python
only on a trusted private instance with `PLUTUS_PRIVATE_TOOLS=1` on both services.
Never enable those on the public recruiter deployment. `POST /api/research/preview`
requires the service bearer and the separate operator credential. Research previews
do not call the configured Nessie source, mutate demo state, or send model/messages.

`research/scenarios.json` is the versioned researcher configuration. Three fictional
personas model a comfortable buffer, tight timing, and a baseline shortfall, with
fixed UTC dates, known obligations, income, purchase/reserve and historical spending.
The seed controls small explicit fictional spending variations. Historical spending
is never replayed into the starting balance. Rule-based generation, not a trained
model, owns these records. The existing Python engine owns every financial outcome.

`PreviewRequest` has experiment version, scenario ID, seed and condition. For a fixed
scenario/version/seed, the entire financial truth and recommended action are identical
across direct, evidence, simulated multi-agent and uncertainty-aware presentations.
Only text changes. The multi-agent treatment is explicitly templated/simulated;
it does not imply live Nemotron consultation. Public Council remains independent.

`assignment(slot, seed)` uses reproducible shuffled blocks of four synthetic slots,
one per condition. Slots are test indices, not participant identities. Adding a real
assignment service, approved consent flow, study-specific retention/access rules and
separate participant storage is future work requiring university authorization.

Configured future outcome variables include decision correctness, decision time,
trust/usefulness/confidence ratings and explanation acknowledgement. `SyntheticEvent`
currently permits only test-tagged shown/choice/acknowledgement records; real response
collection is deliberately unavailable. No production banking logs are used.

Offline pilot export (test/demo events only):

```sh
python -m research.export_demo --output private_data/research-demo --count 16 --seed 42
```

This writes CSV/JSON with `synthetic=true` and `consent_basis=test_data_only` in an
ignored directory. It never exports public-demo records or real responses. Backend
schemas are under `schemas/research-*.schema.json`; no public export endpoint exists.

Future extensions: validated scenario packs; approved participant workflow; properly
licensed resampling; CTGAN/TimeGAN only after statistical validity, temporal constraints
and data licensing are established. Large GAN training and 10,000-person avatar
generation are not part of this pilot.
