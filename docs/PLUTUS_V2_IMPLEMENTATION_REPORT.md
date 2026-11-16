# Plutus V2 implementation report

## Free recruiter deployment follow-up

`render.free.yaml` adds two Free Web Services with no disk or hosted database;
the original paid `render.yaml` remains unchanged. Temporary SQLite lives under
`/tmp/plutus-demo` and is recreated after filesystem loss. Photon is preview-only
with no sender, credentials, opt-in or polling. Operator/research tools remain off.
The frontend and deterministic financial runtime are unchanged. See
`FREE_RENDER_DEPLOYMENT.md` for exact dashboard steps and the shared Free-hour,
cold-start and ephemeral-state limitations. `free_demo_smoke.py` tests production
TLS/authentication, history and startup twice with the database directory discarded
between runs; the normal HTTP suites cover the built website and calculations.
No standalone Spending Fingerprint route/component was found; existing spending
history views are preserved, not represented as a newly verified named feature.
Results appear under "Free recruiter deployment profile" in the test report.
No push, deployment, purchase or DNS changes were performed.

Branch: `feature/plutus-v2`. Original baseline: `1f7d8c510cab0cc2fab5800ca5ed51623d3b127f`.
All work is local. No push, merge, deployment, DNS change, real Photon message,
real customer data access, participant recruitment or response collection occurred.

## Milestones

| Milestone | Local status | Checkpoint |
| --- | --- | --- |
| Baseline preservation | Complete; original deployment blocker documented, not hidden | `e8435ab` |
| 1: Nessie provenance | Implemented and fixture/wire tested; live verification blocked by credentials | `2ca5bf8` |
| 2: Financial Multiverse | Implemented inside current Simulator, with deterministic daily/event evidence | `15c7971` |
| 3: Alerts/operator | Persistent jobs/attempts and authorized private controls; live delivery unverified | `92f5837` |
| 4: Council/reliability | Explicit fictional-demo authorization, separate signing key, production-mode TLS/auth smoke passed | `bdcbf81` |
| 5: Research pilot | Private seeded previews, fixed truth across conditions, test-only export; no human study | `b3aa7f8` |
| 6: Readiness | Local configuration/build/auth/integration prepared; hosted verification and deployment approval still required | `d1ffd82` |

## Major changes and preserved behavior

- Preserved original React/TanStack Start/Vite/Nitro styling/navigation, Dashboard,
  spending/history presentation, cash planning, original purchase simulator,
  Cash Flow, Council chats, Passport and Trust Shield. Existing engine/agent wire
  contracts remain available; new contracts are additive. No old frontend was merged.
- `calculation_engine/provenance.py`, `nessie_adapter.py` and source dependencies:
  explicit modes, safe metadata, source errors without substitution, selected-account
  ownership, intraday semantics, no history replay. A local HTTP fixture through
  actual FastAPI and Node verifies changed balance/history and source failure.
- `calculation_engine/multiverse.py`, `components/simulator/Multiverse.tsx`:
  one snapshot and bounded horizon, five ordinary/stress futures, daily balances,
  event minima, reserve breaches, backend differences, editable amount/dates/reserve/
  hypothetical setback, source notes, date inspection and accessible table. Historical
  Future Lab patterns from Raiyan's `97a08da` are selectively adapted with attribution.
- Multiverse can stage an ordinary purchase for explicit confirmation in Council
  through React memory. Council recalculates from a fresh snapshot and uses standard
  stresses; it does not silently reuse old evidence or custom Multiverse assumptions.
- `notifications/jobs.py`, `operator.py`, private gateway and operator workspace:
  persistent stable claims/jobs/attempts, atomic pre-send claim, safe bounded backoff,
  restart uncertainty, preference cancellation and scoped operator retry/cancel.
  The legacy shadow/bank-mutation routes are not installed. No receipt callback is
  available; provider acceptance is never labeled delivered.
- `council_api.py`/`councilProxy.server.ts`: public-fictional-demo policy with service
  bearer plus a separate signed guest session. Other sessions cannot read/cancel/
  hand off conversations. No private-banking login is claimed. Malformed provider
  output/evidence and unavailable models retain the existing explicit fallback.
- `research/`: versioned fictional scenarios, seeded spending, four presentation
  styles, engine-verified recommendations, reproducible balanced synthetic assignment,
  strict test-only event schema/CSV/JSON export. Research remains private and off
  publicly; no event ingestion or participant storage exists.
- `render.yaml`, public-origin canonicalization and reproducible smoke scripts:
  two Node/Python services, one backend worker, persistent disk for alert SQLite,
  server-only secrets, explicit fictional defaults, public liveness, disabled private
  tools and manual deploys. No production localhost assumption for banking/API traffic.
- Dependency maintenance: patched Vite 8.1.6 and Zod 4.6.7, with the typed client
  migrated without weakening schemas/tests. Photon retains SDK 12.15.0 with a
  patched OpenTelemetry core override. Both production npm audits return zero
  reported vulnerabilities; live sender behavior is still unverified.

Full changed-file inventory is reproducible with
`git diff --stat 1f7d8c5..HEAD` and the milestone commit stats. Typed schemas and
examples are in `schemas/` and `docs/V2_CONTRACTS.md`.

## Verification classification

| Workflow | Evidence | External status |
| --- | --- | --- |
| Fictional source -> Node/API -> simulator/Multiverse | Built Node HTTP smoke + UI/component tests + Python engine assertions | Local, no external provider |
| Nessie HTTP source -> FastAPI -> Node -> calculated result | Real loopback HTTP wire with fictional records; balance/history changes and source failure verified | Mock external API; not live Nessie |
| Selection -> Multiverse comparison/timeline | Backend/unit/component tests; original scenario routes retained | Local |
| Financial analysis -> Council -> grounded decision | Existing fake-provider orchestration tests, production signed-session/TLS smoke and model-disabled fallback | Mock/provider-disabled; NVIDIA live unverified |
| Alert trigger -> job/attempt -> preview/operator | Readiness transition tests, persistent SQLite restart/dedup/retry tests, private HTTP gateway/operator checks | Local preview/mocked acceptance; no live delivery |
| Research scenario -> condition -> preview | Fixed-truth/randomization/export tests and private Node/Python HTTP preview | Local fictional preview; not a participant study |

Actual counts and run outcomes are in `PLUTUS_V2_TEST_RESULTS.md`. Final full
regression is performed separately after milestone checks; passing unit tests alone
are not treated as provider verification. Existing opt-in live tests remain skipped.

Browser check: the built local Simulator's accessibility tree confirmed the existing
navigation, fictional source label and new Multiverse controls. The interactive
chart click could not complete because native input geometry was unavailable; a
subsequent action was denied by automatic approval review (Brave control not
approved). Browser-host automation was unavailable. No complete responsive/screenshot
verification or recruiter screenshot artifact is claimed. Native UI automation was
stopped; HTTP/component coverage remains separately verified.

## Limits and external blockers

1. Nessie/NVIDIA/Photon credentials are absent. Live Nessie reads, model protocol
   connectivity and authorized provider delivery remain unverified, not completed.
2. Render dashboard/schema acceptance, Linux runtime and external public HTTPS must
   be checked after explicit deployment approval. No shareable URL exists yet.
3. Topology is one backend instance/worker with disk-backed SQLite. Council memory
   expires on restart. Multi-instance coordination, durable chat history and real-user
   identity authentication are future work, not hidden guarantees.
4. Unknown schedules/fees/interest and missing income are disclosed; cash projections
   are conditional simulations, not financial guarantees or calibrated probabilities.
   Starting bank balance/known source obligations are displayed, never overwritten
   by UI edits. API extra expenses are explicit hypotheticals; arbitrary debt,
   investment, recurring-model inference and statistical predictions remain unsupported.
5. Safe public scenario sharing/export was optional and is not implemented. No raw
   account data or Passport is publicly shareable. Research export is synthetic only.
6. Retry safety is deliberately conservative: unknown submission outcomes require
   manual reconciliation. Photon receipt/idempotency support has not been invented.
7. Research multi-agent treatment is a simulated presentation, not a claim that live
   specialists ran. University approval/consent, separate participant storage and
   retention/access procedures are required before a real study.

Next publishing steps: review this branch, approve pushing it, approve the Render
plan/storage costs and deployment, follow DEPLOYMENT.md using exactly one setup
method, enter private configuration, then run the external HTTPS smoke before sharing.
Custom DNS and live messages require separate authorization.
