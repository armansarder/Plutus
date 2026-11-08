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
    if mode not in ('demo', 'engine', 'nessie'):
        raise ValueError('AGENT_DATA_SOURCE must be demo, engine, or nessie')
    if mode == 'demo' and os.getenv('FINPILOT_DATA_SOURCE') == 'nessie':
        raise ValueError('Conflicting data sources: select AGENT_DATA_SOURCE=nessie or engine')
    label = 'synthetic_demo' if source is None and mode == 'demo' else 'configured_engine_source'
    if source is None and mode == 'demo':
        source = FunctionAdapter(demo_snapshot)
    app = create_engine_app(source=source, settings=settings,
                           data_source_mode='nessie' if mode == 'nessie' else None)
    from calculation_engine.nessie_adapter import NessieAdapter
    if isinstance(app.state.financial_source, NessieAdapter):
        label = 'nessie_sandbox'
    app.title = 'Plutus Agent and Simulation API'
    # Reuse the exact ownership-checked data dependency from the engine route.
    route = next(r for r in app.routes if getattr(r, 'path', None) == '/api/financial-data')
    snapshot_dependency = next(d.call for d in route.dependant.dependencies if d.name == 'data')

    @app.post('/api/agent/run', response_model=AgentResponse, operation_id='run_agent')
    def agent_run(body: AgentRequest, snapshot=Depends(snapshot_dependency)):
        return run_agent(body, snapshot, label, provider=provider)

    from .council_api import install_council
    install_council(app, snapshot_dependency, label, provider=council_provider)

    @app.get('/health')
    def health():
        return {'status': 'ok', 'schema_version': '1.0'}

    return app


def configured_app():
    if not (os.getenv('PLUTUS_DEMO_PROFILES') or os.getenv('PLUTUS_DEMO_PROFILES_FILE')):
        return create_app()
    from .demo_gateway import from_env
    from calculation_engine.nessie_adapter import NessieAdapter, DEFAULT_NESSIE_BASE_URL
    from calculation_engine.history import NessieHistorySource
    def factory(profile, settings):
        records = NessieHistorySource(api_key=os.getenv('NESSIE_API_KEY', ''),
            customer_id=settings.customer_id, account_id=profile.get('account_id'),
            base_url=os.getenv('NESSIE_BASE_URL', DEFAULT_NESSIE_BASE_URL), select_single=True, cache_seconds=30)
        source = NessieAdapter(api_key=os.getenv('NESSIE_API_KEY', ''), account_id=profile.get('account_id'),
            customer_id=settings.customer_id, base_url=records.base_url,
            currency=os.getenv('FINPILOT_CURRENCY', 'USD'), raw_source=records)
        app = create_app(source=source, settings=settings)
        app.state.history_source = records
        return app
    return from_env(factory)

app = configured_app()
