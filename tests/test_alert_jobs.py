import time
from fastapi.testclient import TestClient
from notifications.jobs import enqueue,process,recover,summaries,drain,initialize
from notifications.store import database,save_preferences
from notifications.models import Preferences
from calculation_engine.security import SecuritySettings
from calculation_engine.data_loader import FunctionAdapter
from nemotron_agent.main import create_app,demo_snapshot

def setup_db(monkeypatch,tmp_path):
    monkeypatch.setenv('PLUTUS_NOTIFICATIONS_DB',str(tmp_path/'jobs.sqlite3'))
    with database() as db:
        save_preferences(db,'owner',Preferences(enabled=True))
        return enqueue(db,'owner','stable-event','purchase_ready','Generic demo update')

def test_jobs_persist_deduplicate_backoff_and_bound_retries(monkeypatch,tmp_path):
    id=setup_db(monkeypatch,tmp_path)
    with database() as db:assert enqueue(db,'owner','stable-event','purchase_ready','Generic demo update')==id
    calls=[]
    def unavailable(text):calls.append(text);return 'sender_unavailable'
    clock=lambda:time.time()+10000
    for i in range(3):
        assert process(id,unavailable,clock)=='sender_unavailable'
        with database() as db:db.execute('UPDATE alert_jobs SET due=0 WHERE id=?',(id,))
    assert process(id,unavailable,clock) is None
    with database() as db:
        row=summaries(db,'owner')[0]
        assert row['status']=='failed' and row['attempts']==3
        assert db.execute('SELECT COUNT(*) FROM alert_attempts').fetchone()[0]==3
    assert len(calls)==3

def test_unknown_and_restart_never_retry_or_claim_delivered(monkeypatch,tmp_path):
    id=setup_db(monkeypatch,tmp_path)
    assert process(id,lambda text:'delivery_unconfirmed')=='delivery_unconfirmed'
    assert process(id,lambda text:(_ for _ in ()).throw(AssertionError())) is None
    with database() as db:
        db.execute("UPDATE alert_jobs SET status='submitting' WHERE id=?",(id,))
    recover()
    with database() as db:assert summaries(db,'owner')[0]['status']=='delivery_unconfirmed'

def test_mock_acceptance_and_preview_are_not_delivery(monkeypatch,tmp_path):
    id=setup_db(monkeypatch,tmp_path)
    assert process(id,lambda text:'submitted_not_delivery_confirmed')=='submitted_not_delivery_confirmed'
    with database() as db:assert summaries(db,'owner')[0]['status']=='provider_accepted'

def test_cancelled_disabled_and_foreign_jobs_do_not_send(monkeypatch,tmp_path):
    id=setup_db(monkeypatch,tmp_path)
    with database() as db:save_preferences(db,'owner',Preferences(enabled=False))
    assert process(id,lambda text:(_ for _ in ()).throw(AssertionError())) is None
    with database() as db:assert summaries(db,'owner')[0]['status']=='cancelled'
    assert drain(lambda text:(_ for _ in ()).throw(AssertionError()),'other')==[]

def test_operator_requires_both_service_and_private_credentials(monkeypatch,tmp_path):
    setup_db(monkeypatch,tmp_path)
    monkeypatch.setenv('PLUTUS_COUNCIL_ENABLED','0');monkeypatch.setenv('PLUTUS_PRIVATE_TOOLS','1')
    monkeypatch.setenv('PLUTUS_OPERATOR_TOKEN','o'*48)
    app=create_app(source=FunctionAdapter(demo_snapshot),settings=SecuritySettings(api_token='x'*48,customer_id='synthetic_demo'))
    with TestClient(app) as c:
        assert c.get('/api/operator/jobs').status_code==401
        c.headers['Authorization']='Bearer '+'x'*48
        assert c.get('/api/operator/jobs').status_code==403
        c.headers['X-Plutus-Operator']='o'*48
        assert c.get('/api/operator/jobs').json()=={'jobs':[]}
        assert c.post('/api/operator/jobs/'+'a'*32+'/retry',json={}).status_code==404
        assert c.post('/api/operator/evaluate',json={}).status_code==200
