"""Repeatable local milestone gates. No providers, sends or credentials required."""
import re
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run(label):
    commands = [
        [sys.executable, '-m', 'pytest', 'tests', '-q'],
        ['npm.cmd' if sys.platform == 'win32' else 'npm', 'test', '--prefix', 'frontend'],
        ['node', 'frontend/node_modules/typescript/bin/tsc', '--noEmit', '-p', 'frontend/tsconfig.json'],
        ['npm.cmd' if sys.platform == 'win32' else 'npm', 'run', 'check', '--prefix', 'photon_service'],
        ['npm.cmd' if sys.platform == 'win32' else 'npm', 'run', 'build', '--prefix', 'frontend'],
        [sys.executable, 'scripts/local_smoke.py'],
        [sys.executable, 'scripts/production_tls_smoke.py'],
        [sys.executable, 'scripts/nessie_wire_smoke.py'],
        ['node', 'scripts/check_render.mjs'],
        ['node', 'scripts/check_render_free.mjs'],
        [sys.executable, 'scripts/free_demo_smoke.py'],
        ['git', 'diff', '--check'],
    ]
    record = [f'\n## {label}\n']
    for command in commands:
        print('Checking:', ' '.join(command[1:]), flush=True)
        environment=dict(os.environ)
        if 'build' in command:environment.update(NODE_ENV='production',VITE_DATA_MODE='remote',VITE_SITUATION_DATA_MODE='remote',VITE_COUNCIL_ENABLED='true')
        result = subprocess.run(command, cwd=ROOT, env=environment, capture_output=True, text=True, encoding='utf-8', errors='replace')
        output = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', result.stdout + result.stderr)
        summaries = [line.strip() for line in output.splitlines() if re.search(r'\d+ passed|Tests\s+|Test Files\s+', line)]
        record.append((f'- `{ " ".join(command[1:]) }`: ' + ('PASS' if result.returncode == 0 else 'FAIL') + ' ' + '; '.join(summaries)).rstrip())
        if result.returncode:
            print(output[-12000:]); raise SystemExit(result.returncode)
    paths = set(subprocess.check_output(['git', 'diff', '--name-only'], cwd=ROOT).decode().splitlines())
    paths.update(subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=ROOT).decode().splitlines())
    for name in paths:
        path = ROOT/name
        pattern = re.escape('-----' + 'BEGIN ') + r'.*PRIVATE KEY|\b(?:nvapi-|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}'
        if path.is_file() and re.search(pattern, path.read_text(encoding='utf-8-sig')):
            raise SystemExit('Credential candidate; inspect privately: ' + name)
    record.append('- Changed-file credential-pattern scan: PASS (bounded pattern scan, not proof about all history).')
    report = ROOT/'docs/PLUTUS_V2_TEST_RESULTS.md'
    with report.open('a', encoding='utf-8') as stream: stream.write('\n'.join(record)+'\n')
    print('\n'.join(record), flush=True)

if __name__ == '__main__': run(sys.argv[1] if len(sys.argv)>1 else 'Final regression')
