"""Explicit opt-in sandbox population. Dry run by default; never used by the app/agents."""
import argparse
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import json
import logging
from pathlib import Path
import re

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'calculation_engine/private_data/alex_sample_plan.json'
PREFIX = 'Plutus sample v1'
MERCHANTS = {'groceries': 'Groceries', 'transport': 'Transport', 'subscriptions': 'Subscriptions', 'personal': 'Shopping'}


def build_records(as_of):
    rows = []
    def add(kind, marker, body):
        field = 'nickname' if kind == 'bills' else 'description'
        if kind == 'bills':
            body = {**body, 'recurring_date': int(body['payment_date'][-2:]),
                    'upcoming_payment_date': body['payment_date']}
        rows.append({'kind': kind, 'body': {**body, field: f'{PREFIX}/{marker}'}})
    for block, offset in enumerate((70, 40, 10)):
        start = as_of - timedelta(days=offset)
        add('deposits', f'{block}/payroll', {'medium': 'balance', 'transaction_date': str(start), 'status': 'completed', 'amount': 1600})
        for name, amount in [('rent', 900), ('electric', 160)]:
            add('bills', f'{block}/{name}', {'status': 'completed', 'payee': f'Sample {name}', 'payment_date': str(start + timedelta(days=1)), 'payment_amount': amount})
        purchases = [('groceries', 70)] * 4 + [('transport', 40)] * 3 + [('subscriptions', 20)] * 2 + [('personal', 60)]
        for i, (merchant, amount) in enumerate(purchases):
            add('purchases', f'{block}/{merchant}/{i}', {'medium': 'balance', 'purchase_date': str(start + timedelta(days=2+i%6)), 'status': 'completed', 'amount': amount, 'merchant_ref': merchant})
        add('withdrawals', f'{block}/cash', {'medium': 'balance', 'transaction_date': str(start+timedelta(days=8)), 'status': 'completed', 'amount': 40})
    for name, offset, amount in [('phone', 3, 45), ('electric', 6, 90), ('rent', 12, 900), ('internet', 18, 60), ('insurance', 24, 120), ('streaming', 28, 20)]:
        add('bills', f'future/{name}', {'status': 'pending', 'payee': f'Sample {name}', 'payment_date': str(as_of+timedelta(days=offset)), 'payment_amount': amount})
    for i, offset in enumerate((7, 21)):
        add('deposits', f'future/payroll/{i}', {'medium': 'balance', 'transaction_date': str(as_of+timedelta(days=offset)), 'status': 'pending', 'amount': 1600})
    return rows


class Sandbox:
    def __init__(self, config, client):
        self.config, self.client = config, client
        if config.get('NESSIE_BASE_URL') != 'https://prod-api.nessieisreal.com':
            raise ValueError('Only the configured Nessie sandbox HTTPS origin is supported')
        for name in ('NESSIE_ACCOUNT_ID', 'FINPILOT_CUSTOMER_ID'):
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', config.get(name, '')):
                raise ValueError('Invalid configured account/customer identifier')
        if not config.get('NESSIE_API_KEY'):
            raise ValueError('Missing Nessie key')

    def request(self, method, path, body=None):
        try:
            r = self.client.request(method, self.config['NESSIE_BASE_URL']+path,
                params={'key': self.config['NESSIE_API_KEY']}, json=body)
        except httpx.HTTPError:
            raise ValueError('Sandbox request failed or timed out; no automatic POST retry. Re-run the dry run before continuing') from None
        if method == 'GET' and r.status_code == 404 and path.endswith(('purchases','deposits','withdrawals','bills','merchants')):
            return []
        allowed = {'GET': (200,), 'POST': (201,), 'PUT': (200,202,204)}
        if r.status_code not in allowed[method]:
            fields = []
            try:
                message = str(r.json())
                fields = [f for f in ('account_number','recurring_date','upcoming_payment_date','payment_date','payee_id','payer_id','merchant_id','amount','balance') if re.search(r'\b'+f+r'\b',message)]
            except ValueError:
                pass
            raise ValueError(f'Sandbox {method} failed: HTTP {r.status_code}; validation fields='+','.join(fields)+'; provider body suppressed')
        try:
            return r.json() if r.content else {}
        except ValueError:
            raise ValueError('Invalid sandbox response; no automatic retry') from None

    def verify_owner(self):
        account = self.request('GET', '/accounts/'+self.config['NESSIE_ACCOUNT_ID'])
        if account.get('customer_id') != self.config['FINPILOT_CUSTOMER_ID'] or account.get('type') not in ('Checking','Savings'):
            raise ValueError('Configured account ownership/type mismatch')
        customer = self.request('GET', '/customers/'+self.config['FINPILOT_CUSTOMER_ID'])
        if customer.get('first_name') != 'Alex' or customer.get('last_name') != 'Adams':
            raise ValueError('This plan is restricted to the configured Alex Adams customer')

    def existing(self, kind):
        rows = self.request('GET', '/accounts/'+self.config['NESSIE_ACCOUNT_ID']+'/'+kind)
        if not isinstance(rows, list):
            raise ValueError('Invalid sandbox collection')
        return rows

    def remaining(self, records):
        collections = {kind: self.existing(kind) for kind in {r['kind'] for r in records}}
        remaining = []
        for row in records:
            kind, body = row['kind'], row['body']
            field = 'nickname' if kind == 'bills' else 'description'
            matches = [r for r in collections[kind] if r.get(field) == body[field]]
            if len(matches) > 1:
                raise ValueError('Duplicate sample markers already exist; refusing further writes')
            if matches:
                stable = [k for k in body if k not in ('merchant_ref','upcoming_payment_date')]
                def same(k):
                    if k in ('amount', 'payment_amount'):
                        return Decimal(str(matches[0].get(k))) == Decimal(str(body[k]))
                    return str(matches[0].get(k)) == str(body[k])
                if any(not same(k) for k in stable):
                    raise ValueError('Existing sample record differs from the approved plan; refusing to overwrite')
            else:
                remaining.append(row)
        return remaining

    def save_receipt(self, row, body, response):
        # Preserve repair references before the next write. Never store credentials.
        created_object = response.get('objectCreated', response) if isinstance(response, dict) else {}
        id_ = created_object.get('_id') if isinstance(created_object, dict) else None
        receipt_path = PLAN.with_suffix('.receipts.json')
        receipts = json.loads(receipt_path.read_text()) if receipt_path.exists() else []
        receipts.append({'kind':row['kind'], 'marker':body.get('nickname',body.get('description')),
                         'id':id_ if isinstance(id_,str) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}',id_) else None})
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        receipt_path.write_text(json.dumps(receipts,indent=2)+'\n')

    def apply(self, records):
        remaining = self.remaining(records)
        if not remaining:
            return Counter()
        merchants = self.request('GET', '/merchants')
        ids = {}
        for ref, category in MERCHANTS.items():
            name = f'{PREFIX} {ref}'
            matches = [m for m in merchants if m.get('name') == name]
            if len(matches) > 1:
                raise ValueError('Ambiguous sample merchant; refusing writes')
            if not matches:
                self.request('POST', '/merchants', {'name': name, 'category': category,
                    'address': {'street_number':'100','street_name':'Sample Street','city':'Richardson','state':'TX','zip':'75080'},
                    'geocode': {'lat':32.95,'lng':-96.73}})
                matches = [m for m in self.request('GET', '/merchants') if m.get('name') == name]
            if len(matches) != 1:
                raise ValueError('Created merchant could not be verified; stopped before account writes')
            ids[ref] = matches[0]['_id']
        created = Counter()
        for row in remaining:
            body = dict(row['body'])
            if row['kind'] == 'bills':
                # This deployment derives upcoming_payment_date from recurring_date;
                # it rejects the derived field on POST even though GET requires it.
                body.pop('upcoming_payment_date', None)
            if 'merchant_ref' in body:
                body['merchant_id'] = ids[body.pop('merchant_ref')]
            response = self.request('POST', '/accounts/'+self.config['NESSIE_ACCOUNT_ID']+'/'+row['kind'], body)
            self.save_receipt(row, body, response)
            created[row['kind']] += 1
            if row['kind'] == 'bills':
                self.existing('bills')  # Verify provider read compatibility before further writes.
        return created


def main():
    global PLAN
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Apply the reviewed plan; default is read-only')
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)
    lock = None
    try:
        config = dotenv_values(ROOT / 'calculation_engine/.env')
        target = hashlib.sha256((config.get('FINPILOT_CUSTOMER_ID','')+':'+config.get('NESSIE_ACCOUNT_ID','')).encode()).hexdigest()
        PLAN.parent.mkdir(parents=True, exist_ok=True)
        matching = [p for p in PLAN.parent.glob('alex*_plan.json') if json.loads(p.read_text()).get('target') == target]
        if len(matching)>1:
            raise ValueError('Multiple stored plans match the configured account; refusing writes')
        if matching:
            PLAN = matching[0]
        # Exclusive lock prevents concurrent runs from racing their remote dedup checks.
        lock = PLAN.with_suffix('.lock').open('x')
        if PLAN.exists():
            plan = json.loads(PLAN.read_text())
            if plan['target'] != target:
                raise ValueError('Stored plan targets a different account; no writes allowed')
            expected = build_records(date.fromisoformat(plan['as_of']))
            legacy = [{'kind':r['kind'], 'body':{k:v for k,v in r['body'].items() if k not in ('recurring_date','upcoming_payment_date')}} for r in expected]
            if plan['records'] == legacy:
                plan['records'] = expected
                PLAN.write_text(json.dumps(plan,indent=2)+'\n')
            elif plan['records'] != expected:
                raise ValueError('Stored plan was modified; no writes allowed')
        else:
            as_of = datetime.now(timezone.utc).date()
            plan = {'target':target, 'as_of':str(as_of), 'records':build_records(as_of)}
            PLAN.write_text(json.dumps(plan,indent=2)+'\n')
        with httpx.Client(timeout=15, trust_env=False, follow_redirects=False) as client:
            sandbox = Sandbox(config, client)
            sandbox.verify_owner()
            remaining = sandbox.remaining(plan['records'])
            print('Verified configured Alex Adams account; no credentials or IDs displayed')
            print('Planned record counts: '+json.dumps(dict(Counter(r['kind'] for r in plan['records']))))
            print('Missing record counts: '+json.dumps(dict(Counter(r['kind'] for r in remaining))))
            if args.apply:
                print('Created record counts: '+json.dumps(dict(sandbox.apply(plan['records']))))
            else:
                print('Dry run only. No Nessie writes performed. Four sample merchants may also be added.')
    except Exception as exc:
        print(str(exc) if isinstance(exc, ValueError) else 'Population stopped safely; private error details suppressed')
        return 1
    finally:
        if lock is not None:
            lock.close()
            PLAN.with_suffix('.lock').unlink(missing_ok=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
