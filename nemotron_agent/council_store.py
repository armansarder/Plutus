"""Bounded, temporary, session-owned records. One process/worker only."""
import asyncio
import hashlib
import hmac
import re
import time
from dataclasses import dataclass, field
from uuid import uuid4
from fastapi import HTTPException


def session_signature(session, secret):
    return hmac.new(secret.encode(), ('plutus-council:' + session).encode(), hashlib.sha256).hexdigest()


def verify_session(value, secret):
    if not secret or not re.fullmatch(r'[a-f0-9]{64}\.[a-f0-9]{64}', value or ''):
        raise HTTPException(401, 'A signed browser session is required')
    identity, signature = value.split('.')
    if not hmac.compare_digest(signature, session_signature(identity, secret)):
        raise HTTPException(401, 'Invalid browser session')
    return identity


@dataclass
class Conversation:
    owner: tuple[str, str]
    role: str
    id: str = field(default_factory=lambda: uuid4().hex)
    updated: float = field(default_factory=time.monotonic)
    messages: list = field(default_factory=list)
    requests: dict = field(default_factory=dict)
    active: str | None = None
    cancellation: asyncio.Event | None = None


class CouncilStore:
    def __init__(self, limit=128, ttl=3600):
        self.items = {}
        self.limit, self.ttl = limit, ttl
        self.active_count = 0

    def purge(self):
        now = time.monotonic()
        for key in list(self.items):
            item = self.items[key]
            if not item.active and now - item.updated > self.ttl:
                del self.items[key]

    def create(self, owner, role):
        self.purge()
        if len(self.items) >= self.limit or sum(c.owner == owner for c in self.items.values()) >= 8:
            raise HTTPException(429, 'Conversation limit reached; clear an older chat')
        item = Conversation(owner, role)
        self.items[item.id] = item
        return item

    def get(self, owner, id):
        self.purge()
        item = self.items.get(id)
        if item is None or item.owner != owner:
            raise HTTPException(404, 'Conversation not found or expired')
        item.updated = time.monotonic()
        return item

    def begin(self, item, request):
        digest = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
        if request.request_key in item.requests:
            previous = item.requests[request.request_key]
            if previous['digest'] != digest:
                raise HTTPException(409, 'Request key already used for different input')
            if previous['result'] is not None:
                return previous['result']
            raise HTTPException(409, 'Request still running or interrupted; inspect history before retrying')
        if item.active or self.active_count >= 2:
            raise HTTPException(409, 'Another analysis is active; wait or cancel')
        if len(item.requests) >= 8:
            raise HTTPException(429, 'Chat request limit reached; create a new chat')
        item.requests[request.request_key] = {'digest': digest, 'result': None}
        item.active = request.request_key
        item.cancellation = asyncio.Event()
        self.active_count += 1
        return None

    def finish(self, item, request, result):
        item.requests[request.request_key]['result'] = result
        item.messages.append({'request_key': request.request_key, 'message': request.message, 'result': result})
        item.messages[:] = item.messages[-10:]
        self.release(item)

    def release(self, item):
        if item.active is not None:
            self.active_count -= 1
        item.active = None
        item.cancellation = None
        item.updated = time.monotonic()
