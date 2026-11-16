from fastapi.testclient import TestClient
from calculation_engine.security import SecuritySettings
from nemotron_agent.main import create_app

def test_explicit_demo_history_is_labeled_and_never_replayed(monkeypatch,tmp_path):
    monkeypatch.setenv('AGENT_DATA_SOURCE','demo');monkeypatch.setenv('PLUTUS_COUNCIL_ENABLED','0')
    monkeypatch.setenv('PLUTUS_NOTIFICATIONS_DB',str(tmp_path/'alerts.sqlite3'))
    app=create_app(settings=SecuritySettings(api_token='d'*48,customer_id='synthetic_demo'))
    with TestClient(app) as c:
        c.headers['Authorization']='Bearer '+'d'*48
        snapshot=c.get('/api/financial-data').json()
        assert snapshot['source']=='synthetic_demo'
        history=c.get('/api/history').json()['data']
        assert len(history['months'])==6
        assert all('Fictional' in r['description'] for r in history['transactions'])
        assert c.get('/api/financial-data').json()['data']['current_balance']==snapshot['data']['current_balance']
