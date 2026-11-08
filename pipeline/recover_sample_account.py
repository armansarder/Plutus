"""Explicit, user-approved recovery into one corrected sample account. No deletes."""
from collections import Counter
from datetime import datetime, timezone
import hashlib
from io import StringIO
import json
import logging
import re

import httpx
from dotenv import dotenv_values
from . import populate_nessie as population

NAME = 'Alex Adams - Sample Cash'


def main():
    logging.disable(logging.CRITICAL)
    config_path = population.ROOT / 'calculation_engine/.env'
    original = config_path.read_bytes()
    config = dotenv_values(config_path)
    population.PLAN = population.ROOT / 'calculation_engine/private_data/alex_corrected_plan.json'
    population.PLAN.parent.mkdir(parents=True, exist_ok=True)
    lock_path = population.PLAN.with_suffix('.lock')
    lock = None
    try:
        lock = lock_path.open('x')
        with httpx.Client(timeout=15,trust_env=False,follow_redirects=False) as client:
            api = population.Sandbox(config, client)
            api.verify_owner()
            accounts = api.request('GET','/customers/'+config['FINPILOT_CUSTOMER_ID']+'/accounts')
            matches = [a for a in accounts if a.get('nickname') == NAME and a.get('customer_id') == config['FINPILOT_CUSTOMER_ID']]
            if len(matches)>1:
                raise ValueError('Multiple matching sample accounts; refusing changes')
            if not matches:
                api.request('POST','/customers/'+config['FINPILOT_CUSTOMER_ID']+'/accounts',
                    {'type':'Checking','nickname':NAME,'rewards':0,'balance':1800,'account_number':'600000000001'})
                accounts = api.request('GET','/customers/'+config['FINPILOT_CUSTOMER_ID']+'/accounts')
                matches = [a for a in accounts if a.get('nickname') == NAME and a.get('customer_id') == config['FINPILOT_CUSTOMER_ID']]
            if len(matches)!=1:
                raise ValueError('Sample account creation could not be verified; no config changes')
            new_id = matches[0]['_id']
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',new_id):
                raise ValueError('Invalid created account identifier')
            next_config = {**config,'NESSIE_ACCOUNT_ID':new_id}
            api = population.Sandbox(next_config,client)
            api.verify_owner()
            target = hashlib.sha256((config['FINPILOT_CUSTOMER_ID']+':'+new_id).encode()).hexdigest()
            if population.PLAN.exists():
                plan = json.loads(population.PLAN.read_text())
                if plan['target'] != target:
                    raise ValueError('Recovery plan target mismatch')
            else:
                today = datetime.now(timezone.utc).date()
                plan = {'target':target,'as_of':str(today),'records':population.build_records(today)}
                population.PLAN.write_text(json.dumps(plan,indent=2)+'\n')
            created = api.apply(plan['records'])
            if api.remaining(plan['records']):
                raise ValueError('Sample data verification incomplete; no config changes')
            # Exercise the same full source/adapter and history normalizer the application uses.
            from calculation_engine.history import NessieHistorySource, build_history
            from calculation_engine.nessie_adapter import NessieAdapter
            source = NessieHistorySource(api_key=config['NESSIE_API_KEY'], customer_id=config['FINPILOT_CUSTOMER_ID'],
                account_id=new_id, base_url=config['NESSIE_BASE_URL'], select_single=True)
            snapshot = NessieAdapter(api_key=config['NESSIE_API_KEY'], customer_id=config['FINPILOT_CUSTOMER_ID'],
                account_id=new_id, base_url=config['NESSIE_BASE_URL'],raw_source=source).load()
            history = build_history(source,months_back=12)
            if len(snapshot.upcoming_transactions)!=8 or len(history['transactions'])!=42:
                raise ValueError('Unexpected schedule/history counts; no config changes')
            updated, count = re.subn(r'(?m)^(NESSIE_ACCOUNT_ID\s*=)[^\r\n]*',lambda m:m[1]+new_id,original.decode('utf-8'))
            parsed = dotenv_values(stream=StringIO(updated))
            if count!=1 or any(parsed.get(k)!=v for k,v in config.items() if k!='NESSIE_ACCOUNT_ID'):
                raise ValueError('Configuration preservation failed; no config changes')
            if config_path.read_bytes()!=original:
                raise ValueError('Configuration changed concurrently; no overwrite')
            config_path.write_bytes(updated.encode('utf-8'))
            print('Corrected sample account verified; changed only NESSIE_ACCOUNT_ID')
            print('Created record counts: '+json.dumps(dict(created)))
            print('Verified historical transactions=42; future events=8; all other configuration values preserved')
        return 0
    except Exception as exc:
        print(str(exc) if isinstance(exc,ValueError) else 'Recovery stopped; private error details suppressed')
        return 1
    finally:
        if lock:
            lock.close()
            lock_path.unlink(missing_ok=True)


if __name__ == '__main__':
    raise SystemExit(main())
