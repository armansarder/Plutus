"""Read-only Capital One Nessie account snapshot; never executes bank operations."""
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable

from pydantic import BaseModel, ConfigDict, Field

from .data_loader import FinancialDataSource, load_financial_data
from .models import FinancialData, Money, Transaction, parse_date, parse_money
from .outbound import read_json_https

NESSIE_HOSTS = ('api.nessieisreal.com', 'prod-api.nessieisreal.com')
DEFAULT_NESSIE_BASE_URL = 'https://prod-api.nessieisreal.com'


def scheduled_bills(raw, as_of, account_id):
    """Only source-dated next payments; never roll stale dates or infer recurrence."""
    events = []
    for bill in raw.get('bills', []):
        if bill.get('_source_account_id') != account_id:
            raise ValueError('Bill does not belong to the selected account')
        status = str(bill.get('status', '')).lower()
        if status not in ('pending', 'recurring'):
            continue
        when = bill.get('upcoming_payment_date')
        if not when and status == 'pending':
            when = bill.get('payment_date')
        if not when:
            continue
        day = parse_date(when)
        if day <= as_of:
            continue  # Same-day posting remainder and overdue-date rollover are unknown.
        bill_id = str(bill.get('_id', ''))
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', bill_id):
            raise ValueError('Invalid bill ID')
        amount = parse_money(bill.get('payment_amount'))
        if amount < 0:
            raise ValueError('Invalid scheduled bill amount')
        if amount:
            events.append(Transaction(
                id=f'nessie_bill_{bill_id}_{day.isoformat()}', date=day,
                description=str(bill.get('nickname') or bill.get('payee') or 'Scheduled bill')[:200],
                amount=-amount, type='expense', source_status='estimated'))
    return events


class NessieAccount(BaseModel):
    # Nessie metadata (nickname, rewards, etc.) is irrelevant to cash-flow math.
    model_config = ConfigDict(extra='ignore')
    id: str = Field(alias='_id', min_length=1)
    customer_id: str = Field(min_length=1)
    type: str
    balance: Money


@dataclass
class NessieAdapter:
    api_key: str = field(repr=False)
    account_id: str | None
    customer_id: str
    base_url: str  # Explicitly supplied from the team's Nessie dashboard/docs.
    currency: str = 'USD'  # Nessie account response does not establish currency.
    upcoming_source: FinancialDataSource | None = None
    clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc)
    raw_source: object | None = field(default=None, repr=False)

    def __post_init__(self):
        if not self.api_key or any(c.isspace() for c in self.api_key):
            raise ValueError('A server-side Nessie API key is required')
        for value in (self.customer_id, *([self.account_id] if self.account_id is not None else [])):
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value):
                raise ValueError('Invalid configured Nessie account/customer ID')
        if self.account_id is None and self.raw_source is None:
            raise ValueError('Account discovery requires a shared Nessie source')
        if self.base_url not in tuple('https://' + host for host in NESSIE_HOSTS):
            raise ValueError('Use an explicit supported Nessie HTTPS origin without a trailing slash')

    def load(self):
        records = None
        if self.raw_source is not None:
            records = self.raw_source.load_raw()
            if records.get('customer_id') != self.customer_id or len(records.get('accounts', [])) != 1:
                raise ValueError('Nessie must select exactly one configured customer account')
            raw = records['accounts'][0]
        else:
            raw = read_json_https(
                f'{self.base_url}/accounts/{self.account_id}', allowed_hosts=NESSIE_HOSTS,
                params={'key': self.api_key},
            )
        account = NessieAccount.model_validate(raw)
        if (self.account_id is not None and account.id != self.account_id) or account.customer_id != self.customer_id:
            raise ValueError('Nessie account ownership does not match configuration')
        if account.type not in ('Checking', 'Savings'):
            raise ValueError('Cash-flow simulation requires a Checking or Savings account')
        now = self.clock()
        if now.tzinfo is None:
            raise ValueError('Snapshot clock must be timezone-aware')
        as_of = now.astimezone(timezone.utc).date()
        if records is not None and records['fetched_at'][:10] != as_of.isoformat():
            raise ValueError('Nessie balance crossed the UTC date boundary; refresh the source')
        upcoming = []
        notes = [
            'Nessie sandbox data; this is a banking simulation API, not a real bank connection.',
            'Nessie current balance fetched at an intraday UTC snapshot.',
            'Currency is configured by the team; not inferred from Nessie.',
            'Historical transactions and same-day pending items are never replayed onto the current balance.',
            'No same-day forecast remainder or same-day purchase simulation is supported.',
        ]
        if records is not None:
            if self.upcoming_source is not None:
                raise ValueError('Do not combine inferred schedules with source-dated Nessie bills')
            upcoming = scheduled_bills(records, as_of, account.id)
            notes.extend([
                f'Selected {account.type} account; history uses the same account scope.',
                'Only explicitly dated future pending/recurring bill payments are projected; dates are source estimates.',
                'No paychecks, subscriptions or later recurring bill occurrences are inferred from history.',
                'Future income, unscheduled spending, budgets and protected savings are unknown.',
                'Historical detail is supplied by /api/history, not duplicated in this balance snapshot.',
                'Nessie records may be cached for up to 30 seconds; source failures never use expired records.',
            ])
            if not upcoming:
                notes.append('No eligible future bill dates supplied; a flat forecast is not evidence of affordability.')
        elif self.upcoming_source is not None:
            schedule = load_financial_data(self.upcoming_source)
            if (schedule.customer_id != account.customer_id or schedule.currency != self.currency
                    or schedule.as_of_date != as_of):
                raise ValueError('Schedule must match Nessie customer, currency, and current UTC snapshot date')
            upcoming = schedule.upcoming_transactions
            notes.append('Future events supplied separately; schedule balance/history are not applied.')
            notes.extend(schedule.source_notes[:10])
        else:
            notes.append('No future schedule supplied; future income and expenses are unknown.')
        return FinancialData(
            customer_id=account.customer_id, currency=self.currency, as_of_date=as_of,
            current_balance=account.balance, upcoming_transactions=upcoming,
            historical_transactions=[], snapshot_basis='intraday', source_notes=notes,
        )
