from copy import deepcopy
from datetime import date
from decimal import Decimal
import pytest
from pipeline.populate_nessie import build_records, Sandbox, PREFIX, MERCHANTS


def test_population_plan_is_bounded_balanced_and_uniquely_marked():
    rows = build_records(date(2026, 11, 8))
    assert len(rows) == 50
    markers = [r['body'].get('description', r['body'].get('nickname')) for r in rows]
    assert len(set(markers)) == 50 and all(m.startswith(PREFIX) for m in markers)
    income = sum(Decimal(str(r['body']['amount'])) for r in rows if r['kind'] == 'deposits' and r['body']['status'] == 'completed')
    expenses = sum(Decimal(str(r['body'].get('amount',r['body'].get('payment_amount')))) for r in rows if r['kind'] != 'deposits' and r['body']['status'] == 'completed')
    assert income == expenses == Decimal('4800')
    assert sum(r['body']['status'] == 'pending' for r in rows) == 8


def test_population_resumes_without_duplicates_and_rejects_conflicts():
    class InMemory(Sandbox):
        def __init__(self):
            self.config = {'NESSIE_ACCOUNT_ID': 'test-account'}
            self.rows = {kind: [] for kind in ['deposits','purchases','bills','withdrawals']}
            self.merchants = [{'_id': key, 'name': f'{PREFIX} {key}'} for key in MERCHANTS]
            self.writes = []
        def existing(self, kind):
            return deepcopy(self.rows[kind])
        def save_receipt(self, row, body, response):
            pass
        def request(self, method, path, body=None):
            if path == '/merchants':
                assert method == 'GET'
                return self.merchants
            assert method == 'POST' and path.startswith('/accounts/test-account/')
            self.writes.append((path, deepcopy(body)))
            self.rows[path.rsplit('/',1)[1]].append(deepcopy(body))
            return {'code':201}
    sandbox = InMemory()
    records = build_records(date(2026,11,8))
    assert sum(sandbox.apply(records).values()) == 50
    assert sum(sandbox.apply(records).values()) == 0
    assert len(sandbox.writes) == 50
    bills = [body for path,body in sandbox.writes if path.endswith('/bills')]
    assert len(bills) == 12
    assert all('recurring_date' in body and 'upcoming_payment_date' not in body for body in bills)
    sandbox.rows['deposits'][0]['amount'] = 1601
    with pytest.raises(ValueError, match='differs'):
        sandbox.apply(records)
    assert len(sandbox.writes) == 50


def test_population_duplicate_markers_fail_closed():
    sandbox = object.__new__(Sandbox)
    row = build_records(date(2026,11,8))[0]
    sandbox.existing = lambda kind: [row['body'], row['body']]
    with pytest.raises(ValueError, match='Duplicate'):
        sandbox.remaining([row])
