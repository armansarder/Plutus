"""Pure deterministic calculations. No banking calls or language models."""
from datetime import timedelta
from decimal import Decimal

from .models import FinancialData, ForecastRequest, PurchaseRequest, Scenario


def _data(data):
    return FinancialData.model_validate(
        data.model_dump() if isinstance(data, FinancialData) else data
    ).model_copy(deep=True)


def _money(value):
    return format(value, '.2f')


def _assumptions(data, events):
    estimated = [t['id'] for t in events if t['source_status'] == 'estimated']
    return {
        'snapshot': ('Intraday balance on as_of_date; same-day future events are unsupported.'
                     if data.snapshot_basis == 'intraday' else
                     'Opening balance on as_of_date; upcoming events are not yet applied.'),
        'same_day_order': 'Expenses before income, then transaction ID; posting times unknown.',
        'coverage': 'Only supplied events are projected; completeness cannot be verified.',
        'estimated_transaction_ids': estimated,
        'missing_information': ['intraday posting times', 'verification of future schedule completeness']
            + (['no upcoming transactions supplied'] if not data.upcoming_transactions else []),
        'currency_precision': 'Two decimal places; no fees, interest, or events inferred.',
        'source_notes': data.source_notes,
    }


def _events(data):
    return [t.model_dump(mode='json') for t in data.upcoming_transactions]


def _ordered(events):
    return sorted(events, key=lambda t: (t['date'], 0 if t['type'] == 'expense' else 1, t['id']))


def _walk(balance, events, initial_date):
    minimum, minimum_date = balance, initial_date
    timeline = []
    for event in _ordered(events):
        balance += Decimal(event['amount'])
        timeline.append({**event, 'balance': _money(balance)})
        if balance < minimum:
            minimum, minimum_date = balance, event['date']
    return {
        'starting_balance': None,  # filled by caller
        'ending_balance': _money(balance),
        'minimum_balance': _money(minimum),
        'minimum_balance_date': minimum_date,
        'shortfall_occurs': minimum < 0,
        'transaction_timeline': timeline,
    }


def simulate_purchase(financial_data, purchase_amount, purchase_date):
    data = _data(financial_data)
    request = PurchaseRequest(purchase_amount=purchase_amount, purchase_date=purchase_date)
    if request.purchase_date < data.as_of_date:
        raise ValueError('Purchase cannot precede the balance snapshot')
    if data.snapshot_basis == 'intraday' and request.purchase_date == data.as_of_date:
        raise ValueError('Intraday snapshots only support purchases after as_of_date')
    events = _events(data)
    events.append({
        'id': '__purchase', 'date': request.purchase_date.isoformat(),
        'description': 'Hypothetical purchase', 'amount': _money(-request.purchase_amount),
        'type': 'expense', 'source_status': 'confirmed',
    })
    result = _walk(data.current_balance, events, data.as_of_date.isoformat())
    return {
        **result, 'customer_id': data.customer_id, 'currency': data.currency,
        'as_of_date': data.as_of_date.isoformat(),
        'starting_balance': _money(data.current_balance),
        'horizon_end': max(t['date'] for t in events),
        'assumptions': _assumptions(data, events),
    }


def forecast_cash_flow(financial_data, start_date, end_date):
    data = _data(financial_data)
    request = ForecastRequest(start_date=start_date, end_date=end_date)
    start, end = request.start_date, request.end_date
    if start < data.as_of_date or end < start:
        raise ValueError('Forecast requires as_of_date <= start_date <= end_date')
    if data.snapshot_basis == 'intraday' and start == data.as_of_date:
        raise ValueError('Intraday snapshots require forecasts starting after as_of_date')
    if (end - data.as_of_date).days > 3660:
        raise ValueError('Forecast horizon cannot exceed 3660 days after snapshot')
    events = _events(data)
    # Bridge from snapshot to range opening exactly once, excluding start-day events.
    opening = data.current_balance + sum(
        (Decimal(t['amount']) for t in events if t['date'] < start.isoformat()), Decimal(0)
    )
    selected = [t for t in events if start.isoformat() <= t['date'] <= end.isoformat()]
    result = _walk(opening, selected, start.isoformat())
    by_day = {}
    for t in result['transaction_timeline']:
        by_day[t['date']] = t['balance']
    daily, negatives = [], []
    balance = _money(opening)
    day = start
    while True:
        key = day.isoformat()
        balance = by_day.get(key, balance)
        daily.append({'date': key, 'ending_balance': balance})
        if Decimal(balance) < 0:
            negatives.append(key)
        if day == end:
            break
        day += timedelta(days=1)
    daily_min = min(daily, key=lambda d: Decimal(d['ending_balance']))
    return {
        **result, 'customer_id': data.customer_id, 'currency': data.currency,
        'start_date': start.isoformat(), 'end_date': end.isoformat(),
        'starting_balance': _money(opening), 'daily_balances': daily,
        'negative_balance_days': negatives,
        'minimum_daily_ending_balance': daily_min['ending_balance'],
        'minimum_daily_ending_balance_date': daily_min['date'],
        'assumptions': _assumptions(data, [t for t in events if t['date'] <= end.isoformat()]),
    }


def compare_scenarios(financial_data, scenarios):
    original = _data(financial_data)
    if not scenarios or len(scenarios) > 20:
        raise ValueError('Supply between 1 and 20 scenarios')
    parsed = [Scenario.model_validate(s.model_dump() if isinstance(s, Scenario) else s)
              for s in scenarios]
    if len({s.name for s in parsed}) != len(parsed):
        raise ValueError('Scenario names must be unique')
    changed_data = []
    for scenario in parsed:
        data = original.model_copy(deep=True)
        transactions = {t.id: t for t in data.upcoming_transactions}
        seen = set()
        for delay in scenario.delayed_income:
            event = transactions.get(delay.transaction_id)
            if event is None or event.type != 'income' or delay.transaction_id in seen:
                raise ValueError('Delay must reference a unique upcoming income transaction')
            if delay.new_date < event.date:
                raise ValueError('Delayed income cannot move earlier')
            seen.add(delay.transaction_id)
            event.date = delay.new_date
        for expense in scenario.unexpected_expenses:
            if expense.type != 'expense':
                raise ValueError('Unexpected expenses must have type expense')
            data.upcoming_transactions.append(expense.model_copy(deep=True))
        changed_data.append(_data(data))
    # Align all comparison horizons, including income moved beyond the baseline horizon.
    horizon = max([s.purchase_date.isoformat() for s in parsed] +
                  [t.date.isoformat() for d in changed_data for t in d.upcoming_transactions])
    results = []
    for scenario, data in zip(parsed, changed_data):
        result = simulate_purchase(data, scenario.purchase_amount, scenario.purchase_date)
        result['horizon_end'] = horizon
        result['name'] = scenario.name
        result['assumptions']['scenario_changes'] = scenario.model_dump(mode='json')
        results.append(result)
    return {'customer_id': original.customer_id, 'currency': original.currency,
            'horizon_end': horizon, 'scenarios': results}
