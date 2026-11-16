from collections import Counter
from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest
from research.preview import preview,PreviewRequest,SyntheticEvent,assignment
from research.export_demo import export
from calculation_engine.security import SecuritySettings
from nemotron_agent.main import create_app

def test_conditions_hold_financial_truth_and_decision_fixed():
    outputs=[preview(PreviewRequest(scenario_id='tight_timing',seed=42,condition=c)) for c in ('direct','evidence','multi_agent','uncertainty')]
    assert len({v.instance_id for v in outputs})==1
    assert len({v.assigned_recommendation for v in outputs})==1
    assert all(v.financial_truth==outputs[0].financial_truth for v in outputs)
    assert len({v.explanation for v in outputs})==4
    assert outputs[0]==preview(PreviewRequest(scenario_id='tight_timing',seed=42))
    assert all(not v.collection_enabled and v.simulated_presentation for v in outputs)
    assert all(v.financial_truth.source.source=='research_scenario' for v in outputs)

def test_balanced_reproducible_allocation_and_synthetic_only_export(tmp_path):
    values=[assignment(i,42) for i in range(400)]
    assert Counter(values)=={c:100 for c in ('direct','evidence','multi_agent','uncertainty')}
    assert values==[assignment(i,42) for i in range(400)]
    assert values!=[assignment(i,43) for i in range(400)]
    rows=export(tmp_path,16,42)
    assert all(r['synthetic'] and r['consent_basis']=='test_data_only' for r in rows)
    assert (tmp_path/'synthetic-events.csv').is_file()
    with pytest.raises(ValidationError):SyntheticEvent(**{**rows[0],'synthetic':False})
    with pytest.raises(ValidationError):PreviewRequest(participant_name='forbidden')

def test_research_requires_private_authorization_and_explicit_enablement(monkeypatch,tmp_path):
    monkeypatch.setenv('AGENT_DATA_SOURCE','demo');monkeypatch.setenv('PLUTUS_COUNCIL_ENABLED','0')
    monkeypatch.setenv('PLUTUS_NOTIFICATIONS_DB',str(tmp_path/'separate.sqlite3'))
    monkeypatch.setenv('PLUTUS_PRIVATE_TOOLS','1');monkeypatch.setenv('PLUTUS_OPERATOR_TOKEN','o'*48)
    monkeypatch.setenv('PLUTUS_RESEARCH_ENABLED','0')
    app=create_app(settings=SecuritySettings(api_token='b'*48,customer_id='synthetic_demo'))
    with TestClient(app) as c:
        path='/api/research/preview'
        assert c.post(path,json={}).status_code==401
        c.headers['Authorization']='Bearer '+'b'*48
        assert c.post(path,json={}).status_code==403
        c.headers['X-Plutus-Operator']='o'*48
        assert c.post(path,json={}).status_code==404
        monkeypatch.setenv('PLUTUS_RESEARCH_ENABLED','1')
        response=c.post(path,json={})
        assert response.status_code==200 and response.json()['source']=='research_scenario'
        assert c.post('/api/research/events',json={}).status_code==404
