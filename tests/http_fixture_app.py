"""TEST HARNESS ONLY: local Nessie wire server, never a deployment entrypoint."""
import os
if os.getenv('PLUTUS_TEST_WIRE')!='1':raise RuntimeError('Test-only wire harness must be explicitly enabled')
import json,threading
from datetime import datetime,timezone,timedelta
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from calculation_engine import outbound

state={'balance':'1000.00','purchase':'25.00','fail':False}
today=datetime.now(timezone.utc).date()
def day(offset):return (today+timedelta(days=offset)).isoformat()
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        path=urlsplit(self.path).path
        records={
          '/customers/wire_customer/accounts':[{'_id':'wire_account','customer_id':'wire_customer','type':'Checking','balance':state['balance']}],
          '/accounts/wire_account/purchases':[{'_id':'wire_purchase','payer_id':'wire_account','purchase_date':day(-2),'amount':state['purchase'],'status':'completed','merchant_id':'wire_merchant'}],
          '/accounts/wire_account/deposits':[{'_id':'wire_pay','payee_id':'wire_account','transaction_date':day(7),'amount':'1200.00','status':'pending'}],
          '/accounts/wire_account/bills':[{'_id':'wire_bill','account_id':'wire_account','upcoming_payment_date':day(3),'payment_amount':'900.00','status':'recurring'}],
          '/merchants':[{'_id':'wire_merchant','name':'Fictional groceries','category':['groceries']}]}
        self.send_response(503 if state['fail'] else 200);self.send_header('Content-Type','application/json');self.end_headers()
        self.wfile.write(json.dumps(records.get(path,[])).encode())
wire=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=wire.serve_forever,daemon=True).start()
real_read,real_validate=outbound.read_json_https,outbound.validate_destination
local=f'http://127.0.0.1:{wire.server_port}'
def validate(url,hosts):
    if not url.startswith(local+'/'):return real_validate(url,hosts)
def read(url,**kwargs):return real_read(local+urlsplit(url).path,**kwargs)
outbound.validate_destination=validate
outbound.read_json_https=read
from nemotron_agent.main import create_app
app=create_app();app.state.history_source.cache_seconds=0
@app.post('/api/test-wire/change')
def change():
    state['balance']='1500.00';state['purchase']='55.00';return {'changed':True}
@app.post('/api/test-wire/fail')
def fail():state['fail']=True;return {'changed':True}
