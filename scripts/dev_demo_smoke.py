"""Exercise the actual root npm dev:demo command; stop its owned process tree."""
import os
import shutil
import socket
import subprocess
import time
import httpx
from local_smoke import root, stop_child
from production_smoke import smoke

def run_once():
    for port in (8000,8080):
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1',port))==0:
                raise RuntimeError('Stop the existing local server before this smoke check')
    command=shutil.which('npm.cmd' if os.name=='nt' else 'npm')
    if not command:raise RuntimeError('npm is required')
    child=subprocess.Popen([command,'run','dev:demo'],cwd=root,
                           stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        with httpx.Client(trust_env=False,timeout=5) as client:
            for _ in range(240):
                try:
                    if all(client.get(base+'/health').status_code==200
                           for base in ('http://127.0.0.1:8000','http://127.0.0.1:8080')):break
                except httpx.HTTPError:pass
                if child.poll() is not None:raise RuntimeError('dev:demo exited during startup')
                time.sleep(.5)
            else:raise RuntimeError('dev:demo startup timed out')
        smoke('http://127.0.0.1:8080','http://127.0.0.1:8000','synthetic_demo',built_assets=False)
        with httpx.Client(trust_env=False,timeout=30) as client:
            base='http://127.0.0.1:8080/api/notifications'
            response=client.get(base+'/history')
            assert response.status_code==200 and response.json()==[], 'healthy empty history'
            prefs=client.get(base+'/settings').json()
            assert prefs['mode']=='preview' and not prefs['recipient_enrolled']
            settings=dict(prefs['preferences'],enabled=True,budget_alerts=True,
                          budget_category='groceries',budget_limit_cents=100)
            assert client.put(base+'/settings',json=settings).status_code==200
            checked=client.post(base+'/check',json={})
            assert checked.status_code==200 and checked.json()['event_statuses']==['preview_only']
            response=client.get(base+'/history')
            assert response.status_code==200 and len(response.json())==1
            assert response.json()[0]['status']=='preview_only'
            assert client.post(base+'/check',json={}).json()['event_statuses']==[]
        print('PASS: actual dev:demo; empty history 200 [], persisted preview alert, duplicate suppression, no Photon delivery')
    finally:stop_child(child)

def run():
    run_once()
    run_once() # New launcher = new temporary database: history is empty again.
    print('PASS: development restart resets temporary notification history and preferences')

if __name__=='__main__':run()
