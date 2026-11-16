"""Start the actual Free-profile production API on a fresh disposable filesystem.

No providers, messages, persistent mounts, or hosted databases are used.
"""
import os
import secrets
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
from pathlib import Path
import httpx
from local_smoke import root, free_port, stop_child

def run():
    port=free_port()
    url=f'https://127.0.0.1:{port}'
    env={k:v for k,v in os.environ.items() if not k.startswith(('FINPILOT_','NESSIE_','NVIDIA_','PHOTON_','PLUTUS_','AGENT_'))}
    env.update(FINPILOT_MODE='production',FINPILOT_ALLOWED_HOSTS='127.0.0.1',
        FINPILOT_API_TOKEN=secrets.token_urlsafe(48),PLUTUS_SESSION_SECRET=secrets.token_urlsafe(48),
        FINPILOT_CUSTOMER_ID='synthetic_demo',PLUTUS_DATA_MODE='demo',FINPILOT_DATA_SOURCE='mock',
        AGENT_DATA_SOURCE='demo',PLUTUS_COUNCIL_ENABLED='1',PLUTUS_PUBLIC_DEMO='1',
        PLUTUS_PRIVATE_TOOLS='0',PLUTUS_RESEARCH_ENABLED='0',PLUTUS_DELIVERY_MODE='preview',
        PLUTUS_ALERT_POLL_SECONDS='0',PHOTON_RECIPIENT_OPTED_IN='false',NVIDIA_API_KEY='')
    with tempfile.TemporaryDirectory() as temp:
        openssl=shutil.which('openssl') or ('C:/Program Files/Git/usr/bin/openssl.exe' if os.name=='nt' else None)
        if not openssl:raise RuntimeError('OpenSSL required for production TLS check')
        cert,key=Path(temp)/'cert.pem',Path(temp)/'key.pem'
        subprocess.run([openssl,'req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        context=ssl.create_default_context(cafile=str(cert))
        db=Path(temp)/'fresh-directory'/'notifications.sqlite3'
        env['PLUTUS_NOTIFICATIONS_DB']=str(db)
        for _ in range(2):
            child=subprocess.Popen([sys.executable,'-m','uvicorn','nemotron_agent.main:app','--host','127.0.0.1','--port',str(port),'--workers','1','--ssl-certfile',str(cert),'--ssl-keyfile',str(key)],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            try:
                with httpx.Client(trust_env=False,timeout=15,verify=context) as client:
                    for _ in range(100):
                        try:
                            if client.get(url+'/health').status_code==200:break
                        except httpx.HTTPError:pass
                        if child.poll() is not None:raise RuntimeError('Free-profile backend exited')
                        time.sleep(.1)
                    assert client.get(url+'/api/financial-data').status_code==401
                    client.headers['Authorization']='Bearer '+env['FINPILOT_API_TOKEN']
                    assert client.get(url+'/api/source').json()['source']=='synthetic_demo'
                    assert client.get(url+'/api/history').status_code==200
                    assert client.get(url+'/api/notifications/settings').status_code==200
                    assert client.get(url+'/api/operator/jobs').status_code==404
                    assert client.post(url+'/api/research/preview',json={}).status_code==404
                    assert db.is_file()
            finally:stop_child(child)
            # Simulate Render discarding the entire writable directory at spin-down.
            for file in db.parent.iterdir():file.unlink()
            db.parent.rmdir()
    print('PASS: production Free-profile startup, auth, history, private boundaries and filesystem-loss restart')

if __name__=='__main__':run()
