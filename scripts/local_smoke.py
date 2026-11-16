"""Built Node HTTP integration with an isolated fictional backend; never sends."""
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import httpx
from production_smoke import smoke

root = Path(__file__).resolve().parents[1]
def stop_child(child):
    if child.poll() is not None:return
    if os.name=='nt':
        subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
    else:child.terminate()
    try:child.wait(timeout=5)
    except subprocess.TimeoutExpired:child.kill();child.wait()

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); return sock.getsockname()[1]

def run():
    api_port, web_port = free_port(), free_port()
    api, web = f'http://127.0.0.1:{api_port}', f'http://127.0.0.1:{web_port}'
    env = {k:v for k,v in os.environ.items() if not k.startswith(('FINPILOT_', 'NESSIE_', 'NVIDIA_', 'PHOTON_', 'PLUTUS_', 'AGENT_'))}
    env.update(FINPILOT_MODE='local', FINPILOT_API_TOKEN=secrets.token_urlsafe(48),
        FINPILOT_CUSTOMER_ID='synthetic_demo', FINPILOT_DATA_SOURCE='mock', AGENT_DATA_SOURCE='demo',
        FINPILOT_ALLOWED_HOSTS='127.0.0.1,localhost', PLUTUS_COUNCIL_ENABLED='1',
        PLUTUS_DELIVERY_MODE='preview', PLUTUS_ALERT_POLL_SECONDS='0', NVIDIA_API_KEY='', PLUTUS_SESSION_SECRET=secrets.token_urlsafe(48))
    children = []
    with tempfile.TemporaryDirectory() as temp:
        env['PLUTUS_NOTIFICATIONS_DB'] = str(Path(temp)/'notifications.sqlite3')
        try:
            children.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'nemotron_agent.main:app', '--host', '127.0.0.1', '--port', str(api_port)], cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            frontend = dict(env, NODE_ENV='production', HOST='127.0.0.1', PORT=str(web_port), FINPILOT_BACKEND_URL=api)
            children.append(subprocess.Popen(['node', '.output/server/index.mjs'], cwd=root/'frontend', env=frontend, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            for _ in range(100):
                try:
                    with httpx.Client(trust_env=False, timeout=1) as client:
                        if all(client.get(url+'/health').status_code==200 for url in (api,web)): break
                except httpx.HTTPError: pass
                if any(child.poll() is not None for child in children): raise RuntimeError('local server exited')
                time.sleep(.1)
            smoke(web, api, 'synthetic_demo')
            with httpx.Client(trust_env=False) as client:
                assert client.get(web+'/api/source').json()['source']=='synthetic_demo'
            print('PASS: built Node / fictional local-mode backend HTTP smoke')
        finally:
            for child in reversed(children):
                stop_child(child)

if __name__=='__main__': run()
