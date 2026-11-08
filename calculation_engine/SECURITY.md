# Security controls and deployment boundary

These changes reduce specific risks; no application can be guaranteed immune to
attack. The new security and Nessie tests have been written but **not run by the
coding agent**, as requested. Run the commands below before trusting this revision.

## Implemented

- Local mock mode without a token is restricted to loopback clients. The supplied
  launcher binds to `127.0.0.1` and disables forwarded-header trust.
- Optional local / mandatory production bearer authentication. Tokens must be at
  least 32 ASCII non-whitespace characters; comparison is constant-time. Generate
  random tokens, never dictionary phrases. Never put tokens in query parameters.
- One token authorizes one configured customer/source. Source output must match
  `FINPILOT_CUSTOMER_ID` or returns 403. Clients cannot select accounts, customers,
  file paths, source URLs, or banking keys. This is a single-customer tool service,
  not a multi-tenant identity system.
- Nessie and configured external-file modes require both a token and customer ID,
  even in local mode. Explicit source injection is a trusted Python integration
  interface, not an HTTP feature; protect it with the same settings.
- Explicit host and CORS origin allowlists; no wildcard hosts/origins, no CORS
  cookies. Only configured origins can read cross-origin responses, including
  errors. CORS does not replace authentication.
- Production rejects HTTP and disables Swagger, ReDoc, and OpenAPI routes.
  HSTS is sent for HTTPS responses. No automatic HTTP redirect that could carry a
  bearer token over plaintext; callers must start with HTTPS.
- Local documentation/schema routes contain no financial data and remain accessible
  so Swagger can load its Authorize button; the actual data/tool endpoints require
  the configured token. Documentation routes do not exist in production.
- Request headers and JSON bodies are checked before adapter access. Maximum body
  size 128 KiB, total body-read timeout 10 seconds, no compressed bodies, UTF-8 JSON
  only, no duplicate JSON keys or nonfinite JSON constants. Declared length and
  actual streamed size are checked. Duplicate sensitive headers are rejected.
  JSON numbers retain Decimal precision through request validation; tiny fractions
  of a cent cannot disappear through intermediate float rounding.
- Global token-bucket limit 120 requests/minute per worker, burst 120, including
  failed auth and documentation requests. No unbounded per-IP storage; no trust in
  client-supplied forwarded IPs. At most four active requests per worker; excess
  requests return 503. Slow uploads count against concurrency and time out.
- At most 1,000 upcoming and 2,000 historical transactions; 20 scenarios per call;
  100 unexpected expenses and 100 delays per scenario. Modified financial data
  must still meet the 1,000 upcoming-event limit. Forecast horizon remains bounded.
- At most 2 MiB per source file/upstream response; bounded file reads and streamed
  HTTP reads. HTTPS only, explicit allowed hosts, public DNS addresses only,
  no redirects, environment proxy variables ignored, TLS verification enabled.
  Only GET is implemented in the source HTTP helper.
- Safe JSON errors, no upstream bodies, exception traces, raw invalid financial
  inputs, file paths, or upstream URLs in API errors. JSON response models describe
  successes/errors in local OpenAPI and validate returned structure.
- `Cache-Control: no-store`, `nosniff`, frame denial, referrer and permissions
  policies. Production also adds a restrictive CSP. Swagger retains its normal
  development policy because its interactive page requires JavaScript.
- Secret/private-data paths excluded from Git. `.env.example` is documentation;
  the app does not automatically load `.env` files. Ignoring a file does not remove
  secrets already committed; rotate any exposed key and clean its history.

## Configure local authentication

In your activated PowerShell environment at the repository root:

```powershell
$env:FINPILOT_API_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(48))"
$env:FINPILOT_CUSTOMER_ID = 'synthetic-shiv-001'
$env:FINPILOT_ALLOWED_HOSTS = 'localhost,127.0.0.1'
$env:FINPILOT_CORS_ORIGINS = 'http://localhost:5173'
powershell -ExecutionPolicy Bypass -File calculation_engine\run.ps1 serve
```

Only set the CORS origin if that is the actual frontend origin. An environment
variable set in one terminal is not automatically available in an already-open
second terminal. For authenticated smoke checks, use the same parent environment
or securely configure the same token in the testing terminal. Do not paste it here.

For an authenticated request, build a header without printing the secret:

```powershell
$headers = @{ Authorization = "Bearer $env:FINPILOT_API_TOKEN" }
Invoke-RestMethod http://127.0.0.1:8000/api/financial-data -Headers $headers
```

For Swagger use its Authorize button with the bearer token. Never give Arman's
browser a shared server/service token for a public multi-user app; put this service
behind the team's authenticated backend and enforce per-user ownership there.

## Production requirements outside this Python app

Use `FINPILOT_MODE=production`, a randomly generated token, customer ID, explicit
deployment hostnames, and HTTPS origins. Production startup fails if required
configuration is absent. Supply secrets through the deployment secret manager.
Nessie key and FinPilot bearer token are separate secrets.

Terminate TLS at the hosting ingress or run Uvicorn with valid TLS certificates.
The bundled `run.ps1` is a **local-only launcher**, not a production deployment.
When terminating TLS upstream, configure Uvicorn to trust forwarded headers **only
from the actual ingress IPs**. The app does not accept arbitrary
`X-Forwarded-Proto`/`X-Forwarded-For` headers itself. Do not use a wildcard proxy
trust setting or directly expose the backend port beside that ingress.

At the ingress enforce request/header sizes, connection/idle timeouts, rate limits,
and a global concurrency limit. App limits are per process and reset on restart;
multiple workers need shared/edge rate limiting. Oversized headers and connection
floods can reach the HTTP server before ASGI application controls.

Set outbound network policy to permit only approved API destinations and deny
private/link-local/metadata networks. Application DNS screening is defense in depth;
DNS rebinding or a DNS resolver stall cannot be completely solved by the HTTP
host check. No URL supplied by an API caller is ever fetched.

Disable outbound HTTP wire/debug logging. Nessie's API uses a query key; logging
full URLs can expose it. Startup lowers HTTPX/httpcore logging verbosity, but an
external APM agent/proxy can still capture URLs. Configure URL-query redaction in
those systems. Never log Authorization headers or response bodies containing data.

Use separate services/tokens per customer for this prototype. Public multi-user
deployment needs the team's real identity provider, customer/account permissions,
key rotation and revocation, audit-log policy, and monitoring. This implementation
does not claim to supply that larger platform.

## Run the checks yourself

```powershell
python -m pip install -r calculation_engine\requirements-dev.txt
python -m pip check
powershell -ExecutionPolicy Bypass -File calculation_engine\run.ps1 test
python -m pip_audit
python -m bandit -r calculation_engine -x calculation_engine/test_simulator.py,calculation_engine/test_security.py,calculation_engine/smoke_http.py
```

Bandit and dependency audit findings require review; do not suppress them just to
obtain a green result. New tests mock all Nessie/network calls. They do not use a
real account or API key, and do not prove the deployed system has no vulnerabilities.

Restart the server after editing code, then run `run.ps1 smoke` in mock mode to
check actual HTTP and schema behavior. The smoke script deliberately asserts the
fixed mock customer's amounts; it is not a live Nessie test.

Before staging Git changes:

```powershell
git status --short
git diff --check
git diff --cached --stat
git diff --cached --name-only
```

Review the staged contents locally for secrets/private data and unrelated teammate
changes. Use a dedicated branch and the repository's secret-scanning/push-protection
features when available. Do not paste staged secrets into chat. Nothing has been
committed or pushed by this change.
