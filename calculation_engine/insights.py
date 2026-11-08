"""Read-only account insights. Exact decimal aggregation; no inferred future events."""
from decimal import Decimal
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Request
from .history import normalize
from .models import Contract, Day, ResultMoney, Transaction, parse_money
from typing import Literal
from pydantic import Field

class AccountView(Contract):
    selected: bool
    type: str
    balance: ResultMoney
    label: str
class Group(Contract):
    label: str
    amount: ResultMoney
class Activity(Contract):
    date: Day
    amount: ResultMoney
    merchant: str
    category: str
    source: str
class LoanView(Contract):
    type: str
    status: str
class InsightsResponse(Contract):
    source: Literal['nessie_sandbox']
    currency: str
    as_of_date: Day
    fetched_at: str | None
    period_start: Day
    accounts: list[AccountView] = Field(max_length=12)
    income: ResultMoney
    spending: ResultMoney
    transfer_volume: ResultMoney
    transaction_count: int
    categories: list[Group] = Field(max_length=10)
    merchants: list[Group] = Field(max_length=10)
    activity: list[Activity] = Field(max_length=200)
    bills: list[Transaction] = Field(max_length=1000)
    loans: list[LoanView] = Field(max_length=100)
    loan_status: Literal['available','unavailable','unsupported']
    notes: list[str]

def install_insights(app, snapshot_dependency):
    @app.get('/api/nessie/insights', response_model=InsightsResponse)
    def insights(request: Request, snapshot=Depends(snapshot_dependency)):
        from .nessie_adapter import NessieAdapter
        if not isinstance(request.app.state.financial_source, NessieAdapter):
            raise HTTPException(404, 'Nessie insights require Nessie source mode')
        source = request.app.state.history_source
        if source is None: raise HTTPException(503, 'Nessie history is not configured')
        raw = source.load_raw()
        if raw['customer_id'] != snapshot.customer_id: raise HTTPException(403, 'Customer mismatch')
        today = snapshot.as_of_date
        start = today.replace(day=1)
        rows = [r for r in normalize(raw) if start <= r['date'] <= today]
        spending, income, transfers = Decimal(0), Decimal(0), Decimal(0)
        categories, merchants = {}, {}
        for r in rows:
            if r['is_spending']:
                amount = abs(r['amount']); spending += amount
                categories[r['category']] = categories.get(r['category'], Decimal(0))+amount
                merchants[r['merchant']] = merchants.get(r['merchant'], Decimal(0))+amount
            if r['is_income']: income += r['amount']
            if r['is_transfer'] and r['status'] in ('completed', 'executed'): transfers += abs(r['amount'])
        def groups(values):
            return [{'label': k, 'amount': format(v, '.2f')} for k,v in sorted(values.items(),key=lambda x:-x[1])[:10]]
        available = raw.get('available_accounts', raw['accounts'])
        if not isinstance(available,list) or len(available)>100 or any(a.get('customer_id') != snapshot.customer_id for a in available):
            raise ValueError('Invalid account directory')
        accounts = [{'selected': a['_id'] == raw['accounts'][0]['_id'], 'type': str(a['type'])[:40], 'balance': format(parse_money(a['balance']), '.2f'),
                     'label': str(a.get('nickname') or a['type'])[:80]} for a in available[:12]]
        loans, loan_status = [], 'unsupported'
        if hasattr(source, '_get'):
            try:
                records = source._get('/accounts/'+raw['accounts'][0]['_id']+'/loans', empty_on_404=True)
                if not isinstance(records,list) or len(records)>100: raise ValueError('Invalid loans')
                for loan in records:
                    if loan.get('account_id', raw['accounts'][0]['_id']) != raw['accounts'][0]['_id']: raise ValueError('Loan ownership')
                    loans.append({'type': str(loan.get('type','Loan'))[:40],
                                  'status': str(loan.get('status','unknown'))[:40]})
                loan_status = 'available'
            except Exception: loan_status = 'unavailable'
        return {'source': 'nessie_sandbox', 'currency': snapshot.currency,
            'as_of_date': today.isoformat(), 'fetched_at': raw.get('fetched_at'),
            'period_start': start.isoformat(), 'accounts': accounts,
            'income': format(income,'.2f'), 'spending': format(spending,'.2f'),
            'transfer_volume': format(transfers,'.2f'), 'transaction_count': len(rows),
            'categories': groups(categories), 'merchants': groups(merchants),
            'activity': [{'date': r['date'].isoformat(), 'amount': format(r['amount'],'.2f'), 'merchant': r['merchant'],
                          'category': r['category'], 'source': r['source']} for r in rows if r['is_spending']][:200],
            'bills': [e.model_dump(mode='json') for e in sorted(snapshot.upcoming_transactions, key=lambda e:(e.date,e.id))],
            'loans': loans, 'loan_status': loan_status,
            'notes': ['Month-to-date completed activity. Transfers excluded from income and spending.',
                      'Spending and projections use the selected cash account; other account balances are not combined.',
                      'Top ten categories/payees; drill-down shows up to 200 spending records. Full history remains in Cash Flow.',
                      'Future events are incomplete. Loan interest calculations are unsupported.']}
