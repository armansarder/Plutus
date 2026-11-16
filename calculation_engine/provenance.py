"""Public source metadata; no credentials, account IDs or raw history."""
import hashlib
from datetime import datetime, timezone
from typing import Literal
from .models import Contract, Day

class SourceInfo(Contract):
    source: Literal['synthetic_demo', 'nessie_sandbox', 'configured_backend', 'research_scenario']
    label: str
    snapshot_date: Day
    snapshot_id: str
    observed_at: str
    cache_max_seconds: int
    schedule_complete: Literal[False] = False

def source_info(snapshot, source):
    from .nessie_adapter import NessieAdapter
    nessie = isinstance(source, NessieAdapter)
    kind = 'nessie_sandbox' if nessie else 'synthetic_demo' if snapshot.customer_id == 'synthetic_demo' else 'configured_backend'
    cached = getattr(getattr(source, 'raw_source', None), '_cache', None)
    return SourceInfo(source=kind, label={'nessie_sandbox': 'Nessie Sandbox',
        'synthetic_demo': 'Fictional Demo', 'configured_backend': 'Configured Source'}[kind],
        snapshot_date=snapshot.as_of_date,
        snapshot_id=hashlib.sha256(snapshot.model_dump_json().encode()).hexdigest()[:24],
        observed_at=cached[1]['fetched_at'] if cached else datetime.now(timezone.utc).isoformat(),
        cache_max_seconds=30 if nessie else 0)
