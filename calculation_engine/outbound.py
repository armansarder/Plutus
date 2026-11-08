"""Bounded GET-only HTTPS reads to server-configured, public destinations."""
import ipaddress
import socket
import time
from urllib.parse import urlsplit

import httpx

MAX_SOURCE_BYTES = 2 * 1024 * 1024


def validate_destination(url, allowed_hosts):
    parts = urlsplit(url)
    if (parts.scheme != 'https' or not parts.hostname or parts.username or parts.password
            or parts.fragment or parts.query or parts.port not in (None, 443)
            or parts.hostname not in allowed_hosts):
        raise ValueError('Source requires an allowlisted HTTPS host, port 443, and no URL credentials/query')
    addresses = socket.getaddrinfo(parts.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Source must resolve only to public addresses')


def read_json_https(url, *, allowed_hosts, params=None, timeout=10.0, transport=None,
                    empty_on_404=False):
    # The destination is trusted configuration, never request input. A deployment
    # egress firewall is also required to protect against DNS rebinding/compromised DNS.
    validate_destination(url, allowed_hosts)
    from .data_loader import decode_json
    deadline = time.monotonic() + min(timeout, 15.0)
    with httpx.Client(timeout=min(timeout, 15.0), follow_redirects=False, trust_env=False,
                      transport=transport) as client:
        with client.stream('GET', url, params=params,
                           headers={'Accept': 'application/json', 'Accept-Encoding': 'identity'}) as response:
            if empty_on_404 and response.status_code == 404:
                return []  # Nessie returns 404 instead of [] for some empty collections
            if response.status_code != 200:
                raise ValueError('Upstream did not return HTTP 200')
            if response.headers.get('content-encoding', 'identity').lower() != 'identity':
                raise ValueError('Compressed source responses are unsupported')
            content = bytearray()
            for chunk in response.iter_raw():
                if time.monotonic() > deadline or len(content) + len(chunk) > MAX_SOURCE_BYTES:
                    raise ValueError('Source response exceeds time or size limit')
                content.extend(chunk)
    return decode_json(content.decode('utf-8-sig'))
