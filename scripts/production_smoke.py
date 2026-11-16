"""Read-only HTTP smoke checks; never prints financial records or credentials.

python scripts/production_smoke.py --web-url https://plutus-web.onrender.com \
    --api-url https://plutus-api.onrender.com --source nessie_sandbox
"""
import argparse
import sys
from urllib.parse import urlsplit
import httpx


def smoke(web_url, api_url, source, verify=True, built_assets=True):
    with httpx.Client(timeout=90, follow_redirects=False, trust_env=False, verify=verify) as client:
        for base in (web_url, api_url):
            response = client.get(base + '/health')
            assert response.status_code == 200 and response.json()['status'] == 'ok', 'health'
        for path in ('/', '/dashboard', '/simulator', '/cash-flow', '/talk', '/alerts'):
            response = client.get(web_url + path)
            assert response.status_code == 200 and 'text/html' in response.headers.get('content-type', ''), 'page ' + path
            assert 'Public fictional-customer demo' in response.text, 'demo label'
            assert 'Private Demo Operator Interface' not in response.text, 'operator UI'
            # Check a real built asset, rather than trusting only the SSR response.
            if path == '/' and built_assets:
                import re
                asset = re.search(r'(?:src|href)="(/assets/[^" ]+\.(?:js|css))"', response.text)
                assert asset and client.get(web_url + asset[1]).status_code == 200, 'built asset'
        for path in ('/operator', '/api/notifications/operator/state', '/research', '/api/operator/jobs'):
            assert client.get(web_url + path).status_code == 404, 'operator boundary'
        assert client.get(api_url + '/api/financial-data').status_code == 401, 'backend auth'
        response = client.get(web_url + '/api/financial-data')
        assert response.status_code == 200, 'financial proxy'
        snapshot = response.json()
        assert snapshot['source'] == source, 'source provenance'
        assert response.headers.get('cache-control') == 'no-store', 'cache policy'
        from datetime import date, timedelta
        start = date.fromisoformat(snapshot['data']['as_of_date'])
        if snapshot['data']['snapshot_basis'] == 'intraday':
            start += timedelta(days=1)
        response = client.post(web_url + '/api/simulate', json={
            'purchase_amount': '10.00', 'purchase_date': str(start)})
        assert response.status_code == 200, 'existing purchase simulator'
        response = client.post(web_url + '/api/forecast', json={
            'start_date': str(start), 'end_date': str(start + timedelta(days=6))})
        assert response.status_code == 200, 'forecast'
        response = client.post(web_url + '/api/agent/run', json={
            'purchase_amount': '10.00', 'reserve': '0.00', 'horizon_days': 7, 'allow_model': False})
        assert response.status_code == 200, 'agent'
        data = response.json()
        assert len(data['scenarios']) == 5, 'five scenarios'
        assert data['mode'] == 'deterministic_fallback', 'truthful fallback'
        assert not data['trust_shield']['payment_execution'], 'no payment'
        assert not data['trust_shield']['external_message_sent'], 'no delivery'
        response = client.post(web_url + '/api/multiverse', json={
            'purchase_amount':'10.00','purchase_date':str(start),'later_date':str(start+timedelta(days=3)),
            'reserve':'0.00','stress_expense':'200.00','horizon_days':7})
        assert response.status_code == 200 and len(response.json()['scenarios'])==5, 'Multiverse'
        assert client.get(web_url + '/api/history').status_code == 200, 'spending history'
        assert client.get(web_url + '/api/notifications/settings').status_code == 200, 'alerts'
        response=client.get(web_url + '/api/notifications/history')
        assert response.status_code==200 and isinstance(response.json(),list), 'notification history'
        assert client.get(web_url + '/api/v2/council/status').status_code == 200, 'council status'
        conversation=client.post(web_url+'/api/v2/conversations',json={'role':'council'})
        assert conversation.status_code==200,'signed Council session'
        result=client.post(web_url+'/api/v2/conversations/'+conversation.json()['id']+'/messages',json={
            'request_key':'smoke_request_123','message':'Review this fictional purchase',
            'analysis':{'purchase_amount':'10.00','horizon_days':7},'allow_model':False})
        assert result.status_code==200 and result.json()['mode']=='deterministic_only','grounded Council fallback'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web-url', required=True)
    parser.add_argument('--api-url', required=True)
    parser.add_argument('--source', choices=('nessie_sandbox', 'synthetic_demo'), required=True)
    args = parser.parse_args()
    try:
        for value in (args.web_url, args.api_url):
            parts = urlsplit(value)
            assert parts.scheme == 'https' or (parts.scheme == 'http' and parts.hostname in ('localhost', '127.0.0.1')), 'HTTPS URL required'
        smoke(args.web_url.rstrip('/'), args.api_url.rstrip('/'), args.source)
    except Exception:
        print('FAIL: production smoke check failed; inspect service status and configuration (payloads suppressed).', file=sys.stderr)
        sys.exit(1)
    print('PASS: pages, asset, health, auth, provenance, forecasts, five scenarios, alerts and operator boundaries')
