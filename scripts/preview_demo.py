"""Run the built fictional demo locally. No keys, live API reads or sends.
python scripts/preview_demo.py --port 18080
"""
import argparse,os,secrets,subprocess,sys,tempfile,time
import httpx
from pathlib import Path
from local_smoke import free_port,root,stop_child

def run(port):
    api_port=free_port()
    env={k:v for k,v in os.environ.items() if not k.startswith(('FINPILOT_','NESSIE_','NVIDIA_','PHOTON_','PLUTUS_','AGENT_'))}
    env.update(FINPILOT_MODE='local',FINPILOT_API_TOKEN=secrets.token_urlsafe(48),FINPILOT_CUSTOMER_ID='synthetic_demo',
        PLUTUS_DATA_MODE='demo',FINPILOT_ALLOWED_HOSTS='127.0.0.1,localhost',PLUTUS_COUNCIL_ENABLED='1',
        PLUTUS_SESSION_SECRET=secrets.token_urlsafe(48),PLUTUS_DELIVERY_MODE='preview',PLUTUS_ALERT_POLL_SECONDS='0',
        AGENT_DATA_SOURCE='demo',FINPILOT_DATA_SOURCE='mock',NVIDIA_API_KEY='',PLUTUS_PRIVATE_TOOLS='0',PLUTUS_RESEARCH_ENABLED='0')
    children=[]
    with tempfile.TemporaryDirectory() as temp:
        env['PLUTUS_NOTIFICATIONS_DB']=str(Path(temp)/'demo.sqlite3')
        try:
            children.append(subprocess.Popen([sys.executable,'-m','uvicorn','nemotron_agent.main:app','--host','127.0.0.1','--port',str(api_port)],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
            front=dict(env,NODE_ENV='production',HOST='127.0.0.1',PORT=str(port),FINPILOT_BACKEND_URL=f'http://127.0.0.1:{api_port}')
            children.append(subprocess.Popen(['node','.output/server/index.mjs'],cwd=root/'frontend',env=front,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
            with httpx.Client(trust_env=False,timeout=1) as client:
                for _ in range(100):
                    try:
                        if client.get(f'http://127.0.0.1:{port}/health').status_code==200:break
                    except httpx.HTTPError:pass
                    if any(child.poll() is not None for child in children):raise RuntimeError('Preview service exited')
                    time.sleep(.1)
                else:raise RuntimeError('Preview startup timed out')
            print(f'Fictional demo: http://127.0.0.1:{port}/dashboard (Ctrl+C stops both services)',flush=True)
            while all(child.poll() is None for child in children):time.sleep(.5)
            raise RuntimeError('Preview service exited; check build and available port')
        except KeyboardInterrupt:pass
        finally:
            for child in reversed(children):
                stop_child(child)
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=18080);args=parser.parse_args();run(args.port)
