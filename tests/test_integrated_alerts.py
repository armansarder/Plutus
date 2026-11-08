"""Synthetic account-bound Photon integration. Never sends messages or writes Nessie."""
from decimal import Decimal
from datetime import timedelta
from copy import deepcopy
import pytest
from fastapi.testclient import TestClient
from calculation_engine.security import SecuritySettings
from nemotron_agent.main import create_app
from nemotron_agent.check import fixture
from notifications import evaluator

TOKEN='alert-test-service-token-'+'x'*40
AUTH={'Authorization':'Bearer '+TOKEN}
class Source:
    def __init__(self,customer='synthetic_demo',account='checking_one'):
        self.data=fixture();self.data.customer_id=customer;self.account_id=account;self.fail=False;self.calls=0
    def load(self):
        self.calls+=1
        if self.fail:raise ValueError('private upstream data')
        return self.data.model_copy(deep=True)

@pytest.fixture
def setup(tmp_path,monkeypatch):
    monkeypatch.setenv('PLUTUS_NOTIFICATIONS_DB',str(tmp_path/'alerts.sqlite3'))
    monkeypatch.setenv('PLUTUS_DELIVERY_MODE','preview')
    monkeypatch.setenv('PLUTUS_ALERT_POLL_SECONDS','0')
    monkeypatch.setenv('PLUTUS_COUNCIL_ENABLED','0')
    monkeypatch.setenv('AGENT_DATA_SOURCE','engine')
    monkeypatch.setenv('FINPILOT_DATA_SOURCE','mock')
    monkeypatch.delenv('FINPILOT_HISTORY_DIR',raising=False)
    source=Source()
    def make(src):return create_app(source=src,settings=SecuritySettings(api_token=TOKEN,customer_id=src.data.customer_id))
    app=make(source);client=TestClient(app);client.headers.update(AUTH)
    return source,app,client,make

WATCH={'label':'Laptop','amount_cents':40000,'reserve_cents':20000,'horizon_days':30}
def enable(client,**extra):
    prefs=client.get('/api/notifications/settings').json()['preferences']
    prefs.update(enabled=True,**extra)
    r=client.put('/api/notifications/settings',json=prefs)
    assert r.status_code==200

def test_same_engine_readiness_transition_and_duplicate_suppression(setup):
    src,app,c,_=setup
    assert c.get('/api/notifications/settings').json()['mode']=='preview'
    first=c.post('/api/notifications/watchlist',json=WATCH)
    assert first.status_code==200
    assert not first.json()['ready']
    assert c.post('/api/notifications/watchlist',json=WATCH).json()['id']==first.json()['id']
    assert len(c.get('/api/notifications/watchlist').json())==1
    enable(c)
    assert c.post('/api/notifications/check',json={}).json()['event_statuses']==[]
    src.data.current_balance=Decimal('3000.00')
    checked=c.post('/api/notifications/check',json={})
    assert checked.status_code==200
    result=checked.json()
    assert result['watchlist'][0]['ready']
    assert result['event_statuses']==['preview_only']
    # Same values and verdict as the existing v1 deterministic agent.
    old=c.post('/api/agent/run',json={'purchase_amount':'400.00','reserve':'200.00','horizon_days':30,'allow_model':False}).json()
    assert result['watchlist'][0]['minimum_balance']==next(s for s in old['scenarios'] if s['name']=='purchase')['forecast']['minimum_balance']
    assert result['watchlist'][0]['recommendation']==old['passport']['recommendation']
    assert c.post('/api/notifications/check',json={}).json()['event_statuses']==[]
    history=c.get('/api/notifications/history').json()
    assert len(history)==1 and history[0]['status']=='preview_only'
    assert 'Laptop' not in history[0]['text'] # no unnecessary record detail in outbound draft

def test_account_and_customer_ownership_and_forged_fields(setup):
    src,app,c,make=setup
    id=c.post('/api/notifications/watchlist',json=WATCH).json()['id']
    for source in [Source('other_customer'),Source(account='other_checking')]:
        other=TestClient(make(source));other.headers.update(AUTH)
        assert other.get('/api/notifications/watchlist').json()==[]
        assert other.delete('/api/notifications/watchlist/'+id).status_code==404
        assert not other.get('/api/notifications/settings').json()['preferences']['enabled']
    assert c.get('/api/notifications/watchlist?customer_id=other_customer').status_code==400
    assert c.post('/api/notifications/watchlist',json={**WATCH,'customer_id':'other_customer'}).status_code==422
    assert c.post('/api/notifications/watchlist',json={**WATCH,'amount_cents':True}).status_code==422
    assert c.post('/api/notifications/watchlist',json={**WATCH,'purchase_date':'2026-02-31'}).status_code==422
    assert TestClient(app).get('/api/notifications/settings').status_code==401

def test_source_failure_is_not_a_fake_success_and_preferences_still_work(setup):
    src,app,c,_=setup
    c.post('/api/notifications/watchlist',json=WATCH);enable(c)
    src.fail=True
    r=c.post('/api/notifications/check',json={})
    assert r.status_code==503 and 'private upstream data' not in r.text
    assert c.get('/api/notifications/history').json()==[]
    prefs=c.get('/api/notifications/settings').json()['preferences'];prefs['enabled']=False
    assert c.put('/api/notifications/settings',json=prefs).status_code==200

def test_preview_does_not_send_even_with_live_configuration(setup,monkeypatch):
    def forbidden(*args,**kw):raise AssertionError('No outbound delivery in preview')
    monkeypatch.setattr(evaluator,'urlopen',forbidden)
    monkeypatch.setenv('PHOTON_RECIPIENT_OPTED_IN','true')
    monkeypatch.setenv('PHOTON_TEST_RECIPIENT','+12125550123')
    monkeypatch.setenv('PHOTON_INTERNAL_SECRET','x'*40)
    assert evaluator.deliver_message('Test')=='preview_only'

def test_live_mode_requires_enrollment_and_reports_uncertain_delivery(setup,monkeypatch):
    src,app,c,_=setup
    c.post('/api/notifications/watchlist',json=WATCH)
    monkeypatch.setenv('PLUTUS_DELIVERY_MODE','photon')
    monkeypatch.setenv('PHOTON_RECIPIENT_OPTED_IN','false')
    prefs=c.get('/api/notifications/settings').json()['preferences'];prefs['enabled']=True
    assert c.put('/api/notifications/settings',json=prefs).status_code==422
    monkeypatch.setenv('PHOTON_RECIPIENT_OPTED_IN','true');monkeypatch.setenv('PHOTON_TEST_RECIPIENT','+12125550123');monkeypatch.setenv('PHOTON_INTERNAL_SECRET','x'*40)
    assert c.put('/api/notifications/settings',json=prefs).status_code==200
    calls=[]
    def timeout(*a,**kw):calls.append(1);raise TimeoutError()
    monkeypatch.setattr(evaluator,'urlopen',timeout)
    src.data.current_balance=Decimal('3000.00')
    assert c.post('/api/notifications/check',json={}).json()['event_statuses']==['delivery_unconfirmed']
    assert c.post('/api/notifications/check',json={}).json()['event_statuses']==[]
    assert len(calls)==1

def test_budget_uses_recorded_history_and_user_limit(setup):
    src,app,c,_=setup
    class History:
        spent='440.00'
        def load_raw(self):
            return {'customer_id':src.data.customer_id,'accounts':[{'_id':'a','type':'Checking','customer_id':src.data.customer_id}],
                    'purchases':[{'_id':'p','payer_id':'a','purchase_date':src.data.as_of_date.isoformat(),'amount':self.spent,'status':'completed','merchant_id':'m','_source_account_id':'a','_source_account_type':'Checking'}],
                    'merchants':[{'_id':'m','name':'Untrusted merchant','category':['groceries']}]}
    app.state.history_source=History()
    enable(c,budget_alerts=True,budget_limit_cents=50000,budget_category='Groceries')
    r=c.post('/api/notifications/check',json={}).json()
    assert r['budget']['spent_cents']==44000
    assert r['budget']['above'] and r['event_statuses']==['preview_only']
    assert c.post('/api/notifications/check',json={}).json()['event_statuses']==[]
    assert '440' not in c.get('/api/notifications/history').json()[0]['text']

def test_missing_history_is_an_explicit_limitation(setup):
    _,app,c,_=setup
    app.state.history_source=None
    enable(c,budget_alerts=True,budget_limit_cents=50000)
    r=c.post('/api/notifications/check',json={}).json()
    assert r['budget'] is None and r['budget_limitation']
    assert r['event_statuses']==[]

def test_watch_limits_removal_and_initially_ready_is_not_a_transition(setup):
    src,_,c,_=setup
    src.data.current_balance=Decimal('3000.00');enable(c)
    for i in range(10):assert c.post('/api/notifications/watchlist',json={**WATCH,'label':str(i)}).status_code==200
    assert c.post('/api/notifications/watchlist',json={**WATCH,'label':'extra'}).status_code==409
    assert c.post('/api/notifications/check',json={}).json()['event_statuses']==[]
    id=c.get('/api/notifications/watchlist').json()[0]['id']
    assert c.delete('/api/notifications/watchlist/'+id).status_code==200
    assert len(c.get('/api/notifications/watchlist').json())==9


def test_multiple_readiness_transitions_are_bounded_and_not_lost(setup):
    src,_,c,_=setup
    for i in range(5):assert c.post('/api/notifications/watchlist',json={**WATCH,'label':str(i)}).status_code==200
    enable(c);src.data.current_balance=Decimal('3000.00')
    first=c.post('/api/notifications/check',json={}).json()
    assert first['event_statuses']==['preview_only']*3
    assert first['deferred_notifications']==2
    second=c.post('/api/notifications/check',json={}).json()
    assert second['event_statuses']==['preview_only']*2
    assert len(c.get('/api/notifications/history').json())==5
    assert not c.post('/api/notifications/check',json={}).json()['event_statuses']


def test_submission_is_not_labeled_as_confirmed_delivery(setup,monkeypatch):
    monkeypatch.setenv('PLUTUS_DELIVERY_MODE','photon')
    monkeypatch.setenv('PHOTON_RECIPIENT_OPTED_IN','true');monkeypatch.setenv('PHOTON_TEST_RECIPIENT','+12125550123');monkeypatch.setenv('PHOTON_INTERNAL_SECRET','x'*40)
    class Sender:
        status=202
        def __enter__(self):return self
        def __exit__(self,*args):pass
    def accept(request,timeout):
        assert request.full_url=='http://127.0.0.1:8790/send'
        assert timeout==12
        return Sender()
    monkeypatch.setattr(evaluator,'urlopen',accept)
    assert evaluator.deliver_message('Generic account update')=='submitted_not_delivery_confirmed'
