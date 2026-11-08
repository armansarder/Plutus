"""One immutable snapshot per request; all math is delegated to Shiv's engine."""
from datetime import timedelta
from decimal import Decimal
from calculation_engine.models import FinancialData, Transaction, ForecastResult
from calculation_engine.simulator import forecast_cash_flow

class SimulatorAdapter:
    def __init__(self, snapshot, request):
        self.snapshot = FinancialData.model_validate(snapshot.model_dump()).model_copy(deep=True)
        self.request = request
        self.start = self.snapshot.as_of_date + timedelta(days=self.snapshot.snapshot_basis == 'intraday')
        self.end = self.start + timedelta(days=request.horizon_days - 1)
        self.purchase_date = request.purchase_date or self.start
        if not self.start <= self.purchase_date <= self.end:
            raise ValueError('Purchase date must be inside the supported forecast window')
        incomes = [t for t in self.snapshot.upcoming_transactions
                   if self.purchase_date <= t.date <= self.end and t.type == 'income']
        self.income = min(incomes, key=lambda t: (t.date, t.id), default=None)
        # After payday means the following day: engine assumes expenses post before income.
        self.later = min(self.end, self.income.date + timedelta(days=1)) if self.income else self.end

    def forecast(self, name, purchase_date=None):
        data = self.snapshot.model_copy(deep=True)
        if name == 'delayed_income' and self.income:
            for t in data.upcoming_transactions:
                if t.id == self.income.id:
                    t.date += timedelta(days=3)
        if name == 'unexpected_expense':
            used = {t.id for t in data.upcoming_transactions}
            event_id = 'plutus_stress_expense'
            while event_id in used:
                event_id += '_x'
            data.upcoming_transactions.append(Transaction(
                id=event_id, date=self.purchase_date, description='Hypothetical unexpected expense',
                amount=Decimal('-200.00'), type='expense', source_status='estimated'))
        when = purchase_date or (self.later if name == 'buy_later' else self.purchase_date)
        if name != 'baseline':
            used = {t.id for t in data.upcoming_transactions}
            event_id = 'plutus_hypothetical_purchase'
            while event_id in used:
                event_id += '_x'
            data.upcoming_transactions.append(Transaction(
                id=event_id, date=when, description='Hypothetical purchase',
                amount=-self.request.purchase_amount, type='expense', source_status='estimated'))
        # Validate and compute with the engine's single daily/transaction algorithm.
        data = FinancialData.model_validate(data.model_dump())
        result = ForecastResult.model_validate(forecast_cash_flow(data, self.start, self.end))
        return {'name': name, 'applicable': name != 'delayed_income' or self.income is not None, 'purchase_date': None if name == 'baseline' else when.isoformat(),
                'maintains_reserve': Decimal(result.minimum_balance) >= self.request.reserve,
                'forecast': result.model_dump(mode='json')}

    def safe_dates(self):
        dates = []
        day = self.purchase_date
        while day <= self.end:
            if self.forecast('purchase', day)['maintains_reserve']:
                dates.append(day.isoformat())
            day += timedelta(days=1)
        return dates

    def capacity(self):
        # Minimum opening/event balance from purchase time onward, including the position
        # immediately before same-day income (expenses post first). Earlier breaches mean
        # no purchase can maintain the reserve throughout the full comparison horizon.
        baseline = self.forecast('baseline')['forecast']
        if Decimal(baseline['minimum_balance']) < self.request.reserve:
            return '0.00'
        balance = Decimal(baseline['starting_balance'])
        candidates = []
        for event in baseline['transaction_timeline']:
            if event['date'] >= self.purchase_date.isoformat():
                candidates.append(balance)
            balance = Decimal(event['balance'])
            if event['date'] >= self.purchase_date.isoformat():
                candidates.append(balance)
        candidates.append(balance)
        return format(max(Decimal(0), min(candidates) - self.request.reserve), '.2f')
