from copy import deepcopy
from fastapi.testclient import TestClient
from calculation_engine.data_loader import FunctionAdapter
from calculation_engine.main import create_app
from calculation_engine.planning import CashPlanRequest, preview_cash_plan
from calculation_engine.security import SecuritySettings
from nemotron_agent.check import fixture


def test_plan_uses_event_minimum_and_explicit_allocations_without_mutation():
    snapshot = fixture()
    original = deepcopy(snapshot)
    result = preview_cash_plan(snapshot,CashPlanRequest(savings_target='100.00',reserve='100.00',essential_buffer='50.00'))
    assert result.projected_minimum == '300.00'
    assert result.available_flexible_spending == '50.00'
    assert result.planned_savings == '100.00'
    assert result.protected_amount == '250.00'
    assert result.schedule_complete is False
    assert snapshot == original
    short = preview_cash_plan(snapshot,CashPlanRequest(savings_target='500.00',reserve='100.00',essential_buffer='0.00'))
    assert short.available_flexible_spending == '0.00'
    assert short.funding_gap == '300.00'


def test_cash_plan_is_authenticated_and_rejects_forged_source_and_amounts():
    token = 'cash-plan-test-token-'+'x'*40
    app = create_app(source=FunctionAdapter(fixture),settings=SecuritySettings(api_token=token))
    body={'savings_target':'100.00','reserve':'100.00','essential_buffer':'50.00'}
    with TestClient(app) as client:
        assert client.post('/api/cash-plan/preview',json=body).status_code == 401
        client.headers['Authorization']='Bearer '+token
        result = client.post('/api/cash-plan/preview',json=body)
        assert result.status_code == 200 and result.json()['available_flexible_spending']=='50.00'
        for update in [{'customer_id':'someone_else'},{'reserve':'-1.00'},{'savings_target':'NaN'},{'essential_buffer':True}]:
            assert client.post('/api/cash-plan/preview',json={**body,**update}).status_code == 422
