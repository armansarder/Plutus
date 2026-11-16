"""Aligned alternative futures from one immutable snapshot and the existing engine."""
from datetime import timedelta
from decimal import Decimal
from typing import Annotated, Literal
from pydantic import Field
from .models import Contract, Money, Day, ResultMoney, ForecastResult, Transaction
from .simulator import forecast_cash_flow
from .provenance import SourceInfo, source_info

class HypotheticalExpense(Contract):
    date: Day
    amount: Annotated[Money, Field(gt=0, le=100000)]

class MultiverseRequest(Contract):
    purchase_amount: Annotated[Money, Field(gt=0, le=100000)]
    purchase_date: Day
    later_date: Day
    reserve: Annotated[Money, Field(ge=0, le=100000)] = Decimal('200.00')
    horizon_days: int = Field(default=30, ge=1, le=90, strict=True)
    stress_expense: Annotated[Money, Field(ge=0, le=100000)] = Decimal('200.00')
    extra_expenses: list[HypotheticalExpense] = Field(default_factory=list, max_length=20)

class Difference(Contract):
    date: Day
    balance_difference: ResultMoney

class Future(Contract):
    name: Literal['buy_now', 'buy_later', 'skip', 'unexpected_expense', 'delayed_income']
    applicable: bool
    maintains_reserve: bool
    first_reserve_breach: Day | None
    forecast: ForecastResult
    differences: list[Difference]

class MultiverseResponse(Contract):
    schema_version: Literal['1.0'] = '1.0'
    source: SourceInfo
    reserve: ResultMoney
    input: MultiverseRequest
    scenarios: list[Future]
    assumptions: list[str]

def compare_futures(snapshot, request, source):
    original = snapshot.model_copy(deep=True)
    start = original.as_of_date + timedelta(days=original.snapshot_basis == 'intraday')
    end = start + timedelta(days=request.horizon_days-1)
    if not start <= request.purchase_date <= request.later_date <= end:
        raise ValueError('Purchase dates must be ordered inside the forecast window')
    if any(not start <= event.date <= end for event in request.extra_expenses):
        raise ValueError('Hypothetical expenses must be inside the forecast window')
    income = min((e for e in original.upcoming_transactions if e.type=='income' and request.purchase_date<=e.date<=end), key=lambda e:(e.date,e.id), default=None)
    def forecast(name):
        data = original.model_copy(deep=True)
        def expense(day, amount, label):
            if not amount: return
            id = 'multiverse_'+label
            while any(e.id==id for e in data.upcoming_transactions): id += '_x'
            data.upcoming_transactions.append(Transaction(id=id, date=day, amount=-amount,
                description='Hypothetical '+label.replace('_',' '), type='expense', source_status='estimated'))
        for i,event in enumerate(request.extra_expenses): expense(event.date,event.amount,'additional_expense_'+str(i))
        if name!='skip': expense(request.later_date if name=='buy_later' else request.purchase_date,request.purchase_amount,'purchase')
        if name=='unexpected_expense': expense(request.purchase_date,request.stress_expense,'unexpected_expense')
        if name=='delayed_income' and income:
            next(e for e in data.upcoming_transactions if e.id==income.id).date += timedelta(days=3)
        return ForecastResult.model_validate(forecast_cash_flow(data,start,end))
    baseline = forecast('skip')
    results=[]
    for name in ('buy_now','buy_later','skip','unexpected_expense','delayed_income'):
        result = baseline if name=='skip' else forecast(name)
        breach = start if Decimal(result.starting_balance)<request.reserve else next((e.date for e in result.transaction_timeline if Decimal(e.balance)<request.reserve),None)
        results.append(Future(name=name,applicable=name!='delayed_income' or income is not None,
            maintains_reserve=Decimal(result.minimum_balance)>=request.reserve,first_reserve_breach=breach,
            forecast=result,differences=[Difference(date=p.date,balance_difference=format(Decimal(p.ending_balance)-Decimal(b.ending_balance),'.2f')) for p,b in zip(result.daily_balances,baseline.daily_balances)]))
    return MultiverseResponse(source=source_info(original,source), reserve=format(request.reserve,'.2f'),input=request,scenarios=results,
        assumptions=['Only supplied events are projected; missing obligations and schedule completeness remain unknown.',
        'The same snapshot, currency and date window are used for every future; expenses precede same-day income.',
        'Additional hypothetical expenses apply to every option, including skip. No source records are changed.',
        'The unexpected-expense future adds the selected stress amount on the purchase date; income delay is three days.',
        'Daily closing balances and event-level minima differ. Reserve preservation is not a guarantee of affordability.'])
