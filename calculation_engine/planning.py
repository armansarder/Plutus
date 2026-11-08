"""User-confirmed cash allocations; engine evidence, never inferred budgets."""
from calendar import monthrange
from datetime import timedelta
from decimal import Decimal
from pydantic import Field
from .models import Contract, Money, ResultMoney, Day
from .simulator import forecast_cash_flow


class CashPlanRequest(Contract):
    savings_target: Money = Field(ge=0, le=1000000)
    reserve: Money = Field(ge=0, le=1000000)
    essential_buffer: Money = Field(ge=0, le=1000000)


class CashPlanResult(Contract):
    customer_id: str
    currency: str
    snapshot_as_of: Day
    starting_balance: ResultMoney
    month: str
    horizon_end: Day
    planned_savings: ResultMoney
    reserve: ResultMoney
    essential_buffer: ResultMoney
    protected_amount: ResultMoney
    projected_minimum: ResultMoney
    available_flexible_spending: ResultMoney
    funding_gap: ResultMoney
    schedule_complete: bool = False
    assumptions: list[str]


def preview_cash_plan(snapshot, request):
    end = snapshot.as_of_date.replace(day=monthrange(snapshot.as_of_date.year, snapshot.as_of_date.month)[1])
    start = snapshot.as_of_date + timedelta(days=1 if snapshot.snapshot_basis=='intraday' else 0)
    if start <= end:
        forecast = forecast_cash_flow(snapshot, start, end)
        minimum = Decimal(forecast['minimum_balance'])
        headroom = minimum - request.reserve - request.essential_buffer - request.savings_target
    else:
        minimum, headroom = snapshot.current_balance, Decimal('0')
    return CashPlanResult(customer_id=snapshot.customer_id, currency=snapshot.currency,
        snapshot_as_of=snapshot.as_of_date, starting_balance=format(snapshot.current_balance,'.2f'),
        month=snapshot.as_of_date.strftime('%Y-%m'), horizon_end=end,
        planned_savings=format(request.savings_target,'.2f'), reserve=format(request.reserve,'.2f'),
        essential_buffer=format(request.essential_buffer,'.2f'), projected_minimum=format(minimum,'.2f'),
        protected_amount=format(request.reserve+request.savings_target+request.essential_buffer,'.2f'),
        available_flexible_spending=format(max(Decimal(0),headroom),'.2f'),
        funding_gap=format(max(Decimal(0),-headroom),'.2f'), assumptions=[
            'Savings is your chosen allocation, not a completed transfer or inferred bank savings balance.',
            'Flexible spending is conditional cash-flow headroom through this month end, after your reserve, savings target and additional essentials.',
            'The whole target is earmarked from the first modeled day; later income cannot fund an earlier shortfall.',
            'Only supplied dated events are modeled. Include unscheduled essentials in your additional essentials buffer; schedule completeness is unverified.',
            'Expense-before-income event minimums come from the existing deterministic engine.',
            'Plans are held only in this browser session and reset on refresh; no money moves.',
            *(['No remaining forecast days this month; flexible capacity is held at zero.'] if start>end else [])])
