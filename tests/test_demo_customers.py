"""End-to-end synthetic Nessie REST fixtures; never seed or change sandbox records."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from calculation_engine.security import SecuritySettings, SecurityMiddleware
from calculation_engine.history import NessieHistorySource
from calculation_engine.nessie_adapter import NessieAdapter, DEFAULT_NESSIE_BASE_URL
from nemotron_agent.main import create_app
from nemotron_agent.demo_gateway import DemoGateway
from nemotron_agent.council_store import session_signature

TOKEN = 'test-service-token-'+'x'*40
TODAY = datetime.now(timezone.utc).date()
def day(n): return (TODAY+timedelta(days=n)).isoformat()

@pytest.fixture
def setup(monkeypatch):
    calls=[]
    def read(url, **kwargs):
        assert kwargs['params']=={'key':'fixture-only'}
        path=url.removeprefix(DEFAULT_NESSIE_BASE_URL); calls.append(path)
        if path.startswith('/customers/'):
            who=path.split('/')[2]
            return [{'_id':who+'_cash','customer_id':who,'type':'Checking','balance':'1000.00' if who=='alice' else '200.00'},
                    {'_id':who+'_save','customer_id':who,'type':'Savings','balance':'50.00'}]
        if path=='/merchants':return [{'_id':'grocer','name':'Fixture groceries','category':['groceries']}]
        account=path.split('/')[2]; kind=path.split('/')[-1]
        if kind=='bills':return [{'_id':'rent','account_id':account,'status':'pending','payment_date':day(2),'payment_amount':'300.00','nickname':'Rent'}]
        if kind=='purchases':return [{'_id':'purchase','payer_id':account,'status':'completed','purchase_date':day(0),'amount':'40.00' if account.startswith('alice') else '80.00','merchant_id':'grocer'}]
        if kind=='deposits':return [{'_id':'pay','payee_id':account,'status':'completed','transaction_date':day(0),'amount':'500.00' if account.startswith('alice') else '200.00'}]
        if kind=='withdrawals':return [{'_id':'cash','payer_id':account,'status':'completed','transaction_date':day(0),'amount':'20.00'}]
        if kind=='transfers':return [{'_id':'move','status':'completed','transaction_date':day(0),'amount':'10.00'}]
        if kind=='loans':return [{'_id':'loan','account_id':account,'type':'auto','status':'pending'}]
        raise AssertionError(path)
    monkeypatch.setattr('calculation_engine.outbound.read_json_https',read)
    monkeypatch.setenv('PLUTUS_COUNCIL_ENABLED','1')
    monkeypatch.setenv('AGENT_DATA_SOURCE','engine')
    monkeypatch.delenv('FINPILOT_HISTORY_DIR',raising=False)
    children={}
    def factory(profile,settings):
        raw=NessieHistorySource(api_key='fixture-only',customer_id=profile['customer_id'],base_url=DEFAULT_NESSIE_BASE_URL,select_single=True)
        source=NessieAdapter(api_key='fixture-only',account_id=None,customer_id=profile['customer_id'],base_url=DEFAULT_NESSIE_BASE_URL,raw_source=raw)
        app=create_app(source=source,settings=settings)
        app.state.history_source=raw;children[profile['id']]=app
        return app
    settings=SecuritySettings(api_token=TOKEN)
    gateway=DemoGateway([{'id':w,'label':w.title(),'customer_id':w} for w in ['alice','bob']],factory,settings)
    return gateway, TestClient(SecurityMiddleware(gateway,settings)), calls, children

def select(client,profile,old=None):
    h={'Authorization':'Bearer '+TOKEN}
    if old:h['X-Plutus-Profile-Session']=old
    res=client.post('/api/demo/session',json={'profile':profile},headers=h)
    assert res.status_code==200
    return res.headers['x-plutus-profile-session']

def auth(token):return {'Authorization':'Bearer '+TOKEN,'X-Plutus-Profile-Session':token}
def council_auth(token):
    s='a'*64
    return {**auth(token),'X-Plutus-Session':s+'.'+session_signature(s,TOKEN)}

def test_customer_snapshots_history_recommendations_and_logout(setup):
    gateway,client,calls,_=setup
    assert client.get('/api/demo/session').status_code==401
    assert client.get('/api/financial-data',headers={'Authorization':'Bearer '+TOKEN}).status_code==401
    a,b=select(client,'alice'),select(client,'bob')
    for token,who,balance in [(a,'alice','1000.00'),(b,'bob','200.00')]:
        snapshot=client.get('/api/financial-data',headers=auth(token)).json()['data']
        assert snapshot['customer_id']==who and snapshot['current_balance']==balance
        history=client.get('/api/history',headers=auth(token)).json()['data']
        assert history['customer_id']==who
        insights=client.get('/api/nessie/insights',headers=auth(token)).json()
        assert insights['income']==('500.00' if who=='alice' else '200.00')
        assert insights['spending']==('60.00' if who=='alice' else '100.00')
        assert insights['transfer_volume']=='10.00'
        assert insights['categories'][0]['amount']==('40.00' if who=='alice' else '80.00')
        assert insights['activity'][0]['amount'] in ('-40.00','-80.00','-20.00')
        assert len(insights['accounts'])==2 and sum(a['selected'] for a in insights['accounts'])==1
        assert insights['loan_status']=='available'
    body={'purchase_amount':'100.00','reserve':'100.00','horizon_days':10,'allow_model':False}
    ra=client.post('/api/agent/run',json=body,headers=auth(a)).json()
    rb=client.post('/api/agent/run',json=body,headers=auth(b)).json()
    assert ra['passport']['recommendation'] != rb['passport']['recommendation']
    assert ra['provenance']['source']==rb['provenance']['source']=='nessie_sandbox'
    assert ra['scenarios'][0]['forecast']['customer_id']=='alice'
    assert rb['scenarios'][0]['forecast']['customer_id']=='bob'
    assert client.delete('/api/demo/session',headers=auth(a)).status_code==200
    assert client.get('/api/financial-data',headers=auth(a)).status_code==401
    assert client.get('/api/financial-data',headers=auth(b)).status_code==200
    assert all(not p.startswith('/enterprise') for p in calls)

def test_conversations_cannot_cross_customers_or_reselected_sessions(setup):
    gateway,client,_,_=setup
    a,b=select(client,'alice'),select(client,'bob')
    c=client.post('/api/v2/conversations',json={'role':'budget'},headers=council_auth(a)).json()['id']
    assert client.get('/api/v2/conversations/'+c,headers=council_auth(a)).status_code==200
    assert client.get('/api/v2/conversations/'+c,headers=council_auth(b)).status_code==404
    next_a=select(client,'alice',a)
    assert client.get('/api/v2/conversations/'+c,headers=council_auth(a)).status_code==401
    assert client.get('/api/v2/conversations/'+c,headers=council_auth(next_a)).status_code==404

def test_confirmed_schedule_is_session_owned_and_changes_engine(setup):
    gateway,client,_,_=setup
    a,b=select(client,'alice'),select(client,'alice')
    event={'id':'payday','date':day(1),'description':'income','amount':'250.00','type':'income','source_status':'confirmed'}
    assert client.put('/api/demo/schedule',json={'events':[event]},headers=auth(a)).status_code==200
    sa=client.get('/api/financial-data',headers=auth(a)).json()['data']
    sb=client.get('/api/financial-data',headers=auth(b)).json()['data']
    assert len(sa['upcoming_transactions'])==len(sb['upcoming_transactions'])+1
    assert sa['upcoming_transactions'][-1]['source_status']=='estimated'
    request={'start_date':day(1),'end_date':day(10)}
    assert client.post('/api/forecast',json=request,headers=auth(a)).json()['data']['ending_balance']=='950.00'
    assert client.post('/api/forecast',json=request,headers=auth(b)).json()['data']['ending_balance']=='700.00'
    event['date']=day(0)
    assert client.put('/api/demo/schedule',json={'events':[event]},headers=auth(a)).status_code==422
    assert client.put('/api/demo/schedule',json={'events':[]},headers=auth(a)).status_code==200

def test_forgery_expiry_unauthorized_profile_and_bounds(setup):
    gateway,client,_,_=setup
    token=select(client,'alice')
    assert client.get('/api/financial-data',headers=auth('forged')).status_code==401
    assert client.post('/api/demo/session',json={'profile':'mallory'},headers=auth(token)).status_code==403
    assert client.post('/api/demo/session',json={'profile':'alice','customer_id':'bob'},headers=auth(token)).status_code==422
    assert client.get('/api/demo/session',headers={**auth(token),'Host':'evil.test'}).status_code==400
    assert client.post('/api/demo/session',content='x'*140000,headers={**auth(token),'Content-Type':'application/json'}).status_code==413
    gateway.sessions[gateway.key(token)]['expires']=0
    assert client.get('/api/financial-data',headers=auth(token)).status_code==401


def test_optional_loans_fail_independently_and_no_raw_provider_error_is_returned(setup,monkeypatch):
    _,client,_,children=setup
    a=select(client,'alice')
    source=children['alice'].state.history_source
    get=source._get
    def read(path,**kw):
        if path.endswith('/loans'):raise ValueError('secret-provider-payload')
        return get(path,**kw)
    monkeypatch.setattr(source,'_get',read)
    result=client.get('/api/nessie/insights',headers=auth(a))
    assert result.status_code==200
    assert result.json()['loan_status']=='unavailable'
    assert 'secret-provider-payload' not in result.text
    assert result.json()['spending']=='60.00'

def test_schedule_changes_invalidate_previous_council_evidence(setup):
    _,client,_,_=setup
    a=select(client,'alice')
    c=client.post('/api/v2/conversations',json={'role':'council'},headers=council_auth(a)).json()['id']
    body={'request_key':'request_key_one','message':'Compare purchase','allow_model':False,
          'analysis':{'purchase_amount':'100.00','reserve':'100.00','horizon_days':10,'allow_model':False}}
    result=client.post('/api/v2/conversations/'+c+'/messages',json=body,headers=council_auth(a))
    assert result.status_code==200
    snapshot=result.json()['snapshot_id']
    event={'id':'payday','date':day(1),'description':'income','amount':'250.00','type':'income','source_status':'confirmed'}
    assert client.put('/api/demo/schedule',json={'events':[event]},headers=auth(a)).status_code==200
    body.update(request_key='request_key_two',expected_snapshot_id=snapshot)
    assert client.post('/api/v2/conversations/'+c+'/messages',json=body,headers=council_auth(a)).status_code==409
