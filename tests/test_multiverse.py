from datetime import timedelta
from decimal import Decimal
import pytest
from calculation_engine.multiverse import MultiverseRequest, compare_futures
from nemotron_agent.check import fixture
from calculation_engine.simulator import forecast_cash_flow

def test_futures_share_snapshot_and_engine_truth():
    snapshot=fixture();before=snapshot.model_dump_json()
    request=MultiverseRequest(purchase_amount='400.00',purchase_date=snapshot.as_of_date,later_date=snapshot.as_of_date+timedelta(days=7),reserve='200.00')
    result=compare_futures(snapshot,request,None)
    assert len(result.scenarios)==5 and snapshot.model_dump_json()==before
    baseline=next(s for s in result.scenarios if s.name=='skip')
    truth=forecast_cash_flow(snapshot,snapshot.as_of_date,snapshot.as_of_date+timedelta(days=29))
    from calculation_engine.models import ForecastResult
    assert baseline.forecast == ForecastResult.model_validate(truth)
    assert len({(s.forecast.start_date,s.forecast.end_date) for s in result.scenarios})==1
    for s in result.scenarios:
        assert len(s.forecast.daily_balances)==30
        assert s.maintains_reserve==(Decimal(s.forecast.minimum_balance)>=200)
        for p,b,d in zip(s.forecast.daily_balances,baseline.forecast.daily_balances,s.differences):
            assert Decimal(d.balance_difference)==Decimal(p.ending_balance)-Decimal(b.ending_balance)

def test_sparse_identical_dates_negative_and_expense_limits():
    snapshot=fixture();snapshot.upcoming_transactions=[];snapshot.current_balance=Decimal('100')
    request=MultiverseRequest(purchase_amount='200',purchase_date=snapshot.as_of_date,later_date=snapshot.as_of_date,stress_expense='0')
    result=compare_futures(snapshot,request,None)
    assert not result.scenarios[-1].applicable
    assert result.scenarios[0].forecast==result.scenarios[1].forecast
    assert result.scenarios[0].forecast.minimum_balance=='-100.00'
    assert result.scenarios[0].first_reserve_breach==snapshot.as_of_date
    snapshot.snapshot_basis='intraday'
    with pytest.raises(ValueError):compare_futures(snapshot,request,None)

def test_same_day_event_minimum_and_horizon_clipping():
    snapshot=fixture();day=snapshot.as_of_date
    from calculation_engine.models import Transaction
    snapshot.current_balance=Decimal('50')
    snapshot.upcoming_transactions=[Transaction(id='salary',date=day,description='Fictional income',amount='1000',type='income',source_status='estimated')]
    request=MultiverseRequest(purchase_amount='100',purchase_date=day,later_date=day,horizon_days=1,reserve='0')
    result=compare_futures(snapshot,request,None)
    assert result.scenarios[0].forecast.minimum_balance=='-50.00'
    assert result.scenarios[0].forecast.ending_balance=='950.00'
    assert result.scenarios[-1].forecast.ending_balance=='-50.00'
