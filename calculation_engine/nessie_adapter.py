"""Read-only Capital One Nessie account snapshot; never executes bank operations."""
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable

from pydantic import BaseModel, ConfigDict, Field

from .data_loader import FinancialDataSource, load_financial_data
from .models import FinancialData, Money
from .outbound import read_json_https

NESSIE_HOSTS = ('api.nessieisreal.com', 'prod-api.nessieisreal.com')


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
    account_id: str
    customer_id: str
    base_url: str  # Explicitly supplied from the team's Nessie dashboard/docs.
    currency: str = 'USD'  # Nessie account response does not establish currency.
    upcoming_source: FinancialDataSource | None = None
    clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc)

    def __post_init__(self):
        if not self.api_key or any(c.isspace() for c in self.api_key):
            raise ValueError('A server-side Nessie API key is required')
        for value in (self.account_id, self.customer_id):
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value):
                raise ValueError('Invalid configured Nessie account/customer ID')
        if self.base_url not in tuple('https://' + host for host in NESSIE_HOSTS):
            raise ValueError('Use an explicit supported Nessie HTTPS origin without a trailing slash')

    def load(self):
        # Only one GET. No historical purchase/deposit replay and no bank write methods.
        raw = read_json_https(
            f'{self.base_url}/accounts/{self.account_id}', allowed_hosts=NESSIE_HOSTS,
            params={'key': self.api_key},
        )
        account = NessieAccount.model_validate(raw)
        if account.id != self.account_id or account.customer_id != self.customer_id:
            raise ValueError('Nessie account ownership does not match configuration')
        if account.type not in ('Checking', 'Savings'):
            raise ValueError('Cash-flow simulation requires a Checking or Savings account')
        now = self.clock()
        if now.tzinfo is None:
            raise ValueError('Snapshot clock must be timezone-aware')
        as_of = now.astimezone(timezone.utc).date()
        upcoming = []
        notes = [
            'Nessie current balance fetched at an intraday UTC snapshot.',
            'Currency is configured by the team; not inferred from Nessie.',
            'No Nessie purchases, deposits, transfers, bills, or pending items are replayed.',
            'No same-day forecast remainder or same-day purchase simulation is supported.',
        ]
        if self.upcoming_source is not None:
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
