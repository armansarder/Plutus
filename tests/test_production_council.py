import pytest
from fastapi.testclient import TestClient
from calculation_engine.security import SecuritySettings
from nemotron_agent.main import create_app
from nemotron_agent.council_store import session_signature

def configuration(monkeypatch,tmp_path):
    for key in ('FINPILOT_DATA_SOURCE','PLUTUS_DATA_MODE'):monkeypatch.delenv(key,raising=False)
    monkeypatch.setenv('AGENT_DATA_SOURCE','demo');monkeypatch.setenv('PLUTUS_COUNCIL_ENABLED','1')
    monkeypatch.setenv('PLUTUS_PUBLIC_DEMO','1');monkeypatch.setenv('PLUTUS_SESSION_SECRET','s'*64)
    monkeypatch.setenv('PLUTUS_DELIVERY_MODE','preview');monkeypatch.setenv('PLUTUS_ALERT_POLL_SECONDS','0')
    monkeypatch.setenv('PLUTUS_NOTIFICATIONS_DB',str(tmp_path/'alerts.sqlite3'))
    return SecuritySettings(mode='production',api_token='b'*64,customer_id='synthetic_demo',allowed_hosts=('api.example.com',))

def test_production_guest_session_requires_both_signing_and_service_auth(monkeypatch,tmp_path):
    settings=configuration(monkeypatch,tmp_path);app=create_app(settings=settings)
    with TestClient(app,base_url='https://api.example.com') as c:
        path='/api/v2/conversations'
        assert c.post(path,json={'role':'council'}).status_code==401
        c.headers['Authorization']='Bearer '+'b'*64
        assert c.post(path,json={'role':'council'}).status_code==401
        identity='a'*64
        c.headers['X-Plutus-Session']=identity+'.'+session_signature(identity,'b'*64)
        assert c.post(path,json={'role':'council'}).status_code==401
        c.headers['X-Plutus-Session']=identity+'.'+session_signature(identity,'s'*64)
        result=c.post(path,json={'role':'council'});assert result.status_code==200
        id=result.json()['id']
        response=c.post(f'{path}/{id}/messages',json={'request_key':'production_123','message':'Review this fictional purchase','analysis':{'purchase_amount':'10.00'},'allow_model':False})
        assert response.status_code==200 and response.json()['mode']=='deterministic_only'
        other='c'*64;c.headers['X-Plutus-Session']=other+'.'+session_signature(other,'s'*64)
        assert c.get(path+'/'+id).status_code==404

def test_production_policy_fails_closed(monkeypatch,tmp_path):
    settings=configuration(monkeypatch,tmp_path)
    monkeypatch.setenv('PLUTUS_PUBLIC_DEMO','0')
    with pytest.raises(ValueError,match='Production Council'):create_app(settings=settings)
    monkeypatch.setenv('PLUTUS_PUBLIC_DEMO','1');monkeypatch.setenv('PLUTUS_DELIVERY_MODE','photon')
    with pytest.raises(ValueError,match='preview delivery'):create_app(settings=settings)
