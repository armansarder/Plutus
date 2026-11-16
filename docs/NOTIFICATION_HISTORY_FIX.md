# Local demo notification history

## Cause and request trace

`AlertsWorkspace` starts settings, watchlist and history React Query requests in
parallel; the application shell also requests financial/source information.
`notificationAdapter.history()` calls same-origin `/api/notifications/history`.
The Node `notificationsProxy.server.ts` validates the route and injects the
server-only bearer token. FastAPI authenticates, applies the configured-account
ownership dependency, then `notifications.store.history()` reads that account's
latest 100 SQLite notification events.

The existing store, scoped SQL bindings and empty-list response are correct. A
single request against the running demo returned `200 []`. Concurrent requests
reproduced history 503s. A deterministic backend regression test holds four source
requests open, confirms history returns `503` with code `server_busy`, releases
them, and confirms history immediately returns `200 []`. This is the existing
four-active-request security limit, not missing Photon credentials or a paid disk.
The Node proxy previously passed that 503 through, and history uses `retry:false`,
so the UI retained the error even after the transient page-load burst finished.

## Fix and boundaries

The Node proxy retries **only history GETs rejected with explicit `server_busy`**,
after 100, 250 and 500 ms (four total attempts maximum). All attempts retain the
same bearer, cancellation/deadline and response schema. Authentication, rate and
concurrency limits are unchanged. No retry is applied to alert writes/sends,
arbitrary 503s, malformed responses or storage failures. Exhausted capacity remains
an error. No failure is converted to an empty list.

No frontend layout changes were needed: a successful empty list already displays
"No notifications yet." Actual failures retain "History unavailable" and its
Retry button. Regression tests now assert both states and recovery.

`npm run dev:demo` already uses a launcher-owned temporary SQLite directory and
preview-only delivery with no sender credentials. A new full launcher invocation
creates a fresh database: settings and history reset. A backend restart that reuses
the same database path can retain records; this is intentionally not durable storage.

## Verification

- `scripts/dev_demo_smoke.py` starts the actual root npm command twice. Each cycle
  checks `200 []`, enables a tiny fictional grocery threshold, creates one engine-
  grounded preview alert, checks its stored `preview_only` history and verifies
  duplicate suppression. The next invocation starts with empty history again.
- Preview transport remains selected, recipient enrollment is absent, and no live
  messages or financial writes are performed. Both owned test process trees stop.
- The shared production/local HTTP smoke now checks notification history explicitly.
- Python tests cover the exact capacity rejection/recovery and a genuine database
  failure returning an error without disclosing the private path.
- Frontend tests cover bounded authenticated retry, real failures without retry,
  exhausted retries, the empty-state copy and error-to-success UI recovery.
- Full regression results are recorded in `PLUTUS_V2_TEST_RESULTS.md` under
  "Notification history concurrency recovery". No push or deployment occurred.
- Final full run: Python 112 passed / 1 skipped; frontend 169 passed / 2 skipped;
  both TypeScript checks, production build, local/TLS/Nessie-wire/Free-profile
  smoke checks and diff/credential-pattern checks passed.
- Restored the actual local demo at `http://127.0.0.1:8080/dashboard` afterward:
  history `200 []`, four concurrent history reads all 200, unauthenticated backend
  history 401, preview-only mode and notification preferences disabled.
