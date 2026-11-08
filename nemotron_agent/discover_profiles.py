"""Print approved-profile candidates from read-only Nessie REST calls. No PII names."""
import json
import logging
import os
from pathlib import Path
from dotenv import load_dotenv
from calculation_engine.nessie_adapter import DEFAULT_NESSIE_BASE_URL, NESSIE_HOSTS
from calculation_engine.outbound import read_json_https
from calculation_engine.history import select_cash_account

def main():
    load_dotenv(Path(__file__).with_name('.env'), override=False)
    key = os.getenv('NESSIE_API_KEY')
    base = os.getenv('NESSIE_BASE_URL', DEFAULT_NESSIE_BASE_URL)
    if not key: raise SystemExit('Set NESSIE_API_KEY in nemotron_agent/.env first. Never paste it into chat.')
    if base not in ['https://'+h for h in NESSIE_HOSTS]: raise SystemExit('Unsupported Nessie origin')
    for name in ('httpx','httpcore'): logging.getLogger(name).setLevel(logging.WARNING)
    def get(path): return read_json_https(base+path, allowed_hosts=NESSIE_HOSTS, params={'key':key})
    try:
        customers=get('/customers')
        if not isinstance(customers,list) or len(customers)>2000: raise ValueError()
        candidates=[]
        import re
        for customer in customers[:12]:
            id=customer.get('_id','')
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',id): raise ValueError()
            try: account=select_cash_account(get('/customers/'+id+'/accounts'),id)
            except ValueError: continue  # Explicitly configure ambiguous customers yourself.
            n=len(candidates)+1
            candidates.append({'id':'customer_'+str(n),'label':'Customer '+str(n),
                               'customer_id':id,'account_id':account['_id']})
        if not candidates: raise SystemExit('No unambiguous cash-account profiles found. Configure owned accounts manually.')
        print(json.dumps(candidates,indent=2))
    except SystemExit: raise
    except Exception: raise SystemExit('Nessie discovery failed. Check server-side credentials and connectivity; no provider details printed.') from None

if __name__=='__main__': main()
