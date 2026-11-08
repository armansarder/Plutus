"""Opt-in, authenticated API checks against real read-only Nessie sandbox reads.

    PLUTUS_NESSIE_LIVE_CHECK=1 python -m pytest tests/test_nessie_live.py -q -s

The in-process FastAPI boundary still enforces its bearer token. No seed scripts,
Nessie writes, provider calls or customer financial records are printed.
"""
import os
from datetime import date, timedelta

import pytest


@pytest.mark.skipif(os.getenv('PLUTUS_NESSIE_LIVE_CHECK') != '1', reason='Nessie live verification is opt-in')
def test_authenticated_nessie_reads_across_all_financial_routes(monkeypatch):
    if not all(os.getenv(name) for name in ('NESSIE_API_KEY', 'FINPILOT_API_TOKEN', 'FINPILOT_CUSTOMER_ID')):
        pytest.skip('Nessie key, configured customer and service token are required')
    from fastapi.testclient import TestClient
    from nemotron_agent.main import create_app
    monkeypatch.setenv('AGENT_DATA_SOURCE', 'nessie')
    monkeypatch.setenv('FINPILOT_DATA_SOURCE', 'nessie')
    app = create_app()
    auth = {'Authorization': 'Bearer ' + os.environ['FINPILOT_API_TOKEN']}
    statuses = {}
    def check(condition, message):
        if not condition:
            raise AssertionError(message)
    with TestClient(app) as client:
        check(client.get('/api/financial-data').status_code == 401, 'Missing credentials must be rejected')
        response = client.get('/api/financial-data', headers=auth)
        statuses['/api/financial-data'] = response.status_code
        check(response.status_code == 200, 'Nessie snapshot request failed (no provider body is printed)')
        check(response.json()['source'] == 'nessie_sandbox', 'Backend did not select Nessie')
        data = response.json()['data']
        check(data['customer_id'] == os.environ['FINPILOT_CUSTOMER_ID'], 'Unexpected customer')
        when = date.fromisoformat(data['as_of_date']) + timedelta(days=1)
        purchase = {'purchase_amount': '1.00', 'purchase_date': when.isoformat()}
        requests = [
            ('/api/simulate', purchase),
            ('/api/compare', {'scenarios': [{**purchase, 'name': 'purchase'}, {**purchase, 'name': 'skip', 'purchase_amount': '0.00'}]}),
            ('/api/forecast', {'start_date': when.isoformat(), 'end_date': (when + timedelta(days=29)).isoformat()}),
            ('/api/agent/run', {**purchase, 'allow_model': False}),
        ]
        for path, body in requests:
            response = client.post(path, json=body, headers=auth)
            statuses[path] = response.status_code
            check(response.status_code == 200, path + ' failed (no provider body is printed)')
            result = response.json()
            if path == '/api/agent/run':
                check(result['provenance']['source'] == 'nessie_sandbox', 'Agent source mismatch')
                check(all(s['forecast']['customer_id'] == data['customer_id'] for s in result['scenarios']), 'Agent customer mismatch')
            else:
                check(result['data']['customer_id'] == data['customer_id'], 'Calculation customer mismatch')
        response = client.get('/api/history?months=12', headers=auth)
        statuses['/api/history'] = response.status_code
        check(response.status_code == 200, 'Nessie history request failed')
        check(response.json()['data']['customer_id'] == data['customer_id'], 'History customer mismatch')
    print('Authenticated Nessie route statuses:', statuses)
