"""Run from the repo root:  python -m pytest tests/test_history.py -v"""
from datetime import date

import pytest

from calculation_engine.history import RawDirHistorySource, build_history

CUSTOMER = '0898b0b0-88cc-4011-ba91-3057e1b480a0'
TOKEN = 'test-token-' + 'x' * 40
TODAY = date(2026, 11, 8)


@pytest.fixture
def source():
    return RawDirHistorySource('pipeline/data/raw', customer_id=CUSTOMER)


def test_monthly_totals_match_pipeline(source):
    months = {m['month']: m for m in build_history(source, today=TODAY)['months']}
    assert months['2026-09']['spending'] == '1476.00'
    assert months['2026-10']['spending'] == '1710.00'
    assert months['2026-11']['spending'] == '1015.00'
    assert months['2026-09']['income'] == '1200.00'
    assert months['2026-10']['income'] == '1800.00'


def test_transfers_are_not_spending_or_income(source):
    rows = build_history(source, today=TODAY)['transactions']
    transfers = [t for t in rows if t['is_transfer']]
    assert len(transfers) == 4
    assert not any(t['is_spending'] or t['is_income'] for t in transfers)


def test_month_filter_for_bar_click(source):
    result = build_history(source, month='2026-10', today=TODAY)
    assert result['selected_month'] == '2026-10'
    assert result['transactions'] and all(t['date'].startswith('2026-10') for t in result['transactions'])


def test_future_dated_rows_are_excluded(source):
    result = build_history(source, today=date(2026, 10, 15))
    assert all(t['date'] <= '2026-10-15' for t in result['transactions'])


def test_wrong_customer_is_rejected():
    with pytest.raises(ValueError):
        build_history(RawDirHistorySource('pipeline/data/raw', customer_id='someone-else'))


def test_history_endpoint_requires_auth_and_returns_data(source):
    pytest.importorskip('fastapi')
    from fastapi.testclient import TestClient
    from calculation_engine.data_loader import JsonFileAdapter
    from calculation_engine.main import create_app
    from calculation_engine.security import SecuritySettings

    app = create_app(source=JsonFileAdapter('unused.json'),
                     settings=SecuritySettings(api_token=TOKEN, customer_id=CUSTOMER),
                     history_source=source)
    client = TestClient(app)

    assert client.get('/api/history').status_code == 401

    auth = {'Authorization': f'Bearer {TOKEN}'}
    response = client.get('/api/history?months=6', headers=auth)
    assert response.status_code == 200
    data = response.json()['data']
    assert data['customer_id'] == CUSTOMER
    assert [m['month'] for m in data['months']][:2] == ['2026-09', '2026-10']

    assert client.get('/api/history?month=2026-13', headers=auth).status_code == 422
