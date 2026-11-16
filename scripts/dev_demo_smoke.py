"""Exercise the actual root npm dev:demo command; stop its owned process tree."""
import os
import shutil
import socket
import subprocess
import time
import httpx
from local_smoke import root, stop_child
from production_smoke import smoke

def run():
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
        print('PASS: npm run dev:demo; Vite/Node + FastAPI, dashboard, simulator, Multiverse, Council, auth and private boundaries')
    finally:stop_child(child)

if __name__=='__main__':run()
