"""Local sandbox profile sessions. Deliberately not production authentication."""
import hashlib
import json
import os
import secrets
import time
from dataclasses import replace
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from pydantic import Field
from starlette.responses import JSONResponse
from calculation_engine.security import SecuritySettings, SecurityMiddleware
from calculation_engine.models import Contract, Transaction
from calculation_engine.main import DecimalJSONRoute

class Selection(Contract):
    profile: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,40}$')

class Schedule(Contract):
    events: list[Transaction] = Field(max_length=50)

class DemoGateway:
    def __init__(self, profiles, factory, settings):
        if settings.mode != 'local' or not settings.api_token:
            raise ValueError('Demo profiles require local mode and FINPILOT_API_TOKEN')
        if not 1 <= len(profiles) <= 12:
            raise ValueError('Configure 1–12 approved sandbox profiles')
        self.settings, self.sessions, self.children, self.labels = settings, {}, {}, {}
        for p in profiles:
            if not isinstance(p, dict) or set(p) - {'id','label','customer_id','account_id'} or not {'id','label','customer_id'} <= set(p):
                raise ValueError('Profiles require id, label, customer_id and optional account_id')
            slug = Selection(profile=p['id']).profile
            if slug in self.children: raise ValueError('Duplicate profile')
            self.labels[slug] = str(p['label'])[:80]
            self.children[slug] = factory(p, replace(settings, customer_id=p['customer_id']))
        api = FastAPI()
        api.router.route_class = DecimalJSONRoute
        @api.exception_handler(RequestValidationError)
        async def validation_error(request, exc):
            return JSONResponse({'error': 'Invalid profile or future-event inputs'}, status_code=422)

        @api.get('/api/demo/session')
        async def status(request: Request):
            session = self.lookup(request.headers.get('x-plutus-profile-session'))
            return {'enabled': True, 'profiles': [{'id': k, 'label': v} for k,v in self.labels.items()],
                    'active': session['profile'] if session else None,
                    'generation': session['generation'] if session else None,
                    'notice': 'Sandbox customer switcher. Anyone on this local demo can select approved profiles. Not a bank login.'}

        @api.post('/api/demo/session')
        async def select(body: Selection, request: Request):
            if body.profile not in self.children: raise HTTPException(403, 'Profile not approved')
            self.expire()
            if len(self.sessions) >= 64: raise HTTPException(429, 'Demo session limit reached')
            self.sessions.pop(self.key(request.headers.get('x-plutus-profile-session', '')), None)
            token = secrets.token_urlsafe(32)
            self.sessions[self.key(token)] = {'profile': body.profile, 'expires': time.monotonic()+1800, 'events': [], 'generation': secrets.token_hex(16)}
            response = JSONResponse({'selected': body.profile})
            response.headers['x-plutus-profile-session'] = token
            return response

        @api.delete('/api/demo/session')
        async def logout(request: Request):
            self.sessions.pop(self.key(request.headers.get('x-plutus-profile-session', '')), None)
            return {'logged_out': True}

        @api.put('/api/demo/schedule')
        async def schedule(body: Schedule, request: Request):
            session = self.lookup(request.headers.get('x-plutus-profile-session'))
            if not session: raise HTTPException(401, 'Select a sandbox customer')
            today = datetime.now(timezone.utc).date()
            if any(e.date <= today or (e.date-today).days > 90 for e in body.events):
                raise HTTPException(422, 'Use dates tomorrow through 90 days from today')
            if len({e.id for e in body.events}) != len(body.events): raise HTTPException(422, 'Duplicate event')
            session['events'] = [e.model_copy(update={'id': 'user_'+hashlib.sha256(e.id.encode()).hexdigest()[:24], 'source_status': 'estimated',
                'description': 'User-confirmed future income' if e.type == 'income' else 'User-confirmed extra expense'}) for e in body.events]
            return {'saved': len(body.events), 'notice': 'User-confirmed estimates; not Nessie records. Avoid duplicating existing bills.'}
        self.api = api

    @staticmethod
    def key(value): return hashlib.sha256((value or '').encode()).hexdigest()
    def expire(self):
        self.sessions = {k:v for k,v in self.sessions.items() if v['expires'] > time.monotonic()}
    def lookup(self, token):
        self.expire()
        return self.sessions.get(self.key(token))
    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http': return await self.api(scope, receive, send)
        headers = {}
        for k,v in scope.get('headers', []): headers.setdefault(k, []).append(v)
        if len(headers.get(b'x-plutus-profile-session', [])) > 1:
            return await JSONResponse({'error':'Duplicate session'},status_code=400)(scope,receive,send)
        auth = headers.get(b'authorization', [])
        expected = ('Bearer '+self.settings.api_token).encode()
        if len(auth) != 1 or not secrets.compare_digest(auth[0], expected):
            return await JSONResponse({'error':'Unauthorized'},status_code=401)(scope, receive, send)
        async def no_store(message):
            if message['type']=='http.response.start':
                message = {**message, 'headers': list(message.get('headers',[]))+[(b'cache-control',b'no-store')]}
            await send(message)
        if scope['path'].startswith('/api/demo/'):
            return await self.api(scope, receive, no_store)
        tokens = headers.get(b'x-plutus-profile-session', [])
        session = self.lookup(tokens[0].decode() if len(tokens)==1 else '')
        if not session:
            return await JSONResponse({'error':'Select a sandbox customer'},status_code=401)(scope,receive,no_store)
        scope = {**scope, 'plutus_confirmed_events': tuple(session['events']),
                 'plutus_profile_owner': self.key(tokens[0].decode())}
        return await self.children[session['profile']](scope,receive,no_store)


def from_env(factory):
    from pathlib import Path
    value = os.getenv('PLUTUS_DEMO_PROFILES')
    if value and os.getenv('PLUTUS_DEMO_PROFILES_FILE'): raise ValueError('Choose one profile configuration source')
    if not value:
        with Path(os.environ['PLUTUS_DEMO_PROFILES_FILE']).open() as f: value = f.read(16385)
    if len(value) > 16384: raise ValueError('Profile configuration is too large')
    profiles = json.loads(value)
    if not isinstance(profiles, list): raise ValueError('PLUTUS_DEMO_PROFILES must be a list')
    settings = SecuritySettings.from_env()
    return SecurityMiddleware(DemoGateway(profiles, factory, settings), settings)
