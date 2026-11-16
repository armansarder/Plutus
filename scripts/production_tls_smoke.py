"""Production-mode Python + built Node over verified local TLS, fictional data only."""
import os
from pathlib import Path
import secrets
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import httpx
from local_smoke import free_port,root,stop_child
from production_smoke import smoke

def run():
    openssl=shutil.which('openssl') or ('C:/Program Files/Git/usr/bin/openssl.exe' if os.name=='nt' else None)
    if not openssl or not Path(openssl).is_file():raise RuntimeError('OpenSSL is required for local verified TLS smoke')
    api_port,web_port=free_port(),free_port()
    api,web=f'https://127.0.0.1:{api_port}',f'http://127.0.0.1:{web_port}'
    env={k:v for k,v in os.environ.items() if not k.startswith(('FINPILOT_','NESSIE_','NVIDIA_','PHOTON_','PLUTUS_','AGENT_'))}
    env.update(FINPILOT_MODE='production',FINPILOT_API_TOKEN=secrets.token_urlsafe(48),
        FINPILOT_CUSTOMER_ID='synthetic_demo',FINPILOT_ALLOWED_HOSTS='127.0.0.1,localhost',
        PLUTUS_DATA_MODE='demo',PLUTUS_COUNCIL_ENABLED='1',PLUTUS_PUBLIC_DEMO='1',
        PLUTUS_SESSION_SECRET=secrets.token_urlsafe(48),PLUTUS_DELIVERY_MODE='preview',PLUTUS_ALERT_POLL_SECONDS='0',
        AGENT_DATA_SOURCE='demo',FINPILOT_DATA_SOURCE='mock',NVIDIA_API_KEY='')
    env.update(PLUTUS_PRIVATE_TOOLS='1',PLUTUS_OPERATOR_TOKEN=secrets.token_urlsafe(48),PLUTUS_RESEARCH_ENABLED='1')
    children=[]
    with tempfile.TemporaryDirectory() as temp:
        cert,key=Path(temp)/'cert.pem',Path(temp)/'key.pem'
        subprocess.run([openssl,'req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        context=ssl.create_default_context(cafile=str(cert))
        env['PLUTUS_NOTIFICATIONS_DB']=str(Path(temp)/'notifications.sqlite3')
        try:
            children.append(subprocess.Popen([sys.executable,'-m','uvicorn','nemotron_agent.main:app','--host','127.0.0.1','--port',str(api_port),'--ssl-keyfile',str(key),'--ssl-certfile',str(cert)],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
            front=dict(env,NODE_ENV='production',HOST='127.0.0.1',PORT=str(web_port),FINPILOT_BACKEND_URL=api,NODE_EXTRA_CA_CERTS=str(cert),PLUTUS_PRIVATE_TOOLS='0')
            children.append(subprocess.Popen(['node','.output/server/index.mjs'],cwd=root/'frontend',env=front,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
            for _ in range(100):
                try:
                    with httpx.Client(verify=context,trust_env=False,timeout=1) as c:
                        if all(c.get(url+'/health').status_code==200 for url in (api,web)):break
                except httpx.HTTPError:pass
                if any(child.poll() is not None for child in children):raise RuntimeError('Production server exited')
                time.sleep(.1)
            smoke(web,api,'synthetic_demo',verify=context)
            private_port=free_port();private_url=f'http://127.0.0.1:{private_port}'
            password=secrets.token_urlsafe(48)
            private_env=dict(front,PORT=str(private_port),PLUTUS_PRIVATE_TOOLS='1',PLUTUS_OPERATOR_PASSWORD=password)
            children.append(subprocess.Popen(['node','.output/server/index.mjs'],cwd=root/'frontend',env=private_env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
            with httpx.Client(trust_env=False,timeout=30) as c:
                for _ in range(100):
                    try:
                        if c.get(private_url+'/health').status_code==200:break
                    except httpx.HTTPError:pass
                    time.sleep(.1)
                assert c.get(private_url+'/operator').status_code==401
                c.auth=('operator',password)
                assert c.get(private_url+'/operator').status_code==200
                assert c.get(private_url+'/api/operator/jobs').json()=={'jobs':[]}
                assert c.get(private_url+'/research').status_code==200
                previews=[]
                for condition in ('direct','evidence'):
                    r=c.post(private_url+'/api/research/preview',json={'scenario_id':'comfortable','seed':42,'condition':condition})
                    assert r.status_code==200 and not r.json()['collection_enabled']
                    previews.append(r.json()['financial_truth'])
                assert previews[0]==previews[1]
            print('PASS: production Council, auth, API and built Node over certificate-verified backend TLS')
        finally:
            for child in reversed(children):
                stop_child(child)

if __name__=='__main__':run()
