"""Complete Node -> FastAPI -> local HTTP Nessie fixture flow, not live verification."""
import os,secrets,subprocess,sys,tempfile,time
from pathlib import Path
from decimal import Decimal
import httpx
from local_smoke import free_port,root,stop_child
from production_smoke import smoke

def run():
    api_port,web_port=free_port(),free_port();api=f'http://127.0.0.1:{api_port}';web=f'http://127.0.0.1:{web_port}'
    env={k:v for k,v in os.environ.items() if not k.startswith(('FINPILOT_','NESSIE_','NVIDIA_','PHOTON_','PLUTUS_','AGENT_'))}
    env.update(FINPILOT_MODE='local',FINPILOT_ALLOWED_HOSTS='127.0.0.1,localhost',FINPILOT_API_TOKEN=secrets.token_urlsafe(48),
        FINPILOT_CUSTOMER_ID='wire_customer',NESSIE_ACCOUNT_ID='wire_account',NESSIE_API_KEY='wire-test-only',PLUTUS_TEST_WIRE='1',
        PLUTUS_DATA_MODE='nessie',AGENT_DATA_SOURCE='nessie',FINPILOT_DATA_SOURCE='nessie',NVIDIA_API_KEY='',
        NESSIE_BASE_URL='https://prod-api.nessieisreal.com',PLUTUS_COUNCIL_ENABLED='1',PLUTUS_SESSION_SECRET=secrets.token_urlsafe(48),PLUTUS_DELIVERY_MODE='preview',PLUTUS_ALERT_POLL_SECONDS='0')
    children=[]
    with tempfile.TemporaryDirectory() as temp:
        env['PLUTUS_NOTIFICATIONS_DB']=str(Path(temp)/'notifications.sqlite3')
        try:
            children.append(subprocess.Popen([sys.executable,'-m','uvicorn','tests.http_fixture_app:app','--host','127.0.0.1','--port',str(api_port)],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
            front=dict(env,NODE_ENV='production',HOST='127.0.0.1',PORT=str(web_port),FINPILOT_BACKEND_URL=api)
            children.append(subprocess.Popen(['node','.output/server/index.mjs'],cwd=root/'frontend',env=front,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
            with httpx.Client(trust_env=False,timeout=30) as c:
                for _ in range(100):
                    try:
                        if all(c.get(url+'/health').status_code==200 for url in (web,api)):break
                    except httpx.HTTPError:pass
                    if any(p.poll() is not None for p in children):raise RuntimeError('Wire server exited')
                    time.sleep(.1)
                smoke(web,api,'nessie_sandbox')
                before=c.get(web+'/api/financial-data').json()['data'];assert before['current_balance']=='1000.00'
                auth={'Authorization':'Bearer '+env['FINPILOT_API_TOKEN']}
                assert c.post(api+'/api/test-wire/change',json={},headers=auth).status_code==200
                after=c.get(web+'/api/financial-data').json()['data'];assert after['current_balance']=='1500.00'
                history=c.get(web+'/api/history').json()['data'];assert history['transactions'][0]['amount']=='-55.00'
                from datetime import date,timedelta
                start=date.fromisoformat(after['as_of_date'])+timedelta(days=1)
                forecast=c.post(web+'/api/forecast',json={'start_date':str(start),'end_date':str(start+timedelta(days=29))}).json()['data']
                assert forecast['ending_balance']=='1800.00'
                c.post(api+'/api/test-wire/fail',json={},headers=auth)
                for path in ('/api/financial-data','/api/source','/api/history'):assert c.get(web+path).status_code==503
            print('PASS: full fictional Nessie HTTP wire -> FastAPI -> Node, changed balance/history, engine forecast, no fallback on failure')
        finally:
            for p in reversed(children):
                stop_child(p)
if __name__=='__main__':run()
