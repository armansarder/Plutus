"""Real local HTTP wire, fictional records, no Nessie keys or external calls."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import pytest
from fastapi.testclient import TestClient
from calculation_engine.security import SecuritySettings
from calculation_engine import outbound
from nemotron_agent.main import create_app

def test_nessie_http_changes_and_failures(monkeypatch):
    state = {'balance': '100.00', 'fail': False}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            path = urlsplit(self.path).path
            self.send_response(503 if state['fail'] else 200)
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            data = ([{'_id': 'account', 'customer_id': 'customer', 'type': 'Checking',
                      'balance': state['balance']}] if path == '/customers/customer/accounts' else [])
            self.wfile.write(json.dumps(data).encode())
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    real_read = outbound.read_json_https
    # Only tests redirect the fixed Nessie origin to a local wire server.
    monkeypatch.setattr(outbound, 'validate_destination', lambda *a: None)
    def read(url, **kwargs):
        return real_read(f'http://127.0.0.1:{server.server_port}{urlsplit(url).path}', **kwargs)
    monkeypatch.setattr(outbound, 'read_json_https', read)
    monkeypatch.setenv('PLUTUS_DATA_MODE', 'nessie')
    monkeypatch.delenv('AGENT_DATA_SOURCE', raising=False)
    monkeypatch.delenv('FINPILOT_DATA_SOURCE', raising=False)
    monkeypatch.setenv('NESSIE_API_KEY', 'wire-test-only')
    monkeypatch.setenv('NESSIE_ACCOUNT_ID', 'account')
    monkeypatch.setenv('PLUTUS_COUNCIL_ENABLED', '0')
    auth = {'Authorization': 'Bearer ' + 'x' * 48}
    try:
        app = create_app(settings=SecuritySettings(api_token='x'*48, customer_id='customer'))
        app.state.history_source.cache_seconds = 0
        with TestClient(app) as client:
            for balance in ('100.00', '250.00'):
                state['balance'] = balance
                response = client.get('/api/financial-data', headers=auth)
                assert response.json()['data']['current_balance'] == balance
                assert response.json()['source'] == 'nessie_sandbox'
                assert client.get('/api/source', headers=auth).json()['label'] == 'Nessie Sandbox'
            state['fail'] = True
            for path in ('/api/financial-data', '/api/source', '/api/history'):
                assert client.get(path, headers=auth).status_code == 503
    finally:
        server.shutdown(); server.server_close(); thread.join()

def test_explicit_modes_fail_closed(monkeypatch):
    monkeypatch.setenv('PLUTUS_DATA_MODE', 'nessie')
    monkeypatch.setenv('AGENT_DATA_SOURCE', 'demo')
    with pytest.raises(ValueError, match='Conflicting'):
        create_app()
