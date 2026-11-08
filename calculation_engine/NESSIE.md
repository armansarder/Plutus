# Connecting Capital One Nessie

This integration means Capital One's Nessie banking **simulation API**, not the
unrelated Project Nessie data catalog. It reads a selected Checking/Savings account;
it never creates purchases, transfers, deposits, withdrawals, bills, or accounts.

Primary references:

- https://nessieisreal.com/docs — current Nessie dashboard/API documentation.
- https://github.com/nessieisreal/nessie-javascript-sdk/blob/master/lib/account.js
  — official SDK account GET route and `key` query authentication.
- https://github.com/nessieisreal/nessie-python-sdk — official Python SDK. Its
  historical HTTP/reimaginebanking configuration is not copied into this service.

## Implemented contract

`NessieAdapter` sends one authenticated HTTPS GET to `/accounts/{account_id}`.
It expects an account object containing `_id`, `customer_id`, `type`, and `balance`.
Extra account metadata is ignored. Both IDs are checked against server configuration,
and credit-card balances are rejected because debt is not a cash account balance.
Amounts pass the same strict Decimal validation as every other adapter.

Set the exact current HTTPS API origin provided by your Nessie dashboard. Supported
origins are `https://api.nessieisreal.com` and `https://prod-api.nessieisreal.com`.
There is no fallback to HTTP or automatic host switching. If the team's dashboard
uses a different origin, verify its ownership and API contract before updating the
explicit allowlist in `nessie_adapter.py`. No connectivity or actual account response
has been tested by the coding agent for this revision.

## Snapshot and future-event semantics

Nessie current balance is an **intraday snapshot**, with `as_of_date` recorded as
the UTC date when the account response was received, not a reconstructed opening
balance. `snapshot_basis=intraday` and `source_notes` expose that distinction.
Same-day purchases and forecasts starting on the snapshot date are rejected because
date-only events cannot identify which same-day postings are already included.
Use dates strictly after the current UTC snapshot date.

Historical purchases are already reflected in that balance. This adapter does not
fetch or subtract them again. Pending items, bills, recurring periods, or old deposits
are not automatically treated as future events. There is no inferred future paycheck.
Nessie does not establish currency in this account mapping; the team configures it
with `FINPILOT_CURRENCY` (defaults to USD, two-decimal precision).

With no schedule attached, the result has an empty future list and explicit missing
information. This is useful for testing the adapter, but cannot establish affordability
without future bills/income. Azzam can supply those events independently.

## Configure in your terminal

Do not paste your Nessie key into chat, code, a command literal, or Git. These commands
prompt without displaying it:

```powershell
$env:FINPILOT_DATA_SOURCE = 'nessie'
$env:FINPILOT_MODE = 'local'
$env:FINPILOT_API_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(48))"
$env:FINPILOT_CUSTOMER_ID = Read-Host 'Nessie customer ID'
$env:NESSIE_ACCOUNT_ID = Read-Host 'Nessie Checking or Savings account ID'
$env:NESSIE_BASE_URL = Read-Host 'Exact HTTPS API origin from your Nessie dashboard'
$nessieSecret = Read-Host 'Nessie sandbox API key' -AsSecureString
$env:NESSIE_API_KEY = [System.Net.NetworkCredential]::new('', $nessieSecret).Password
$env:FINPILOT_ALLOWED_HOSTS = 'localhost,127.0.0.1'
powershell -ExecutionPolicy Bypass -File calculation_engine\run.ps1 serve
```

Restart the old server first; it will not adopt new environment variables. From a
terminal with the same token, inspect the snapshot:

```powershell
$headers = @{ Authorization = "Bearer $env:FINPILOT_API_TOKEN" }
$snapshot = (Invoke-RestMethod http://127.0.0.1:8000/api/financial-data -Headers $headers).data
$snapshot | Select-Object customer_id, currency, as_of_date, current_balance, snapshot_basis
$purchaseDate = ([datetime]::ParseExact($snapshot.as_of_date, 'yyyy-MM-dd', $null)).AddDays(1).ToString('yyyy-MM-dd')
$body = @{ purchase_amount = '25.00'; purchase_date = $purchaseDate } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8000/api/simulate -Method Post -Headers $headers -ContentType 'application/json' -Body $body
```

Expected: HTTP 200, the configured customer, `snapshot_basis=intraday`, and a purchase
timeline whose balance reflects only fetched balance and the supplied future events.
With no schedule, ending balance equals the fetched balance minus 25.00. There is
no fixed expected live balance. Source/contract failures return sanitized HTTP 503;
they never silently switch to mock data.

## Connect Azzam's future schedule

Set `FINPILOT_UPCOMING_FILE` to an absolute path containing the shared FinancialData
contract. Put private integration fixtures under ignored
`calculation_engine/private_data/`, not in `mock_data.json`.

The schedule must match Nessie's customer, configured currency, and the current
UTC `as_of_date`; all future events must be strictly later than that date. The
schedule's `current_balance` and history are validated but **not applied**. Nessie
provides the actual snapshot balance. Stale/mismatched schedules fail closed.

For a Python function/API, inject the corresponding existing adapter as
`NessieAdapter(..., upcoming_source=FunctionAdapter(your_normalization_function))`
or `ApiAdapter(your_agreed_url, transform=normalize, allowed_hosts=(your_api_host,))`.
Pass that NessieAdapter to `create_app(..., settings=SecuritySettings(...))` with
matching customer ID and authentication. URLs, account IDs and keys stay server-side.

Use `source_notes` to communicate material upstream omissions. Output normalization
must not mark already-posted purchases as upcoming. This approach keeps financial
math unchanged regardless of the pipeline that supplies future events.

## Verification remaining

The new synthetic tests cover GET-only integration, ownership checks, credit-card
rejection, invalid balances, schedule mismatches, same-day rejection, and matching
simulation output for equivalent normalized data. You must run them, then perform
the authenticated live GET above with your sandbox account. Confirm its fields and
HTTPS API origin against the team's dashboard before teammate handoff.
