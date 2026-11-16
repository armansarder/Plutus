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


def create_app(source=None, settings=None, provider=None, council_provider=None):
    mode = os.getenv('AGENT_DATA_SOURCE') or ('nessie' if os.getenv('FINPILOT_DATA_SOURCE') == 'nessie' else 'demo')
    explicit = os.getenv('PLUTUS_DATA_MODE')
    if explicit:
        if explicit not in ('demo', 'nessie'):
            raise ValueError('PLUTUS_DATA_MODE must be demo or nessie; research is isolated')
        expected = 'nessie' if explicit == 'nessie' else 'mock'
        if (os.getenv('AGENT_DATA_SOURCE') not in (None, explicit) or
                os.getenv('FINPILOT_DATA_SOURCE') not in (None, expected)):
            raise ValueError('Conflicting financial data modes')
        mode = explicit
    if mode not in ('demo', 'engine', 'nessie'):
        raise ValueError('AGENT_DATA_SOURCE must be demo, engine, or nessie')
    if mode == 'demo' and os.getenv('FINPILOT_DATA_SOURCE') == 'nessie':
        raise ValueError('Conflicting data sources: select AGENT_DATA_SOURCE=nessie or engine')
    label = 'synthetic_demo' if source is None and mode == 'demo' else 'configured_engine_source'
    if source is None and mode == 'demo':
        source = FunctionAdapter(demo_snapshot)
    app = create_engine_app(source=source, settings=settings,
                           data_source_mode='nessie' if mode == 'nessie' else 'mock' if explicit == 'demo' else None)
    if os.getenv('PLUTUS_PUBLIC_DEMO') == '1':
        if mode not in ('demo','nessie') or os.getenv('PLUTUS_DELIVERY_MODE','preview') != 'preview':
            raise ValueError('Public fictional demo requires demo/Nessie sandbox source and preview delivery')
        if mode == 'nessie' and not getattr(app.state.financial_source,'account_id',None):
            raise ValueError('Public Nessie demo requires an explicit owned account selection')
    from calculation_engine.nessie_adapter import NessieAdapter
    if isinstance(app.state.financial_source, NessieAdapter):
        label = 'nessie_sandbox'
    if label == 'synthetic_demo' and app.state.history_source is None:
        from calculation_engine.demo_history import DemoHistory
        app.state.history_source = DemoHistory()
    app.title = 'Plutus Agent and Simulation API'
    # Reuse the exact ownership-checked data dependency from the engine route.
    route = next(r for r in app.routes if getattr(r, 'path', None) == '/api/financial-data')
    snapshot_dependency = next(d.call for d in route.dependant.dependencies if d.name == 'data')

    @app.post('/api/agent/run', response_model=AgentResponse, operation_id='run_agent')
    def agent_run(body: AgentRequest, snapshot=Depends(snapshot_dependency)):
        return run_agent(body, snapshot, label, provider=provider)

    from notifications.router import install_notifications
    install_notifications(app, snapshot_dependency, label)
    from notifications.operator import install_operator
    install_operator(app, snapshot_dependency, label)
    from research.preview import install_research
    install_research(app)
    # Legacy shadow/mutation controls are retained in Git history, never installed.

    from .council_api import install_council
    install_council(app, snapshot_dependency, label, provider=council_provider)

    @app.get('/health')
    def health():
        return {'status': 'ok', 'schema_version': '1.0'}

    return app


app = create_app()
