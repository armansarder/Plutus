"""HTTP tool boundary. Run from repo root: python -m uvicorn calculation_engine.main:app"""
import os
import logging

from fastapi import Depends, FastAPI, Query, Request, HTTPException, Security
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .data_loader import DataSourceError, JsonFileAdapter, load_financial_data, decode_json
from .models import (CompareRequest, ForecastRequest, PurchaseRequest, ErrorResponse,
                     FinancialResponse, SimulationResponse, ForecastResponse, ComparisonResponse)
from .security import SecurityMiddleware, SecuritySettings
from .simulator import compare_scenarios, forecast_cash_flow, simulate_purchase
from .history import HistoryResponse, NessieHistorySource, RawDirHistorySource, build_history


class DecimalJSONRequest(Request):
    async def json(self):
        # Preserve exact JSON numbers through Pydantic instead of first rounding
        # them to binary floats. Do not stringify other fields or weaken strict text validation.
        if 'finpilot_json' in self.scope:
            return self.scope['finpilot_json']
        return decode_json((await self.body()).decode('utf-8'))


class DecimalJSONRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()
        async def handle(request):
            return await original(DecimalJSONRequest(request.scope, request.receive))
        return handle


def create_app(source=None, settings: SecuritySettings | None = None, history_source=None,
               data_source_mode: str | None = None):
    settings = settings if settings is not None else SecuritySettings.from_env()
    source_mode = data_source_mode or os.getenv('FINPILOT_DATA_SOURCE', 'mock')
    if source is None:
        if source_mode == 'nessie':
            from .nessie_adapter import NessieAdapter
            from .nessie_adapter import DEFAULT_NESSIE_BASE_URL
            if not settings.api_token or not settings.customer_id:
                raise ValueError('Nessie requires FINPILOT_API_TOKEN and FINPILOT_CUSTOMER_ID')
            if os.getenv('FINPILOT_UPCOMING_FILE'):
                raise ValueError('Unset FINPILOT_UPCOMING_FILE: Nessie mode uses source-dated bills, not inferred schedules')
            nessie_records = NessieHistorySource(
                api_key=os.getenv('NESSIE_API_KEY', ''), customer_id=settings.customer_id,
                base_url=os.getenv('NESSIE_BASE_URL', DEFAULT_NESSIE_BASE_URL),
                account_id=os.getenv('NESSIE_ACCOUNT_ID') or None, select_single=True,
                cache_seconds=30.0)
            source = NessieAdapter(
                api_key=os.getenv('NESSIE_API_KEY', ''),
                account_id=os.getenv('NESSIE_ACCOUNT_ID') or None,
                customer_id=settings.customer_id,
                base_url=os.getenv('NESSIE_BASE_URL', DEFAULT_NESSIE_BASE_URL),
                currency=os.getenv('FINPILOT_CURRENCY', 'USD'),
                raw_source=nessie_records,
            )
            history_source = nessie_records
        elif source_mode in ('mock', 'file'):
            path = os.getenv('FINPILOT_DATA_FILE')
            if source_mode == 'file' and not path:
                raise ValueError('File source requires FINPILOT_DATA_FILE')
            if (source_mode == 'file' or path) and (not settings.api_token or not settings.customer_id):
                raise ValueError('External files require a token and configured customer ID')
            source = JsonFileAdapter(path or JsonFileAdapter().path)
        else:
            raise ValueError('FINPILOT_DATA_SOURCE must be mock, file, or nessie')
    if history_source is None:
        history_dir = os.getenv('FINPILOT_HISTORY_DIR')
        if source_mode == 'nessie':
            history_source = NessieHistorySource(
                api_key=os.getenv('NESSIE_API_KEY', ''), customer_id=settings.customer_id,
                base_url=os.getenv('NESSIE_BASE_URL', ''))
        elif history_dir:
            if not settings.api_token or not settings.customer_id:
                raise ValueError('History files require a token and configured customer ID')
            history_source = RawDirHistorySource(history_dir, customer_id=settings.customer_id)
    from .nessie_adapter import NessieAdapter
    if isinstance(source, NessieAdapter) and (
        not settings.api_token or settings.customer_id != source.customer_id
    ):
        raise ValueError('Nessie requires authentication bound to its configured customer')
    # Nessie authenticates with a query key. Do not emit outbound URLs in INFO/DEBUG logs.
    for name in ('httpx', 'httpcore', 'httpcore.connection', 'httpcore.http11', 'httpcore.http2'):
        logging.getLogger(name).setLevel(logging.WARNING)
    errors = {status: {'model': ErrorResponse} for status in
              (400, 401, 403, 404, 405, 408, 413, 415, 422, 429, 500, 503)}
    app = FastAPI(title="FinPilot Simulation API", version='1.0.0',
                  description='Read-only projections. Money is returned as decimal strings.',
                  docs_url='/docs' if settings.mode == 'local' else None,
                  redoc_url='/redoc' if settings.mode == 'local' else None,
                  openapi_url='/openapi.json' if settings.mode == 'local' else None,
                  dependencies=[Security(HTTPBearer(auto_error=False))], responses=errors)
    app.state.financial_source = source
    app.state.history_source = history_source
    app.router.route_class = DecimalJSONRoute
    app.state.security_settings = settings
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins),
                       allow_credentials=False, allow_methods=['GET', 'POST'],
                       allow_headers=['Authorization', 'Content-Type'], max_age=600)
    app.add_middleware(SecurityMiddleware, settings=settings)

    def get_data(request: Request):
        data = load_financial_data(request.app.state.financial_source)
        if settings.customer_id and data.customer_id != settings.customer_id:
            raise HTTPException(status_code=403, detail='Source customer does not match authorized customer')
        return data

    from starlette.exceptions import HTTPException as StarletteHTTPException
    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        return JSONResponse(status_code=exc.status_code, content={
            'error': {'code': 'http_error', 'message': str(exc.detail)}}, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exc):
        return JSONResponse(status_code=422, content={
            'error': {'code': 'validation_error', 'message': 'Request violates the API schema',
                      'details': [{'location': list(e['loc']), 'message': e['type']}
                                  for e in exc.errors()[:20]]}})

    @app.exception_handler(ValidationError)
    @app.exception_handler(ValueError)
    async def invalid_calculation(request, exc):
        return JSONResponse(status_code=422, content={
            'error': {'code': 'validation_error', 'message': 'Invalid financial inputs or unsupported calculation range'}})

    @app.exception_handler(DataSourceError)
    async def invalid_source(request, exc):
        return JSONResponse(status_code=503, content={
            'error': {'code': 'data_source_error', 'message': 'Financial source is unavailable or invalid'}})

    @app.get('/api/financial-data', operation_id='get_financial_data',
             response_model=FinancialResponse, response_model_exclude_none=True)
    def financial_data(data=Depends(get_data)):
        from .nessie_adapter import NessieAdapter
        return {'data': data.model_dump(mode='json'),
                'source': 'nessie_sandbox' if isinstance(app.state.financial_source, NessieAdapter)
                else 'synthetic_demo' if data.customer_id == 'synthetic_demo' else 'configured_backend'}

    @app.post('/api/simulate', operation_id='simulate_purchase',
              response_model=SimulationResponse, response_model_exclude_none=True)
    def simulate(body: PurchaseRequest, data=Depends(get_data)):
        return {'data': simulate_purchase(data, body.purchase_amount, body.purchase_date)}

    @app.post('/api/forecast', operation_id='forecast_cash_flow',
              response_model=ForecastResponse, response_model_exclude_none=True)
    def forecast(body: ForecastRequest, data=Depends(get_data)):
        return {'data': forecast_cash_flow(data, body.start_date, body.end_date)}

    @app.post('/api/compare', operation_id='compare_scenarios',
              response_model=ComparisonResponse, response_model_exclude_none=True)
    def compare(body: CompareRequest, data=Depends(get_data)):
        return {'data': compare_scenarios(data, body.scenarios)}

    @app.get('/api/history', operation_id='get_transaction_history',
             response_model=HistoryResponse, response_model_exclude_none=True)
    def history(request: Request,
                month: str | None = Query(None, pattern=r'^\d{4}-(0[1-9]|1[0-2])$'),
                months: int = Query(6, ge=1, le=24)):
        source = request.app.state.history_source
        if source is None:
            raise HTTPException(status_code=503, detail='History requires FINPILOT_DATA_SOURCE=nessie or FINPILOT_HISTORY_DIR')
        try:
            result = build_history(source, currency=os.getenv('FINPILOT_CURRENCY', 'USD'),
                                   month=month, months_back=months)
        except Exception as exc:
            raise DataSourceError('History source is unavailable or invalid') from exc
        if settings.customer_id and result['customer_id'] != settings.customer_id:
            raise HTTPException(status_code=403, detail='Source customer does not match authorized customer')
        return {'data': result}

    return app


app = create_app()
