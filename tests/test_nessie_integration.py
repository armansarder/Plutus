"""Synthetic Nessie wire fixtures only. No remote credentials, writes or seed scripts."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from calculation_engine.history import NessieHistorySource, build_history, select_cash_account
from calculation_engine.nessie_adapter import DEFAULT_NESSIE_BASE_URL, NessieAdapter
from calculation_engine.security import SecuritySettings
from nemotron_agent.main import create_app

CUSTOMER = 'customer_one'
ACCOUNT = 'checking_one'
TOKEN = 'nessie-test-token-' + 'x' * 40


@pytest.fixture
def nessie(monkeypatch):
    today = datetime.now(timezone.utc).date()
    day = lambda offset: (today + timedelta(days=offset)).isoformat()
    accounts = [
        {'_id': ACCOUNT, 'customer_id': CUSTOMER, 'type': 'Checking', 'balance': '1250.25'},
        {'_id': 'savings_one', 'customer_id': CUSTOMER, 'type': 'Savings', 'balance': '999.00'},
    ]
    raw = {
        'purchases': [{'_id': 'purchase_past', 'payer_id': ACCOUNT, 'purchase_date': day(-2), 'amount': 40, 'status': 'completed', 'merchant_id': 'merchant_one'},
                      {'_id': 'purchase_future', 'payer_id': ACCOUNT, 'purchase_date': day(4), 'amount': 30, 'status': 'pending'}],
        'deposits': [{'_id': 'deposit_past', 'transaction_date': day(-2), 'amount': 1000, 'status': 'completed'},
                     {'_id': 'deposit_pending', 'transaction_date': day(-1), 'amount': 100, 'status': 'pending'},
                     {'_id': 'deposit_transfer', 'transaction_date': day(-2), 'amount': 70, 'status': 'completed', 'description': 'Transfer from savings'}],
        'withdrawals': [{'_id': 'withdrawal_past', 'payer_id': ACCOUNT, 'transaction_date': day(-2), 'amount': 20, 'status': 'completed'}],
        'transfers': [{'_id': 'transfer_past', 'transaction_date': day(-2), 'amount': 70, 'status': 'completed'}],
        'bills': [{'_id': 'bill_past', 'account_id': ACCOUNT, 'payment_date': day(-2), 'payment_amount': 50, 'status': 'completed'},
                  {'_id': 'bill_next', 'account_id': ACCOUNT, 'upcoming_payment_date': day(2), 'payment_amount': 110, 'status': 'recurring'},
                  {'_id': 'bill_stale', 'account_id': ACCOUNT, 'upcoming_payment_date': day(-1), 'recurring_date': 1, 'payment_amount': 900, 'status': 'recurring'},
                  {'_id': 'bill_once', 'account_id': ACCOUNT, 'payment_date': day(3), 'payment_amount': 15, 'status': 'pending'},
                  {'_id': 'bill_cancelled', 'account_id': ACCOUNT, 'upcoming_payment_date': day(2), 'payment_amount': 100, 'status': 'cancelled'}],
    }
    calls = []
    def read(url, **kwargs):
        assert url.startswith(DEFAULT_NESSIE_BASE_URL + '/')
        assert kwargs['params'] == {'key': 'test-private-key'}
        path = url.removeprefix(DEFAULT_NESSIE_BASE_URL)
        calls.append(path)
        if path == f'/customers/{CUSTOMER}/accounts':
            return deepcopy(accounts)
        if path == '/merchants':
            return [{'_id': 'merchant_one', 'name': 'Test groceries', 'category': ['groceries']}]
        if path.startswith(f'/accounts/{ACCOUNT}/'):
            return deepcopy(raw[path.rsplit('/', 1)[1]])
        raise ValueError('Unexpected read')
    monkeypatch.setattr('calculation_engine.outbound.read_json_https', read)
    for name in ['FINPILOT_UPCOMING_FILE', 'FINPILOT_HISTORY_DIR', 'FINPILOT_DATA_FILE', 'NESSIE_ACCOUNT_ID', 'NESSIE_BASE_URL']:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv('NESSIE_API_KEY', 'test-private-key')
    monkeypatch.setenv('AGENT_DATA_SOURCE', 'nessie')
    monkeypatch.setenv('FINPILOT_DATA_SOURCE', 'nessie')
    monkeypatch.setenv('FINPILOT_CURRENCY', 'USD')
    return {'accounts': accounts, 'raw': raw, 'calls': calls, 'day': day}


def app_for_customer():
    return create_app(settings=SecuritySettings(api_token=TOKEN, customer_id=CUSTOMER))


def test_all_routes_use_one_nessie_snapshot_and_account(nessie):
    app = app_for_customer()
    assert isinstance(app.state.financial_source, NessieAdapter)
    assert app.state.history_source is app.state.financial_source.raw_source
    auth = {'Authorization': 'Bearer ' + TOKEN}
    with TestClient(app) as client:
        assert client.get('/api/financial-data').status_code == 401
        response = client.get('/api/financial-data', headers=auth)
        assert response.status_code == 200
        assert response.json()['source'] == 'nessie_sandbox'
        snapshot = response.json()['data']
        assert snapshot['customer_id'] == CUSTOMER
        assert snapshot['current_balance'] == '1250.25'
        assert snapshot['snapshot_basis'] == 'intraday'
        assert snapshot['historical_transactions'] == []
        assert sorted(t['amount'] for t in snapshot['upcoming_transactions']) == ['-110.00', '-15.00']
        assert all(t['date'] > snapshot['as_of_date'] for t in snapshot['upcoming_transactions'])
        purchase = {'purchase_amount': '100.00', 'purchase_date': nessie['day'](1)}
        simulation = client.post('/api/simulate', json=purchase, headers=auth)
        assert simulation.status_code == 200
        assert simulation.json()['data']['ending_balance'] == '1025.25'
        comparison = client.post('/api/compare', json={'scenarios': [
            {**purchase, 'name': 'buy'}, {**purchase, 'name': 'later', 'purchase_date': nessie['day'](7)},
            {**purchase, 'name': 'skip', 'purchase_amount': '0.00'}]}, headers=auth)
        forecast = client.post('/api/forecast', json={'start_date': nessie['day'](1), 'end_date': nessie['day'](30)}, headers=auth)
        agent = client.post('/api/agent/run', json={**purchase, 'allow_model': False, 'horizon_days': 30}, headers=auth)
        for result in [simulation, comparison, forecast]:
            assert result.status_code == 200
            assert result.json()['data']['customer_id'] == CUSTOMER
        assert forecast.json()['data']['ending_balance'] == '1125.25'
        assert agent.status_code == 200
        result = agent.json()
        assert result['provenance']['source'] == 'nessie_sandbox'
        assert result['mode'] == 'deterministic_fallback'
        assert all(s['forecast']['customer_id'] == CUSTOMER for s in result['scenarios'])
        assert all(s['forecast']['starting_balance'] == '1250.25' for s in result['scenarios'])
        assert result['stress_tests_total'] == 1  # No invented future income.
        assert result['scenarios'][1]['forecast']['ending_balance'] == '1025.25'
        history = client.get('/api/history?months=12', headers=auth)
        assert history.status_code == 200
        rows = {t['id']: t for t in history.json()['data']['transactions']}
        assert rows['purchase_past']['amount'] == '-40.00'
        assert rows['purchase_past']['category'] == 'Groceries'
        assert not rows['deposit_pending']['is_income']
        assert not rows['deposit_transfer']['is_income']
        assert rows['transfer_past']['is_transfer']
        assert 'purchase_future' not in rows
        assert 'bill_next' not in rows
        assert 'bill_stale' not in rows
        assert history.json()['data']['customer_id'] == CUSTOMER
        assert client.post('/api/forecast', json={'start_date': nessie['day'](0), 'end_date': nessie['day'](1)}, headers=auth).status_code == 422
    # Cached records are reused, never another account or a seed/extraction write.
    assert len(nessie['calls']) == 7
    assert not any('/accounts/savings_one/' in path for path in nessie['calls'])


def test_ambiguous_selection_requires_account_id(nessie):
    nessie['accounts'].append({'_id': 'checking_two', 'customer_id': CUSTOMER, 'type': 'Checking', 'balance': '5.00'})
    with TestClient(app_for_customer()) as client:
        response = client.get('/api/financial-data', headers={'Authorization': 'Bearer ' + TOKEN})
        assert response.status_code == 503
    assert nessie['calls'] == [f'/customers/{CUSTOMER}/accounts']


def test_explicit_account_selection(nessie, monkeypatch):
    nessie['accounts'].append({'_id': 'checking_two', 'customer_id': CUSTOMER, 'type': 'Checking', 'balance': '5.00'})
    monkeypatch.setenv('NESSIE_ACCOUNT_ID', ACCOUNT)
    data = app_for_customer().state.financial_source.load()
    assert data.current_balance == Decimal('1250.25')


@pytest.mark.parametrize('selection', ['missing_account', 'credit_card', '../bad'])
def test_invalid_account_selection_fails_closed(nessie, monkeypatch, selection):
    nessie['accounts'].append({'_id': 'credit_card', 'customer_id': CUSTOMER, 'type': 'Credit Card', 'balance': '5.00'})
    monkeypatch.setenv('NESSIE_ACCOUNT_ID', selection)
    if selection == '../bad':
        with pytest.raises(ValueError): app_for_customer()
    else:
        with TestClient(app_for_customer()) as client:
            assert client.get('/api/financial-data', headers={'Authorization': 'Bearer ' + TOKEN}).status_code == 503


@pytest.mark.parametrize('bad', ['owner', 'balance', 'collection', 'bill_owner', 'precision'])
def test_source_errors_are_sanitized_and_never_fall_back(nessie, bad):
    if bad == 'owner': nessie['accounts'][0]['customer_id'] = 'someone_else'
    if bad == 'balance': nessie['accounts'][0]['balance'] = 'NaN'
    if bad == 'collection': nessie['raw']['deposits'] = {'error': 'test-private-key'}
    if bad == 'bill_owner': nessie['raw']['bills'][0]['account_id'] = 'someone_else'
    if bad == 'precision': nessie['raw']['bills'][1]['payment_amount'] = '1.001'
    with TestClient(app_for_customer()) as client:
        response = client.get('/api/financial-data', headers={'Authorization': 'Bearer ' + TOKEN})
        assert response.status_code == 503
        assert 'test-private-key' not in response.text
        assert 'synthetic_demo' not in response.text


def test_missing_credentials_and_conflicting_modes(nessie, monkeypatch):
    monkeypatch.delenv('NESSIE_API_KEY')
    with pytest.raises(ValueError, match='API key'): app_for_customer()
    monkeypatch.setenv('NESSIE_API_KEY', 'test-private-key')
    with pytest.raises(ValueError, match='FINPILOT_API_TOKEN'):
        create_app(settings=SecuritySettings(customer_id=CUSTOMER))
    with pytest.raises(ValueError, match='FINPILOT_CUSTOMER_ID'):
        create_app(settings=SecuritySettings(api_token=TOKEN))
    monkeypatch.setenv('AGENT_DATA_SOURCE', 'demo')
    with pytest.raises(ValueError, match='Conflicting'): app_for_customer()


def test_no_inferred_schedule_or_history_replay(nessie, monkeypatch):
    monkeypatch.setenv('FINPILOT_UPCOMING_FILE', 'pipeline-inferred-schedule.json')
    with pytest.raises(ValueError, match='Unset FINPILOT_UPCOMING_FILE'): app_for_customer()
    monkeypatch.delenv('FINPILOT_UPCOMING_FILE')
    nessie['raw']['bills'] = []
    data = app_for_customer().state.financial_source.load()
    assert data.current_balance == Decimal('1250.25')
    assert data.upcoming_transactions == []
    assert any('flat forecast' in note for note in data.source_notes)


def test_cache_does_not_return_expired_records_after_failure(nessie, monkeypatch):
    app = app_for_customer()
    data = app.state.financial_source.load()
    data.upcoming_transactions.clear()
    assert app.state.financial_source.load().upcoming_transactions  # Independent copies.
    app.state.history_source.cache_seconds = 0
    def failed(*args, **kwargs): raise ValueError('test-private-key must not be returned')
    monkeypatch.setattr('calculation_engine.outbound.read_json_https', failed)
    with TestClient(app) as client:
        response = client.post('/api/agent/run', json={'purchase_amount': '100.00', 'allow_model': False}, headers={'Authorization': 'Bearer ' + TOKEN})
        assert response.status_code == 503
        assert 'test-private-key' not in response.text


def test_customer_ownership_and_decimal_history_normalization(nessie):
    raw = app_for_customer().state.history_source.load_raw()
    raw['purchases'][0]['amount'] = '0.001'
    class Source:
        def load_raw(self): return raw
    with pytest.raises(ValueError): build_history(Source())
    with pytest.raises(ValueError): select_cash_account(nessie['accounts'], 'other_customer')


def test_nessie_transport_is_get_only_and_empty_404_is_explicit(monkeypatch):
    import httpx
    from calculation_engine.outbound import read_json_https
    monkeypatch.setattr('calculation_engine.outbound.validate_destination', lambda *args: None)
    calls = []
    def handler(request):
        calls.append(request.method)
        return httpx.Response(404)
    assert read_json_https(DEFAULT_NESSIE_BASE_URL + '/accounts/test/bills', allowed_hosts=('prod-api.nessieisreal.com',), transport=httpx.MockTransport(handler), empty_on_404=True) == []
    with pytest.raises(ValueError):
        read_json_https(DEFAULT_NESSIE_BASE_URL + '/accounts/test', allowed_hosts=('prod-api.nessieisreal.com',), transport=httpx.MockTransport(handler))
    assert calls == ['GET', 'GET']
