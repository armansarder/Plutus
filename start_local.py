"""Shared local launcher: configured Nessie or explicit credential-free fictional demo."""
import os
import hashlib
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import secrets
import tempfile

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent
CONFIG_FILES = (ROOT / 'calculation_engine/.env', ROOT / 'nemotron_agent/.env')


def configuration_version():
    """Opaque change detector; configuration contents are never logged."""
    return tuple(hashlib.sha256(path.read_bytes()).digest() if path.is_file() else None
                 for path in CONFIG_FILES)


def stop_child(child):
    if child.poll() is not None:
        return
    if os.name == 'nt':
        # Windows venv Python can spawn an interpreter child. Terminate the whole
        # tree owned by this launcher, so that child cannot retain the old token.
        subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    else:
        child.terminate()
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()


def environments(inherited, values):
    backend = dict(inherited)
    backend.update({k: v for k, v in values.items() if v is not None})
    required = ('FINPILOT_API_TOKEN', 'NESSIE_API_KEY', 'FINPILOT_CUSTOMER_ID', 'NESSIE_ACCOUNT_ID')
    if any(not backend.get(k) for k in required):
        raise ValueError('Required credentials or account configuration are missing. For the credential-free fictional demo, run npm run dev:demo')
    if backend.get('FINPILOT_MODE') != 'local' or backend.get('FINPILOT_DATA_SOURCE') != 'nessie':
        raise ValueError('Local launcher requires local mode and Nessie source')
    backend['AGENT_DATA_SOURCE'] = 'nessie'
    backend['PLUTUS_COUNCIL_ENABLED'] = '1'
    frontend = dict(inherited)
    for key in list(frontend):
        if key.startswith(('NESSIE_', 'NVIDIA_')):
            frontend.pop(key)
    frontend.update(FINPILOT_API_TOKEN=backend['FINPILOT_API_TOKEN'],
                    FINPILOT_BACKEND_URL='http://127.0.0.1:8000',
                    VITE_DATA_MODE='remote', VITE_SITUATION_DATA_MODE='remote',
                    VITE_COUNCIL_ENABLED='true')
    return backend, frontend


def load_environments():
    values = dict(dotenv_values(ROOT / 'nemotron_agent/.env'))
    values.update(dotenv_values(ROOT / 'calculation_engine/.env'))
    backend, frontend = environments(os.environ, values)
    from calculation_engine.security import SecuritySettings
    from calculation_engine.nessie_adapter import NessieAdapter, DEFAULT_NESSIE_BASE_URL
    SecuritySettings(mode='local', api_token=backend['FINPILOT_API_TOKEN'],
                     customer_id=backend['FINPILOT_CUSTOMER_ID'])
    NessieAdapter(api_key=backend['NESSIE_API_KEY'], account_id=backend['NESSIE_ACCOUNT_ID'],
                  customer_id=backend['FINPILOT_CUSTOMER_ID'],
                  base_url=backend.get('NESSIE_BASE_URL', DEFAULT_NESSIE_BASE_URL))
    return backend, frontend


def demo_environments(inherited, database_path):
    """Explicit offline profile; ignore saved/live settings and never write secrets."""
    clean = {k: v for k, v in inherited.items() if not k.startswith(
        ('FINPILOT_', 'NESSIE_', 'NVIDIA_', 'PHOTON_', 'PLUTUS_', 'AGENT_', 'VITE_'))}
    backend = dict(clean, PYTHON_DOTENV_DISABLED='1', FINPILOT_MODE='local',
        FINPILOT_API_TOKEN=secrets.token_urlsafe(48),
        PLUTUS_SESSION_SECRET=secrets.token_urlsafe(48),
        FINPILOT_CUSTOMER_ID='synthetic_demo', FINPILOT_ALLOWED_HOSTS='127.0.0.1,localhost',
        FINPILOT_DATA_SOURCE='mock', AGENT_DATA_SOURCE='demo', PLUTUS_DATA_MODE='demo',
        PLUTUS_COUNCIL_ENABLED='1', PLUTUS_PRIVATE_TOOLS='0', PLUTUS_RESEARCH_ENABLED='0',
        PLUTUS_DELIVERY_MODE='preview', PLUTUS_ALERT_POLL_SECONDS='0',
        PHOTON_RECIPIENT_OPTED_IN='false', NVIDIA_API_KEY='',
        PLUTUS_NOTIFICATIONS_DB=str(database_path))
    frontend = dict(clean, NODE_ENV='development',
        FINPILOT_API_TOKEN=backend['FINPILOT_API_TOKEN'],
        PLUTUS_SESSION_SECRET=backend['PLUTUS_SESSION_SECRET'], PLUTUS_PRIVATE_TOOLS='0',
        FINPILOT_BACKEND_URL='http://127.0.0.1:8000', VITE_API_BASE_URL='',
        VITE_DATA_MODE='remote', VITE_SITUATION_DATA_MODE='remote', VITE_COUNCIL_ENABLED='true')
    return backend, frontend


def reuse_running_app(backend, occupied):
    if not occupied:
        return False
    if occupied != {8000, 8080}:
        raise ValueError('An old server occupies port ' + '/'.join(map(str, sorted(occupied))) +
                         '. Stop that terminal with Ctrl+C, then run npm run dev again')
    try:
        with httpx.Client(trust_env=False, timeout=3) as client:
            auth = {'Authorization': 'Bearer ' + backend['FINPILOT_API_TOKEN']}
            api = client.get('http://127.0.0.1:8000/api/v2/council/status', headers=auth)
            ui = client.get('http://127.0.0.1:8080/api/v2/council/status')
            expected_key = backend.get('NVIDIA_API_KEY', '')
            expected_model = bool(expected_key and 'PASTE_' not in expected_key and not any(c.isspace() for c in expected_key))
            if (api.status_code != 200 or ui.status_code != 200 or
                    api.json().get('model_configured') != expected_model or
                    not api.json().get('enabled') or api.json() != ui.json()):
                raise ValueError('configuration mismatch')
    except Exception:
        raise ValueError('Existing servers use different or stale settings. Stop their terminal with Ctrl+C, then run npm run dev again') from None
    print('Plutus is already running: http://127.0.0.1:8080/dashboard', flush=True)
    return True


def run_once(demo_database=None):
    children = []
    try:
        version = configuration_version() if demo_database is None else None
        backend, frontend = (demo_environments(os.environ, demo_database)
                             if demo_database is not None else load_environments())
        occupied = set()
        for port in (8000, 8080):
            with socket.socket() as sock:
                if sock.connect_ex(('127.0.0.1', port)) == 0:
                    occupied.add(port)
        if reuse_running_app(backend, occupied):
            return 0
        node = shutil.which('node')
        vite = ROOT / 'frontend/node_modules/vite/bin/vite.js'
        if not node or not vite.is_file():
            raise ValueError('Run npm install in frontend first')
        api = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'nemotron_agent.main:app',
                                '--host', '127.0.0.1', '--port', '8000'], cwd=ROOT, env=backend)
        children.append(api)
        source_status = None
        with httpx.Client(trust_env=False, timeout=15) as client:
            for _ in range(40):
                if api.poll() is not None:
                    raise ValueError('Backend exited during startup')
                try:
                    response = client.get('http://127.0.0.1:8000/api/financial-data',
                                          headers={'Authorization': 'Bearer ' + backend['FINPILOT_API_TOKEN']})
                    source_status = response.status_code
                    if response.status_code in (429, 503):
                        print('Financial source is temporarily unavailable. Starting the website with a retryable error; no substitute data is used.', flush=True)
                        break
                    if response.status_code != 200:
                        raise ValueError(f'Authenticated financial source check failed: HTTP {response.status_code}')
                    expected_source = 'synthetic_demo' if demo_database is not None else 'nessie_sandbox'
                    if response.json().get('source') != expected_source:
                        raise ValueError('Backend did not return the selected source')
                    break
                except httpx.ConnectError:
                    time.sleep(0.25)
                except httpx.TimeoutException:
                    print('Financial source check timed out. Starting the website with recovery controls; no substitute data is used.', flush=True)
                    break
            else:
                raise ValueError('Backend startup timed out')
        if source_status == 200:
            print('Authenticated ' + ('fictional demo' if demo_database is not None else 'Nessie') + ' check: HTTP 200.', flush=True)
        print('Starting http://127.0.0.1:8080/dashboard', flush=True)
        children.append(subprocess.Popen([node, str(vite), 'dev', '--host', '127.0.0.1',
                                          '--port', '8080', '--strictPort'], cwd=ROOT / 'frontend', env=frontend))
        while all(child.poll() is None for child in children):
            time.sleep(0.5)
            saved_version = configuration_version() if demo_database is None else None
            if demo_database is None and saved_version != version:
                try:
                    load_environments()
                except Exception:
                    print('Saved configuration is invalid; keeping the current services running. Fix the configuration and save again.', flush=True)
                    version = saved_version
                    continue
                print('Saved configuration changed; restarting local services. Temporary chats will reset.', flush=True)
                return 2
        raise ValueError('A local server exited; stopped the other server')
    except KeyboardInterrupt:
        return 0
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception:
        print('Local startup failed; private exception details suppressed', file=sys.stderr)
        return 1
    finally:
        for child in reversed(children):
            stop_child(child)


def main():
    if sys.argv[1:] == ['--demo']:
        with tempfile.TemporaryDirectory(prefix='plutus-local-demo-') as temp:
            print('LOCAL FICTIONAL DEMO: no live providers; temporary settings/chats reset on exit.', flush=True)
            return run_once(Path(temp) / 'notifications.sqlite3')
    if sys.argv[1:]:
        print('Usage: python start_local.py [--demo]', file=sys.stderr)
        return 1
    while True:
        result = run_once()
        if result != 2:
            return result


if __name__ == '__main__':
    sys.exit(main())
