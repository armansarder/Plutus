"""Production boundaries, exercised without keys or external providers."""
from fastapi.testclient import TestClient
from calculation_engine.security import SecuritySettings
from nemotron_agent.main import create_app
from calculation_engine.data_loader import FunctionAdapter
from nemotron_agent.main import demo_snapshot


def test_production_health_and_authenticated_financial_routes(monkeypatch):
    monkeypatch.setenv('PLUTUS_DEMO_MODE', 'true')
    monkeypatch.setenv('PLUTUS_COUNCIL_ENABLED', '0')
    monkeypatch.setenv('PLUTUS_ALERT_POLL_SECONDS', '0')
    monkeypatch.setenv('PLUTUS_DELIVERY_MODE', 'preview')
    settings = SecuritySettings(mode='production', api_token='x' * 48,
                                customer_id='synthetic_demo',
                                allowed_hosts=('api.example.com',))
    app = create_app(source=FunctionAdapter(demo_snapshot), settings=settings)
    with TestClient(app, base_url='https://api.example.com') as client:
        assert client.get('/health').json() == {'status': 'ok'}
        assert client.get('/api/financial-data').status_code == 401
        auth = {'Authorization': 'Bearer ' + 'x' * 48}
        result = client.get('/api/financial-data', headers=auth)
        assert result.status_code == 200
        assert result.json()['source'] == 'synthetic_demo'
        assert client.get('/docs', headers=auth).status_code == 404
        assert client.get('/api/notifications/operator/state', headers=auth).status_code == 404
        assert client.get('/api/financial-data', headers=auth,
                          follow_redirects=False).headers['cache-control'] == 'no-store'
    with TestClient(app, base_url='http://api.example.com') as client:
        assert client.get('/health').status_code == 200
        assert client.get('/api/financial-data', headers=auth).status_code == 400
