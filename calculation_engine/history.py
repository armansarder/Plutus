"""Read-only transaction history for charts (GET /api/history).

Kept separate from the simulator on purpose: historical transactions are already
reflected in the current balance, so they are NEVER added to upcoming_transactions.

Two interchangeable sources produce the same raw shape:
  NessieHistorySource  live GETs to Nessie (customer-ownership checked)
  RawDirHistorySource  pipeline/data/raw/*.json written by pipeline/extract.py
                       (offline development and demo backup)
"""
import json
import re
import threading
import time
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field

from .models import Contract, ResultMoney

TRANSACTION_KINDS = ('deposits', 'withdrawals', 'purchases', 'transfers', 'bills')
NESSIE_HOSTS = ('api.nessieisreal.com', 'prod-api.nessieisreal.com')
CASH_ACCOUNT_TYPES = ('Checking', 'Savings')

CATEGORY_MAP = {
    'food': 'Food', 'restaurant': 'Food', 'restaurants': 'Food', 'dining': 'Food',
    'groceries': 'Groceries', 'grocery': 'Groceries',
    'transport': 'Transport', 'gas': 'Transport', 'fuel': 'Transport',
    'shopping': 'Shopping', 'retail': 'Shopping',
    'subscriptions': 'Subscriptions', 'subscription': 'Subscriptions',
    'entertainment': 'Subscriptions', 'streaming': 'Subscriptions',
}
BILL_KEYWORDS = (('rent', 'Housing'), ('mortgage', 'Housing'), ('electric', 'Utilities'),
                 ('water', 'Utilities'), ('phone', 'Utilities'), ('internet', 'Utilities'),
                 ('insurance', 'Insurance'))
COUNTED_STATUSES = ('completed', 'executed')
ID_PATTERN = re.compile(r'[A-Za-z0-9_-]{1,128}')
CENT = Decimal('0.01')


# --------------------------------------------------------------------------- #
# Response contract
# --------------------------------------------------------------------------- #
Month = Annotated[str, Field(pattern=r'^\d{4}-(0[1-9]|1[0-2])$')]


class CategoryTotal(Contract):
    category: str
    amount: ResultMoney


class MonthSummary(Contract):
    month: Month
    spending: ResultMoney
    income: ResultMoney
    net: ResultMoney
    by_category: list[CategoryTotal]
    transaction_count: int


class HistoryTransaction(Contract):
    id: str
    account_type: str
    date: date
    amount: ResultMoney
    source: Literal['deposit', 'withdrawal', 'purchase', 'transfer', 'bill']
    merchant: str
    category: str
    description: str
    is_transfer: bool
    is_spending: bool
    is_income: bool


class HistoryResult(Contract):
    customer_id: str
    currency: str
    as_of_date: date
    months: list[MonthSummary]
    selected_month: Month | None = None
    transactions: list[HistoryTransaction]
    notes: list[str]


class HistoryResponse(Contract):
    data: HistoryResult


# --------------------------------------------------------------------------- #
# Sources (both return the same raw dict)
# --------------------------------------------------------------------------- #
def _check_accounts(accounts, customer_id):
    if not isinstance(accounts, list) or not accounts:
        raise ValueError('No accounts found for the configured customer')
    for a in accounts:
        if not isinstance(a, dict) or a.get('customer_id') != customer_id:
            raise ValueError('Account ownership does not match the configured customer')
        if not ID_PATTERN.fullmatch(str(a.get('_id', ''))):
            raise ValueError('Invalid account ID from source')
    if len({a['_id'] for a in accounts}) != len(accounts):
        raise ValueError('Duplicate account IDs from source')
    return [a for a in accounts if a.get('type') in CASH_ACCOUNT_TYPES]


def select_cash_account(accounts, customer_id, account_id=None):
    """No first-account guessing: an ambiguous selection must be configured."""
    cash = _check_accounts(accounts, customer_id)
    if account_id:
        matches = [a for a in cash if a['_id'] == account_id]
    else:
        matches = [a for a in cash if a['type'] == 'Checking'] or cash
    if len(matches) != 1:
        raise ValueError('Configure one owned Nessie Checking/Savings account explicitly')
    return matches[0]


@dataclass
class NessieHistorySource:
    api_key: str = field(repr=False)
    customer_id: str
    base_url: str
    cache_seconds: float = 60.0
    account_id: str | None = None
    select_single: bool = False
    _cache: tuple | None = field(default=None, repr=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def __post_init__(self):
        if not self.api_key or any(c.isspace() for c in self.api_key):
            raise ValueError('A server-side Nessie API key is required')
        if not ID_PATTERN.fullmatch(self.customer_id or ''):
            raise ValueError('Invalid configured customer ID')
        if self.account_id is not None and not ID_PATTERN.fullmatch(self.account_id):
            raise ValueError('Invalid configured account ID')
        if self.base_url not in tuple('https://' + host for host in NESSIE_HOSTS):
            raise ValueError('Use an explicit supported Nessie HTTPS origin without a trailing slash')

    def _get(self, path, *, empty_on_404=False):
        from .outbound import read_json_https  # GET-only, allowlisted, size/time bounded
        return read_json_https(f'{self.base_url}{path}', allowed_hosts=NESSIE_HOSTS,
                               params={'key': self.api_key}, empty_on_404=empty_on_404)

    def load_raw(self):
        with self._lock:
            if (self._cache and time.monotonic() - self._cache[0] < self.cache_seconds
                    and self._cache[1]['fetched_at'][:10] == datetime.now(timezone.utc).date().isoformat()):
                return deepcopy(self._cache[1])
        available = self._get(f'/customers/{self.customer_id}/accounts')
        fetched_at = datetime.now(timezone.utc).isoformat()
        accounts = ([select_cash_account(available, self.customer_id, self.account_id)]
                    if self.select_single or self.account_id else _check_accounts(available, self.customer_id))
        raw = {'customer_id': self.customer_id, 'accounts': accounts}
        for kind in TRANSACTION_KINDS:
            rows = []
            for account in accounts:
                # Nessie returns 404 (not []) for some empty collections, e.g. transfers.
                records = self._get(f"/accounts/{account['_id']}/{kind}", empty_on_404=True)
                if not isinstance(records, list) or len(records) > 2000 or any(not isinstance(r, dict) for r in records):
                    raise ValueError('Invalid Nessie transaction collection')
                owner_key = {'purchases': 'payer_id', 'withdrawals': 'payer_id',
                             'deposits': 'payee_id', 'bills': 'account_id'}.get(kind)
                for record in records:
                    if owner_key and owner_key in record and record[owner_key] != account['_id']:
                        raise ValueError('Transaction belongs to a different account')
                    rows.append({**record, '_source_account_id': account['_id'],
                                 '_source_account_type': account['type']})
            raw[kind] = rows
        raw['merchants'] = self._get('/merchants', empty_on_404=True)
        if not isinstance(raw['merchants'], list) or any(not isinstance(r, dict) for r in raw['merchants']):
            raise ValueError('Invalid Nessie merchant collection')
        raw['fetched_at'] = fetched_at
        with self._lock:
            self._cache = (time.monotonic(), deepcopy(raw))
        return raw


@dataclass
class RawDirHistorySource:
    """Reads the files pipeline/extract.py saved. No network access."""
    path: str | Path
    customer_id: str

    def _read(self, name, default):
        file = Path(self.path) / f'{name}.json'
        if not file.exists():
            return default
        with file.open('rb') as stream:
            content = stream.read(4 * 1024 * 1024 + 1)
        if len(content) > 4 * 1024 * 1024:
            raise ValueError('History file exceeds size limit')
        return json.loads(content.decode('utf-8-sig'))

    def load_raw(self):
        accounts = _check_accounts(self._read('accounts', []), self.customer_id)
        raw = {'customer_id': self.customer_id, 'accounts': accounts}
        for kind in TRANSACTION_KINDS:
            raw[kind] = self._read(kind, [])
        raw['merchants'] = self._read('merchants', [])
        return raw


# --------------------------------------------------------------------------- #
# Normalization (mirrors pipeline/transform.py, pure Python, no pandas)
# --------------------------------------------------------------------------- #
def _amount(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
        raise ValueError('Invalid amount in source')
    amount = Decimal(str(value))
    if not amount.is_finite() or amount.copy_abs() > Decimal('1000000000000') or amount != amount.quantize(CENT):
        raise ValueError('Invalid amount in source')
    return abs(amount).quantize(CENT)


def _day(value):
    return date.fromisoformat(str(value)[:10])


def _clean_category(raw):
    if isinstance(raw, list):
        raw = raw[0] if raw else None
    if not raw:
        return 'Other'
    return CATEGORY_MAP.get(str(raw).strip().lower(), str(raw).strip().title()[:50])


def _bill_category(nickname):
    name = str(nickname or '').lower()
    return next((cat for key, cat in BILL_KEYWORDS if key in name), 'Bills')


def _text(value, default):
    text = str(value).strip() if value not in (None, '') else default
    return text[:200]


def normalize(raw):
    """Raw Nessie records -> one list of signed, categorized transactions."""
    account_ids = {a['_id'] for a in raw['accounts']}
    merchants = {m.get('_id'): m for m in raw.get('merchants', []) if isinstance(m, dict)}
    rows = []

    def add(r, *, id_, day, amount, source, merchant, category):
        if r.get('_source_account_id') not in account_ids:
            return  # never include records from accounts we did not verify
        rows.append({
            'id': str(id_), 'account_id': r['_source_account_id'],
            'account_type': r.get('_source_account_type', ''),
            'date': _day(day), 'amount': amount, 'source': source,
            'merchant': _text(merchant, source.title()), 'category': category,
            'description': _text(r.get('description') or r.get('nickname'), ''),
            'status': str(r.get('status', 'unknown')).lower(),
        })

    for r in raw.get('deposits', []):
        add(r, id_=r['_id'], day=r['transaction_date'], amount=_amount(r['amount']),
            source='deposit', merchant=r.get('description') or 'Deposit', category='Income')
    for r in raw.get('withdrawals', []):
        add(r, id_=r['_id'], day=r['transaction_date'], amount=-_amount(r['amount']),
            source='withdrawal', merchant=r.get('description') or 'Withdrawal', category='Cash')
    for r in raw.get('purchases', []):
        m = merchants.get(r.get('merchant_id'), {})
        add(r, id_=r['_id'], day=r['purchase_date'], amount=-_amount(r['amount']),
            source='purchase', merchant=m.get('name') or 'Unknown merchant',
            category=_clean_category(m.get('category')))
    for r in raw.get('transfers', []):
        add(r, id_=r.get('id') or r.get('_id'), day=r['transaction_date'],
            amount=-_amount(r['amount']), source='transfer',
            merchant=r.get('description') or 'Transfer', category='Transfer')
    for r in raw.get('bills', []):
        if str(r.get('status', '')).lower() != 'completed':
            continue  # 'recurring' bills are the future schedule, not history
        add(r, id_=r['_id'], day=r['payment_date'], amount=-_amount(r['payment_amount']),
            source='bill', merchant=r.get('payee') or r.get('nickname') or 'Bill',
            category=_bill_category(r.get('nickname')))

    rows = [r for r in rows if r['status'] != 'cancelled']
    seen, unique = set(), []
    for r in sorted(rows, key=lambda r: (r['date'], r['id'])):
        if r['id'] not in seen:
            seen.add(r['id'])
            unique.append(r)

    # Transfers: pair outgoing transfer with an incoming 'transfer' deposit (same date + amount).
    for r in unique:
        r['is_transfer'] = r['source'] == 'transfer'
    incoming = [r for r in unique if r['source'] == 'deposit'
                and 'transfer' in r['description'].lower()]
    for r in incoming:
        r['is_transfer'], r['category'] = True, 'Transfer'

    for r in unique:
        counted = r['status'] in COUNTED_STATUSES
        r['is_spending'] = counted and r['amount'] < 0 and not r['is_transfer']
        r['is_income'] = counted and r['amount'] > 0 and not r['is_transfer']
    return unique


def summarize(rows):
    months = {}
    for r in rows:
        key = r['date'].strftime('%Y-%m')
        m = months.setdefault(key, {'spending': Decimal(0), 'income': Decimal(0),
                                    'categories': {}, 'count': 0})
        m['count'] += 1
        if r['is_spending']:
            m['spending'] -= r['amount']
            m['categories'][r['category']] = m['categories'].get(r['category'], Decimal(0)) - r['amount']
        elif r['is_income']:
            m['income'] += r['amount']
    out = []
    for key in sorted(months):
        m = months[key]
        out.append({
            'month': key,
            'spending': format(m['spending'], '.2f'),
            'income': format(m['income'], '.2f'),
            'net': format(m['income'] - m['spending'], '.2f'),
            'by_category': [{'category': c, 'amount': format(a, '.2f')}
                            for c, a in sorted(m['categories'].items(), key=lambda kv: -kv[1])],
            'transaction_count': m['count'],
        })
    return out


def build_history(source, *, currency='USD', month=None, months_back=6, today=None):
    """Main entry point used by GET /api/history."""
    if month is not None and not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', month):
        raise ValueError('month must use YYYY-MM')
    today = today or datetime.now(timezone.utc).date()
    raw = source.load_raw()
    rows = [r for r in normalize(raw) if r['date'] <= today]  # history never includes the future
    summaries = summarize(rows)[-months_back:]
    visible = {s['month'] for s in summaries}
    if month is not None:
        visible = {month}
    transactions = [{
        'id': r['id'], 'account_type': r['account_type'], 'date': r['date'],
        'amount': format(r['amount'], '.2f'), 'source': r['source'],
        'merchant': r['merchant'], 'category': r['category'], 'description': r['description'],
        'is_transfer': r['is_transfer'], 'is_spending': r['is_spending'], 'is_income': r['is_income'],
    } for r in rows if r['date'].strftime('%Y-%m') in visible]
    return HistoryResult(
        customer_id=raw['customer_id'], currency=currency, as_of_date=today,
        months=summaries, selected_month=month, transactions=transactions,
        notes=['Historical transactions only; already reflected in the current balance.',
               'Transfers between own accounts are excluded from spending and income.',
               'Only completed/executed records count toward income or spending; pending records do not.',
               "Bills with status 'recurring' are future schedule, not history."],
    ).model_dump(mode='json')
