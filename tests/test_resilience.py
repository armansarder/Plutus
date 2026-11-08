"""Bounded stress checks: synthetic snapshots only; no provider or Nessie calls."""
import threading
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient

from calculation_engine.data_loader import FunctionAdapter
from calculation_engine.main import create_app
from calculation_engine.security import SecuritySettings
from nemotron_agent.check import fixture

TOKEN = 'resilience-test-token-' + 'x' * 40
AUTH = {'Authorization': 'Bearer ' + TOKEN}


def test_parallel_requests_are_bounded_and_server_recovers():
    entered, release = threading.Barrier(3), threading.Event()

    def slow_source():
        if not release.is_set():
            entered.wait(timeout=5)
            assert release.wait(timeout=10)
        return fixture()

    app = create_app(source=FunctionAdapter(slow_source),
                     settings=SecuritySettings(api_token=TOKEN, max_concurrent_requests=2))
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=2) as pool:
        pending = pool.submit(client.get, '/api/financial-data', headers=AUTH)
        # A single permitted blocked request, one further slot, and bounded rejections.
        other = pool.submit(client.get, '/api/financial-data', headers=AUTH)
        try:
            entered.wait(timeout=5)
            responses = [client.get('/api/financial-data', headers=AUTH) for _ in range(20)]
            assert all(r.status_code == 503 for r in responses)
            assert all(r.json()['error']['code'] == 'server_busy' for r in responses)
            assert all(r.headers['retry-after'] == '1' for r in responses)
        finally:
            release.set()
        assert pending.result(timeout=5).status_code == other.result(timeout=5).status_code == 200
        assert client.get('/api/financial-data', headers=AUTH).status_code == 200


def test_rate_limit_and_malformed_requests_stay_sanitized():
    app = create_app(source=FunctionAdapter(fixture), settings=SecuritySettings(
        api_token=TOKEN, requests_per_minute=10))
    with TestClient(app) as client:
        assert client.get('/api/financial-data').status_code == 401
        assert client.post('/api/simulate', headers=AUTH, json={'purchase_amount': 'NaN'}).status_code == 422
        statuses = [client.get('/api/financial-data', headers=AUTH).status_code for _ in range(30)]
        assert set(statuses) <= {200, 429}
        assert 200 in statuses and 429 in statuses
        response = client.get('/api/financial-data', headers=AUTH)
        assert response.status_code == 429 and response.headers['retry-after'] == '60'
        assert TOKEN not in response.text


def test_source_outage_recovers_without_replacing_customer_or_data():
    available = False

    def source():
        if not available:
            raise RuntimeError('private-provider-secret')
        return fixture()

    app = create_app(source=FunctionAdapter(source), settings=SecuritySettings(api_token=TOKEN))
    with TestClient(app) as client:
        for _ in range(25):
            response = client.get('/api/financial-data', headers=AUTH)
            assert response.status_code == 503
            assert 'private-provider-secret' not in response.text
            assert 'data' not in response.json()
        available = True
        assert client.get('/api/financial-data', headers=AUTH).status_code == 200


def test_replayed_council_request_never_repeats_source_or_model_work(monkeypatch):
    from nemotron_agent.main import create_app as create_agent_app
    from nemotron_agent.council_store import session_signature
    monkeypatch.setenv('PLUTUS_COUNCIL_ENABLED', '1')
    reads = []

    def source():
        reads.append(1)
        return fixture()

    class NoModel:
        async def chat(self, *args, **kwargs):
            raise AssertionError('Disabled model must never execute')

    app = create_agent_app(source=FunctionAdapter(source), settings=SecuritySettings(api_token=TOKEN),
                           council_provider=NoModel())
    session = 'a' * 64
    auth = {**AUTH, 'X-Plutus-Session': session + '.' + session_signature(session, TOKEN)}
    body = {'request_key': 'replay_stress_001', 'message': 'Compare this purchase with keeping the reserve.',
            'allow_model': False, 'analysis': {'purchase_amount': '1.00',
                'purchase_date': '2026-11-08', 'horizon_days': 30, 'allow_model': False}}
    with TestClient(app) as client:
        created = client.post('/api/v2/conversations', json={'role': 'council'}, headers=auth)
        assert created.status_code == 200
        path = '/api/v2/conversations/' + created.json()['id'] + '/messages'
        first = client.post(path, json=body, headers=auth)
        assert first.status_code == 200
        for _ in range(60):
            repeated = client.post(path, json=body, headers=auth)
            assert repeated.status_code == 200
            assert repeated.json()['run_id'] == first.json()['run_id']
        assert len(reads) == 1
        assert client.post(path, json={**body, 'message': 'Different request'}, headers=auth).status_code == 409
