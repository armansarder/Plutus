"""Shared, strict adapter and HTTP contracts. Money is serialized as decimal strings."""
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator


def parse_money(value):
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise ValueError('Amount must be a decimal number')
    if len(str(value)) > 100:
        raise ValueError('Amount representation is too long')
    try:
        amount = Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError('Invalid amount') from exc
    if not amount.is_finite() or amount.copy_abs() > Decimal('1000000000000'):
        raise ValueError('Amount must be finite and at most 1 trillion in magnitude')
    if amount != amount.quantize(Decimal('0.01')):
        raise ValueError('Amounts must have at most two decimal places')
    return amount.quantize(Decimal('0.01'))


def parse_date(value):
    if type(value) is date:
        return value
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError('Date must use YYYY-MM-DD')
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError('Invalid calendar date') from exc
    if parsed.isoformat() != value:
        raise ValueError('Date must use YYYY-MM-DD')
    return parsed


Money = Annotated[Decimal, BeforeValidator(parse_money)]
Day = Annotated[date, BeforeValidator(parse_date)]
Text = Annotated[str, Field(min_length=1, max_length=200, strict=True)]
ResultMoney = Annotated[str, Field(pattern=r'^-?\d+\.\d{2}$')]


class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid', validate_default=True)


class Transaction(Contract):
    id: Text
    date: Day
    description: Text
    amount: Money
    type: Literal['income', 'expense']
    source_status: Literal['confirmed', 'estimated']

    @model_validator(mode='after')
    def signed_amount(self):
        if (self.type == 'income' and self.amount <= 0) or (
            self.type == 'expense' and self.amount >= 0
        ):
            raise ValueError('Income must be positive and expenses negative')
        if self.id.startswith('__'):
            raise ValueError('Transaction IDs starting with __ are reserved')
        return self


class FinancialData(Contract):
    customer_id: Text
    currency: Annotated[str, Field(pattern=r'^[A-Z]{3}$', strict=True)]
    as_of_date: Day
    current_balance: Money
    upcoming_transactions: list[Transaction] = Field(max_length=1000)
    historical_transactions: list[Transaction] = Field(default_factory=list, max_length=2000)
    snapshot_basis: Literal['opening', 'intraday'] = 'opening'
    source_notes: list[Text] = Field(default_factory=list, max_length=20)

    @model_validator(mode='after')
    def snapshot_contract(self):
        all_events = self.upcoming_transactions + self.historical_transactions
        if len({t.id for t in all_events}) != len(all_events):
            raise ValueError('Transaction IDs must be unique')
        if any(t.date < self.as_of_date for t in self.upcoming_transactions):
            raise ValueError('Upcoming transactions cannot precede the snapshot')
        if self.snapshot_basis == 'intraday' and any(
            t.date == self.as_of_date for t in self.upcoming_transactions
        ):
            raise ValueError('Intraday snapshots require upcoming events strictly after as_of_date')
        if any(t.date > self.as_of_date for t in self.historical_transactions):
            raise ValueError('Historical transactions cannot follow the snapshot')
        return self


class PurchaseRequest(Contract):
    purchase_amount: Annotated[Money, Field(ge=0)]
    purchase_date: Day


class ForecastRequest(Contract):
    start_date: Day
    end_date: Day


class IncomeDelay(Contract):
    transaction_id: Text
    new_date: Day


class Scenario(PurchaseRequest):
    name: Text
    delayed_income: list[IncomeDelay] = Field(default_factory=list, max_length=100)
    unexpected_expenses: list[Transaction] = Field(default_factory=list, max_length=100)


class CompareRequest(Contract):
    scenarios: Annotated[list[Scenario], Field(min_length=1, max_length=20)]


class TimelineEvent(Contract):
    id: str
    date: Day
    description: str
    amount: ResultMoney
    type: Literal['income', 'expense']
    source_status: Literal['confirmed', 'estimated']
    balance: ResultMoney


class Assumptions(Contract):
    snapshot: str
    same_day_order: str
    coverage: str
    estimated_transaction_ids: list[str]
    missing_information: list[str]
    currency_precision: str
    source_notes: list[str]
    scenario_changes: Scenario | None = None


class SimulationResult(Contract):
    customer_id: str
    currency: str
    as_of_date: Day
    starting_balance: ResultMoney
    ending_balance: ResultMoney
    minimum_balance: ResultMoney
    minimum_balance_date: Day
    shortfall_occurs: bool
    transaction_timeline: list[TimelineEvent]
    horizon_end: Day
    assumptions: Assumptions


class DailyBalance(Contract):
    date: Day
    ending_balance: ResultMoney


class ForecastResult(Contract):
    customer_id: str
    currency: str
    start_date: Day
    end_date: Day
    starting_balance: ResultMoney
    ending_balance: ResultMoney
    minimum_balance: ResultMoney
    minimum_balance_date: Day
    shortfall_occurs: bool
    transaction_timeline: list[TimelineEvent]
    daily_balances: list[DailyBalance]
    negative_balance_days: list[Day]
    minimum_daily_ending_balance: ResultMoney
    minimum_daily_ending_balance_date: Day
    assumptions: Assumptions


class ScenarioResult(SimulationResult):
    name: str


class ComparisonResult(Contract):
    customer_id: str
    currency: str
    horizon_end: Day
    scenarios: list[ScenarioResult]


class FinancialResponse(Contract):
    data: FinancialData
    source: Literal['nessie_sandbox', 'synthetic_demo', 'configured_backend'] = 'configured_backend'


class SimulationResponse(Contract):
    data: SimulationResult


class ForecastResponse(Contract):
    data: ForecastResult


class ComparisonResponse(Contract):
    data: ComparisonResult


class ErrorDetail(Contract):
    location: list[str | int]
    message: str


class ErrorBody(Contract):
    code: str
    message: str
    details: list[ErrorDetail] | None = None


class ErrorResponse(Contract):
    error: ErrorBody
