"""Single-customer service security. No client-selected customer or source URLs."""
import asyncio
import hmac
import os
import threading
import time
from dataclasses import dataclass, field

from starlette.responses import JSONResponse

from .data_loader import decode_json


def _csv(name, default):
    value = os.getenv(name)
    return default if value is None else tuple(v.strip() for v in value.split(',') if v.strip())


@dataclass(frozen=True)
class SecuritySettings:
    mode: str = 'local'
    api_token: str | None = field(default=None, repr=False)
    customer_id: str | None = None
    allowed_hosts: tuple[str, ...] = ('localhost', '127.0.0.1', 'testserver')
    allowed_origins: tuple[str, ...] = ()
    max_body_bytes: int = 128 * 1024
    requests_per_minute: int = 120
    max_concurrent_requests: int = 4
    body_timeout_seconds: float = 10.0

    def __post_init__(self):
        if self.mode not in ('local', 'production'):
            raise ValueError('FINPILOT_MODE must be local or production')
        if self.api_token is not None and (len(self.api_token) < 32 or
                                           not self.api_token.isascii() or
                                           any(c.isspace() for c in self.api_token)):
            raise ValueError('API token must contain at least 32 non-whitespace ASCII characters')
        if not self.allowed_hosts or any(not host.isascii() or '*' in host or '/' in host
                                         for host in self.allowed_hosts):
            raise ValueError('Explicit allowed hosts are required; wildcards are forbidden')
        from urllib.parse import urlsplit
        for origin in self.allowed_origins:
            parts = urlsplit(origin)
            if (not origin.isascii() or parts.scheme not in ('http', 'https') or not parts.hostname or
                    parts.username or parts.password or parts.path or parts.query or parts.fragment):
                raise ValueError('CORS origins must be exact HTTP(S) origins without paths')
            if self.mode == 'production' and parts.scheme != 'https':
                raise ValueError('Production CORS origins require HTTPS')
        if self.mode == 'production' and (
            not self.api_token or not self.customer_id or 'testserver' in self.allowed_hosts
        ):
            raise ValueError('Production requires a token, customer ID, and explicit deployment hosts')
        if not (1024 <= self.max_body_bytes <= 1024 * 1024):
            raise ValueError('Request body limit must be between 1 KiB and 1 MiB')
        if not (1 <= self.requests_per_minute <= 10000 and
                1 <= self.max_concurrent_requests <= 16 and 0 < self.body_timeout_seconds <= 30):
            raise ValueError('Invalid rate, concurrency, or body timeout limit')

    @classmethod
    def from_env(cls):
        return cls(
            mode=os.getenv('FINPILOT_MODE', 'local'),
            api_token=os.getenv('FINPILOT_API_TOKEN') or None,
            customer_id=os.getenv('FINPILOT_CUSTOMER_ID') or None,
            allowed_hosts=_csv('FINPILOT_ALLOWED_HOSTS', cls.allowed_hosts),
            allowed_origins=_csv('FINPILOT_CORS_ORIGINS', ()),
        )


class SecurityMiddleware:
    """Bound memory/work before parsing. Limits are global per app worker, not per IP.

    A single global rate bucket cannot be bypassed by changing IP/forwarded headers
    and cannot grow an unbounded map. Edge rate limiting remains necessary at scale.
    """
    def __init__(self, app, settings):
        self.app, self.settings = app, settings
        self.lock = threading.Lock()
        self.tokens = float(settings.requests_per_minute)
        self.updated = time.monotonic()
        self.active = 0

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        settings = self.settings

        async def secure_send(message):
            if message['type'] == 'http.response.start':
                headers = list(message.get('headers', []))
                headers.extend([
                    (b'cache-control', b'no-store'), (b'x-content-type-options', b'nosniff'),
                    (b'x-frame-options', b'DENY'), (b'referrer-policy', b'no-referrer'),
                    (b'permissions-policy', b'camera=(), microphone=(), geolocation=()'),
                ])
                origins = [value.decode('latin-1') for key, value in scope.get('headers', [])
                           if key.lower() == b'origin']
                if (len(origins) == 1 and origins[0] in settings.allowed_origins and
                        not any(key.lower() == b'access-control-allow-origin' for key, _ in headers)):
                    headers.extend([(b'access-control-allow-origin', origins[0].encode('ascii')),
                                    (b'vary', b'Origin')])
                if settings.mode == 'production':
                    headers.append((b'content-security-policy', b"default-src 'none'; frame-ancestors 'none'"))
                if scope.get('scheme') == 'https':
                    headers.append((b'strict-transport-security', b'max-age=31536000'))
                message = {**message, 'headers': headers}
            await send(message)

        async def reject(status, code, message, headers=None):
            await JSONResponse({'error': {'code': code, 'message': message}},
                               status_code=status, headers=headers)(scope, receive, secure_send)

        # Ignore forwarded headers here. Only an explicitly trusted deployment proxy
        # may change the ASGI scheme/client before this middleware.
        if settings.mode == 'production' and scope.get('scheme') != 'https':
            return await reject(400, 'https_required', 'HTTPS is required')
        client = scope.get('client')
        if settings.mode == 'local' and not settings.api_token and (
            not client or client[0] not in ('127.0.0.1', '::1', 'testclient')
        ):
            return await reject(403, 'local_only', 'Unauthenticated mode is loopback-only')

        with self.lock:
            now = time.monotonic()
            self.tokens = min(settings.requests_per_minute,
                              self.tokens + (now - self.updated) * settings.requests_per_minute / 60)
            self.updated = now
            rate_ok = self.tokens >= 1
            if rate_ok:
                self.tokens -= 1
        if not rate_ok:
            return await reject(429, 'rate_limit', 'Request limit exceeded', {'Retry-After': '60'})

        headers = {}
        for key, value in scope.get('headers', []):
            headers.setdefault(key.lower(), []).append(value)
        def single(key, default=b''):
            values = headers.get(key, [])
            return values[0] if len(values) == 1 else default

        if any(len(headers.get(key, [])) > 1 for key in
               (b'host', b'authorization', b'content-type', b'content-encoding')):
            return await reject(400, 'invalid_headers', 'Duplicate security-sensitive headers')
        from urllib.parse import urlsplit
        try:
            parts = urlsplit('//' + single(b'host').decode('ascii'))
            host = parts.hostname
            if parts.username or parts.password or parts.path or parts.query or parts.fragment:
                host = None
            _ = parts.port
        except (ValueError, UnicodeError):
            host = None
        if host not in settings.allowed_hosts:
            return await reject(400, 'invalid_host', 'Host is not allowed')

        # Preflights contain no customer data and still pass through CORS/host checks.
        preflight = scope['method'] == 'OPTIONS' and b'origin' in headers
        local_docs = settings.mode == 'local' and scope.get('path') in (
            '/docs', '/docs/oauth2-redirect', '/redoc', '/openapi.json')
        if settings.api_token and not preflight and not local_docs:
            supplied = single(b'authorization').decode('latin-1')
            expected = 'Bearer ' + settings.api_token
            if not hmac.compare_digest(supplied.encode('latin-1'), expected.encode('ascii')):
                return await reject(401, 'unauthorized', 'A valid bearer token is required',
                                    {'WWW-Authenticate': 'Bearer'})

        if scope['method'] in ('POST', 'PUT', 'PATCH'):
            if single(b'content-type').split(b';', 1)[0].strip().lower() != b'application/json':
                return await reject(415, 'unsupported_media_type', 'Use application/json')
            if single(b'content-encoding', b'identity').lower() != b'identity':
                return await reject(415, 'unsupported_encoding', 'Compressed request bodies are unsupported')
        lengths = headers.get(b'content-length', [])
        if lengths:
            if len(lengths) != 1 or not lengths[0].isdigit():
                return await reject(400, 'invalid_length', 'Invalid Content-Length')
            if len(lengths[0]) > 10 or int(lengths[0]) > settings.max_body_bytes:
                return await reject(413, 'request_too_large', 'Request body exceeds size limit')
        with self.lock:
            busy = self.active >= settings.max_concurrent_requests
            if not busy:
                self.active += 1
        if busy:
            return await reject(503, 'server_busy', 'Too many concurrent requests', {'Retry-After': '1'})
        started = False
        async def tracked_send(message):
            nonlocal started
            if message['type'] == 'http.response.start':
                started = True
            await secure_send(message)
        try:
            content = bytearray()
            deadline = time.monotonic() + settings.body_timeout_seconds
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise asyncio.TimeoutError
                message = await asyncio.wait_for(receive(), timeout=remaining)
                if message['type'] == 'http.disconnect':
                    return
                chunk = message.get('body', b'')
                if len(content) + len(chunk) > settings.max_body_bytes:
                    return await reject(413, 'request_too_large', 'Request body exceeds size limit')
                content.extend(chunk)
                if not message.get('more_body', False):
                    break
            if lengths and int(lengths[0]) != len(content):
                return await reject(400, 'invalid_length', 'Content-Length does not match body')
            if scope['method'] in ('POST', 'PUT', 'PATCH'):
                try:
                    parsed = decode_json(content.decode('utf-8'))
                    scope = {**scope, 'finpilot_json': parsed}
                except (ValueError, RecursionError, UnicodeError, ArithmeticError):
                    return await reject(422, 'validation_error', 'Invalid JSON body')
            delivered = False
            async def replay():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {'type': 'http.request', 'body': bytes(content), 'more_body': False}
                return await receive()
            await self.app(scope, replay, tracked_send)
        except asyncio.TimeoutError:
            if not started:
                await reject(408, 'request_timeout', 'Request body timed out')
        except Exception:
            # Never render exception text/source contents, even with debug clients.
            if not started:
                await reject(500, 'internal_error', 'An internal error occurred')
            else:
                raise
        finally:
            with self.lock:
                self.active -= 1
