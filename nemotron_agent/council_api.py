"""Opt-in v2 routes. Shared service auth plus signed per-browser session ownership."""
import asyncio
import os
import time
from fastapi import APIRouter, Depends, HTTPException, Request
from .council import AsyncNvidiaProvider, CouncilRun, fingerprint
from .council_contracts import ConversationCreate, ConversationView, MessageRequest, RunResult, CouncilStatus
from .council_store import CouncilStore, verify_session
from .data_safety import safe_question


def install_council(app, snapshot_dependency, source, provider=None):
    settings = app.state.security_settings
    enabled = os.getenv('PLUTUS_COUNCIL_ENABLED') == '1'
    if enabled and not settings.api_token:
        raise ValueError('Council requires FINPILOT_API_TOKEN and the signed-session frontend proxy')
    if enabled and settings.mode == 'production':
        raise ValueError('Council sessions require local mode; integrate real application authentication before production')
    store = CouncilStore(limit=32, ttl=1800)
    app.state.council_store = store
    router = APIRouter(prefix='/api/v2')

    def owner(request: Request):
        if not enabled:
            raise HTTPException(404, 'Council feature is disabled')
        session = verify_session(request.headers.get('x-plutus-session'), settings.api_token)
        return (settings.customer_id or 'configured_source', session)

    def view(item):
        return ConversationView(id=item.id, role=item.role, messages=item.messages, busy=item.active is not None)

    @router.get('/council/status', response_model=CouncilStatus)
    def status():
        key = os.getenv('NVIDIA_API_KEY', '')
        configured = bool(key and 'PASTE_' not in key and not any(c.isspace() for c in key))
        return CouncilStatus(enabled=enabled, roles=['council', 'budget', 'risk', 'simulator'],
            model_configured=configured,
            scope='Temporary signed-browser sessions for one configured customer; local use only. No user login or durable storage.')

    @router.post('/conversations', response_model=ConversationView)
    async def create(body: ConversationCreate, identity=Depends(owner)):
        return view(store.create(identity, body.role))

    @router.get('/conversations/{id}', response_model=ConversationView)
    async def read(id: str, identity=Depends(owner)):
        return view(store.get(identity, id))

    @router.delete('/conversations/{id}')
    async def clear(id: str, identity=Depends(owner)):
        item = store.get(identity, id)
        if item.active:
            raise HTTPException(409, 'Cancel the active analysis before clearing')
        del store.items[id]
        return {'cleared': True}

    @router.post('/conversations/{id}/messages/{key}/cancel')
    async def cancel(id: str, key: str, identity=Depends(owner)):
        item = store.get(identity, id)
        if item.active == key and item.cancellation:
            item.cancellation.set()
        return {'cancel_requested': item.active == key}

    @router.post('/conversations/{id}/messages', response_model=RunResult)
    async def message(id: str, body: MessageRequest, request: Request, identity=Depends(owner)):
        item = store.get(identity, id)
        cached = store.begin(item, body)
        if cached is not None:
            return cached
        run = None
        task = None
        try:
            # Source dependency is called only after ownership and idempotency checks.
            # It is the same ownership-checking loader used by the existing engine.
            from starlette.concurrency import run_in_threadpool
            started = time.monotonic()
            try:
                snapshot = await asyncio.wait_for(run_in_threadpool(snapshot_dependency, request), timeout=12)
            except TimeoutError:
                raise HTTPException(503, 'Financial snapshot timed out') from None
            if len(snapshot.upcoming_transactions) > 200:
                raise HTTPException(422, 'Council supports at most 200 scheduled events per snapshot')
            current = fingerprint(snapshot)
            if body.expected_snapshot_id and body.expected_snapshot_id != current:
                raise HTTPException(409, 'Snapshot changed; start a new chat or refresh the decision')
            handoff = None
            if body.handoff:
                if item.role != 'council':
                    raise HTTPException(422, 'Handoffs may only target Council')
                source_id, run_id = body.handoff.split(':')
                previous = store.get(identity, source_id)
                result = next((m['result'] for m in previous.messages if m['result'].run_id == run_id), None)
                if result is None or result.snapshot_id != current:
                    raise HTTPException(409, 'Handoff unavailable or based on a different snapshot')
                if result.analysis:
                    confirmed = body.analysis
                    old = result.analysis
                    selected = next(s for s in old.scenarios if s.name == 'purchase')
                    from .adapter import SimulatorAdapter
                    if confirmed is None:
                        raise HTTPException(422, 'Confirm the original purchase fields for this handoff')
                    check = SimulatorAdapter(snapshot, confirmed)
                    if (format(confirmed.purchase_amount, '.2f') != old.passport.purchase_amount or
                            format(confirmed.reserve, '.2f') != old.passport.reserve or
                            check.purchase_date != selected.purchase_date or check.end != old.passport.horizon_end):
                        raise HTTPException(409, 'Handoff decision differs; confirm the original fields or start a separate comparison')
                handoff = [f.model_dump() for v in result.reviews if v.status == 'complete' for f in v.findings][:8]
            run = CouncilRun(item, body, snapshot, source, provider or AsyncNvidiaProvider(), handoff, deadline=max(.1, 60 - (time.monotonic() - started)))
            if item.cancellation.is_set() or await request.is_disconnected():
                result = run.output('cancelled', 'Analysis cancelled before model dispatch.')
                store.finish(item, body.model_copy(update={'message': safe_question(body.message)}), result)
                return result
            task = asyncio.create_task(run.execute())
            while not task.done():
                await asyncio.wait({task}, timeout=.15)
                if item.cancellation.is_set() or await request.is_disconnected():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                    run.event(item.role, 'user_cancelled', 'cancelled')
                    result = run.output('cancelled', 'Analysis cancelled. Only completed, validated findings are shown.')
                    store.finish(item, body.model_copy(update={'message': safe_question(body.message)}), result)
                    return result
            result = await task
            # Never retain obvious pasted API credentials in temporary chat records.
            saved = body.model_copy(update={'message': safe_question(body.message)})
            store.finish(item, saved, result)
            return result
        finally:
            if run is None:
                item.requests.pop(body.request_key, None)
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            store.release(item)

    app.include_router(router)
