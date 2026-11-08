"""Minimize accidental secret transmission; never log user/model payloads."""
import re

def safe_question(value):
    value = re.sub(r'nvapi-[A-Za-z0-9_-]+', '[redacted key]', value)
    value = re.sub(r'(?i)bearer\s+[^\s]+', '[redacted credential]', value)
    value = re.sub(r'(?i)(api[_ -]?key|token|password)\s*[:=]\s*[^\s]+', '[redacted credential]', value)
    return value[:2000]
