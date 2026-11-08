"""Independent service, reusing the team's authenticated API and data adapters."""
import os
from pathlib import Path
from datetime import datetime, timezone
from fastapi import Depends
from dotenv import load_dotenv
from calculation_engine.main import create_app as create_engine_app
from calculation_engine.data_loader import FunctionAdapter
from .check import fixture
from .contracts import AgentRequest, AgentResponse
from .service import run_agent

load_dotenv(Path(__file__).with_name('.env'), override=False)


def demo_snapshot():
    data = fixture()
    offset = datetime.now(timezone.utc).date() - data.as_of_date
    data.as_of_date += offset
    for event in data.upcoming_transactions:
        event.date += offset
    return data


def create_app(source=None, settings=None, provider=None):
    mode = os.getenv('AGENT_DATA_SOURCE', 'demo')
    if mode not in ('demo', 'engine'):
        raise ValueError('AGENT_DATA_SOURCE must be demo or engine')
    label = 'synthetic_demo' if source is None and mode == 'demo' else 'configured_engine_source'
    if source is None and mode == 'demo':
        source = FunctionAdapter(demo_snapshot)
    app = create_engine_app(source=source, settings=settings)
    app.title = 'Plutus Agent and Simulation API'
    # Reuse the exact ownership-checked data dependency from the engine route.
    route = next(r for r in app.routes if getattr(r, 'path', None) == '/api/financial-data')
    snapshot_dependency = next(d.call for d in route.dependant.dependencies if d.name == 'data')

    @app.post('/api/agent/run', response_model=AgentResponse, operation_id='run_agent')
    def agent_run(body: AgentRequest, snapshot=Depends(snapshot_dependency)):
        return run_agent(body, snapshot, label, provider=provider)

    @app.get('/health')
    def health():
        return {'status': 'ok', 'schema_version': '1.0'}

    return app


app = create_app()
