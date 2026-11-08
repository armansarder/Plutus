"""Private, local-only operator controls for the Photon demonstration.

The default mode uses a repeatable SQLite shadow.  A separately enabled local
demo-mutation mode can post one allowlisted withdrawal/deposit to the configured
Nessie sandbox account, then refresh the same account snapshot used by alerts.
"""
import json
import os
import secrets
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Header, HTTPException
import httpx
from pydantic import BaseModel, ConfigDict, Field

from calculation_engine.data_loader import load_financial_data
from calculation_engine.nessie_adapter import NESSIE_HOSTS, NessieAdapter
from calculation_engine.outbound import validate_destination
from .store import database, now
from .evaluator import deliver_message


class SpendRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    amount_cents: int = Field(gt=0, le=10_000_000)


def initial_state(snapshot=None):
    if snapshot is None:
        as_of, balance, currency, scheduled = '2026-11-08', '900.00', 'USD', [
            {'id': 'rent', 'date': '2026-11-11', 'amount': '-900.00', 'type': 'expense'},
            {'id': 'pay_1', 'date': '2026-11-15', 'amount': '1300.00', 'type': 'income'},
            {'id': 'grocery', 'date': '2026-11-19', 'amount': '-150.00', 'type': 'expense'},
            {'id': 'utility', 'date': '2026-11-21', 'amount': '-120.00', 'type': 'expense'},
            {'id': 'pay_2', 'date': '2026-11-29', 'amount': '1300.00', 'type': 'income'},
        ]
    else:
        as_of = snapshot.as_of_date.isoformat()
        balance = format(snapshot.current_balance, '.2f')
        currency = snapshot.currency
        scheduled = [
            {'id': event.id, 'date': event.date.isoformat(), 'amount': format(event.amount, '.2f'),
             'type': event.type, 'description': event.description,
             'source_status': event.source_status}
            for event in snapshot.upcoming_transactions
        ]
    return {
        'asOf': as_of, 'balance': balance, 'currency': currency,
        'monthlyBudget': {'category': 'Groceries', 'allocatedCents': 50000,
                          'spentCents': 38000, 'thresholdPercent': 85,
                          'period': f'{as_of[:7]}', 'lastObservedAbove': False},
        'scheduled': scheduled, 'version': 1, 'lastEvaluation': None,
    }


def _ensure(db):
    db.executescript('''
        CREATE TABLE IF NOT EXISTS operator_demo_state (id INTEGER PRIMARY KEY, doc TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS operator_demo_watchlist (
          id TEXT PRIMARY KEY, label TEXT NOT NULL, amount_cents INTEGER NOT NULL,
          reserve_cents INTEGER NOT NULL, last_ready INTEGER NOT NULL DEFAULT 0,
          notified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS operator_demo_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, text TEXT NOT NULL,
          status TEXT NOT NULL, created_at TEXT NOT NULL
        );
    ''')
    if not db.execute('SELECT 1 FROM operator_demo_state WHERE id=1').fetchone():
        db.execute('INSERT INTO operator_demo_state(id,doc) VALUES (1,?)', (json.dumps(initial_state()),))
    if not db.execute('SELECT 1 FROM operator_demo_watchlist').fetchone():
        db.execute('INSERT INTO operator_demo_watchlist(id,label,amount_cents,reserve_cents,created_at) VALUES (?,?,?,?,?)',
                   ('demo-laptop', 'Laptop', 60000, 20000, now()))


def _state(db):
    _ensure(db)
    return json.loads(db.execute('SELECT doc FROM operator_demo_state WHERE id=1').fetchone()['doc'])


def _save(db, state):
    state['version'] = int(state.get('version', 1)) + 1
    state['lastEvaluation'] = now()
    db.execute('UPDATE operator_demo_state SET doc=? WHERE id=1', (json.dumps(state),))


def _watchlist(db, state):
    rows = db.execute('SELECT * FROM operator_demo_watchlist ORDER BY created_at').fetchall()
    result = []
    for row in rows:
        item = dict(row)
        balance = Decimal(state['balance']) - Decimal(item['amount_cents']) / 100
        minimum = balance
        for event in state['scheduled']:
            balance += Decimal(event['amount'])
            minimum = min(minimum, balance)
        ready = minimum >= Decimal(item['reserve_cents']) / 100
        result.append({**item, 'purchase_date': state['asOf'], 'horizon_days': 30,
                       'ready': ready, 'notified': bool(item['notified']),
                       'minimum_balance': format(minimum, '.2f'),
                       'reserve': format(Decimal(item['reserve_cents']) / 100, '.2f'),
                       'verdict': 'consider_purchase' if ready else 'reserve_at_risk'})
    return result


def _evaluate(db, state):
    events = []
    budget = state['monthlyBudget']
    percent = round(budget['spentCents'] * 100 / budget['allocatedCents'], 1)
    above = percent >= budget['thresholdPercent']
    if above and not budget['lastObservedAbove']:
        events.append(('budget_red_zone', f'Plutus budget alert: {budget["category"]} spending reached {percent}% of your monthly plan.'))
    budget['lastObservedAbove'] = above
    for item in _watchlist(db, state):
        if item['ready'] and not item['notified']:
            events.append(('purchase_opportunity', f'Plutus purchase update: Your saved {item["label"]} now meets your selected cash-reserve rule.'))
            db.execute('UPDATE operator_demo_watchlist SET last_ready=1, notified=1 WHERE id=?', (item['id'],))
        else:
            db.execute('UPDATE operator_demo_watchlist SET last_ready=? WHERE id=?', (int(item['ready']), item['id']))
    for kind, text in events:
        db.execute('INSERT INTO operator_demo_events(kind,text,status,created_at) VALUES (?,?,?,?)',
                   (kind, text, deliver_message(text), now()))
    _save(db, state)
    return events


def _live_mutations_enabled():
    return os.getenv('PLUTUS_DEMO_MUTATIONS', 'false').lower() == 'true'


def _live_snapshot(app):
    source = getattr(app.state, 'financial_source', None)
    if not isinstance(source, NessieAdapter):
        raise HTTPException(503, 'Live demo mutations require the Nessie data source')
    return load_financial_data(source)


def _refresh_nessie_cache(app):
    source = getattr(app.state, 'financial_source', None)
    history_source = getattr(app.state, 'history_source', None)
    for candidate in (source.raw_source if isinstance(source, NessieAdapter) else None, history_source):
        if candidate is not None and hasattr(candidate, '_cache'):
            candidate._cache = None


def _nessie_write(app, collection, payload):
    if not _live_mutations_enabled():
        return None
    source = getattr(app.state, 'financial_source', None)
    if not isinstance(source, NessieAdapter) or not source.account_id:
        raise HTTPException(503, 'Live demo mutations require an explicit Nessie account')
    validate_destination(source.base_url, NESSIE_HOSTS)
    url = f'{source.base_url}/accounts/{source.account_id}/{collection}'
    try:
        with httpx.Client(timeout=12, follow_redirects=False, trust_env=False) as client:
            response = client.post(url, params={'key': source.api_key}, json=payload,
                                   headers={'Accept': 'application/json', 'Content-Type': 'application/json'})
        if response.status_code not in (200, 201):
            raise HTTPException(502, 'Nessie rejected the demo mutation')
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, 'Nessie demo mutation is unavailable') from exc
    _refresh_nessie_cache(app)
    return response.status_code


def _sync_state_from_nessie(app, db, current=None):
    snapshot = _live_snapshot(app)
    state = initial_state(snapshot)
    if current is not None:
        state['monthlyBudget'] = current['monthlyBudget']
    db.execute('UPDATE operator_demo_state SET doc=? WHERE id=1', (json.dumps(state),))
    return state


def install_operator_demo(app):
    enabled = os.getenv('PLUTUS_DEMO_MODE', 'false').lower() == 'true'
    router = APIRouter(prefix='/api/notifications/operator', tags=['Private demo operator'])

    def authorize(token: str | None):
        if not enabled:
            raise HTTPException(404, 'Operator interface is unavailable')
        configured = os.getenv('PLUTUS_OPERATOR_SECRET', '')
        if not configured or not token or not secrets.compare_digest(token, configured):
            raise HTTPException(401, 'Invalid operator authorization token')

    @router.get('/state')
    def state(x_operator_token: str | None = Header(None)):
        authorize(x_operator_token)
        with database() as db:
            current = _state(db)
            budget = current['monthlyBudget']
            return {**current, 'budget': {**budget, 'percent': round(budget['spentCents'] * 100 / budget['allocatedCents'], 1),
                                          'above': budget['spentCents'] * 100 >= budget['allocatedCents'] * budget['thresholdPercent']},
                    'scheduledCount': len(current['scheduled'])}

    @router.get('/watchlist')
    def watchlist(x_operator_token: str | None = Header(None)):
        authorize(x_operator_token)
        with database() as db:
            current = _state(db)
            return _watchlist(db, current)

    @router.get('/history')
    def event_history(x_operator_token: str | None = Header(None)):
        authorize(x_operator_token)
        with database() as db:
            return [dict(row) for row in db.execute('SELECT id,kind,text,status,created_at FROM operator_demo_events ORDER BY id DESC LIMIT 100')]

    @router.post('/spend')
    def spend(body: SpendRequest, x_operator_token: str | None = Header(None)):
        authorize(x_operator_token)
        with database() as db:
            current = _state(db)
            _nessie_write(app, 'withdrawals', {
                'medium': 'balance', 'amount': format(Decimal(body.amount_cents) / 100, '.2f'),
                'transaction_date': date.today().isoformat(),
                'description': 'Plutus demo purchase',
            })
            if _live_mutations_enabled():
                current = _sync_state_from_nessie(app, db, current)
            current['monthlyBudget']['spentCents'] += body.amount_cents
            if not _live_mutations_enabled():
                current['balance'] = format(max(Decimal('0.00'), Decimal(current['balance']) - Decimal(body.amount_cents) / 100), '.2f')
            events = _evaluate(db, current)
            return {'action': 'spend', 'newSpentCents': current['monthlyBudget']['spentCents'], 'events': events}

    @router.post('/advance-payday')
    def advance_payday(x_operator_token: str | None = Header(None)):
        authorize(x_operator_token)
        with database() as db:
            current = _state(db)
            if _live_mutations_enabled():
                amount = os.getenv('PLUTUS_DEMO_PAYDAY_AMOUNT', '1300.00')
                try:
                    amount_decimal = Decimal(amount).quantize(Decimal('0.01'))
                except Exception as exc:
                    raise HTTPException(503, 'Invalid local demo payday amount') from exc
                if amount_decimal <= 0:
                    raise HTTPException(503, 'Invalid local demo payday amount')
                _nessie_write(app, 'deposits', {
                    'medium': 'balance', 'amount': format(amount_decimal, '.2f'),
                    'transaction_date': date.today().isoformat(),
                    'description': 'Plutus demo payday',
                })
                current = _sync_state_from_nessie(app, db, current)
                events = _evaluate(db, current)
                return {'action': 'advance_payday', 'advance': {'asOf': current['asOf'], 'balance': current['balance']}, 'events': events}
            paychecks = [event for event in current['scheduled'] if event['type'] == 'income']
            if not paychecks:
                raise HTTPException(409, 'No future paycheck available')
            payday = min(paychecks, key=lambda event: event['date'])['date']
            applied = [event for event in current['scheduled'] if event['date'] <= payday]
            current['balance'] = format(Decimal(current['balance']) + sum((Decimal(event['amount']) for event in applied), Decimal('0.00')), '.2f')
            current['asOf'] = payday
            current['scheduled'] = [event for event in current['scheduled'] if event['date'] > payday]
            events = _evaluate(db, current)
            return {'action': 'advance_payday', 'advance': {'asOf': payday, 'balance': current['balance']}, 'events': events}

    @router.post('/reset')
    def reset(x_operator_token: str | None = Header(None)):
        authorize(x_operator_token)
        with database() as db:
            db.execute('DELETE FROM operator_demo_events')
            db.execute('DELETE FROM operator_demo_watchlist')
            db.execute('INSERT INTO operator_demo_watchlist(id,label,amount_cents,reserve_cents,created_at) VALUES (?,?,?,?,?)',
                       ('demo-laptop', 'Laptop', 60000, 20000, now()))
            if _live_mutations_enabled():
                _sync_state_from_nessie(app, db)
            else:
                db.execute('UPDATE operator_demo_state SET doc=? WHERE id=1', (json.dumps(initial_state()),))
            return {'reset': True}

    app.include_router(router)
