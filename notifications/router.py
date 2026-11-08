"""Notification APIs bound to the same configured account as Council and engine."""
import asyncio
import json
import os
import threading
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from .models import Preferences, WatchPurchase
from .store import database, preferences, save_preferences, watches, history, now
from .evaluator import delivery_mode,recipient,check_account,purchase_evidence


def install_notifications(app,snapshot_dependency,source):
    settings=app.state.security_settings
    customer=settings.customer_id or ('synthetic_demo' if source=='synthetic_demo' else None)
    account=getattr(app.state.financial_source,'account_id',None) or 'configured-source'
    scope=(customer or 'unconfigured')+':'+account
    lock=threading.Lock()
    poll=int(os.getenv('PLUTUS_ALERT_POLL_SECONDS','0'))
    if poll and not 60<=poll<=86400:raise ValueError('Alert polling must be disabled or 60–86400 seconds')
    delivery_mode()
    router=APIRouter(prefix='/api/notifications',tags=['Photon alerts'])
    def owner(request:Request):
        if not settings.api_token or not customer:raise HTTPException(503,'Alerts require a configured customer and service token')
        if request.query_params:raise HTTPException(400,'Client-selected customer or account is not supported')
        return scope

    @router.get('/settings')
    def settings_view(identity=Depends(owner)):
        with database() as db:prefs=preferences(db,identity)
        enrolled,masked=recipient()
        return {'preferences':prefs.model_dump(),'mode':delivery_mode(),'recipient_enrolled':enrolled,
                'recipient_masked':masked,'poll_seconds':poll,
                'poll_failed':bool(getattr(app.state,'alert_poll_failed',False)),
                'scope':'One configured account; local demo access only. Not multi-user authentication.'}

    @router.put('/settings')
    def update(body:Preferences,identity=Depends(owner)):
        if body.budget_alerts and body.budget_limit_cents<=0:raise HTTPException(422,'Set a category budget before enabling its alerts')
        if body.enabled and delivery_mode()=='photon' and not recipient()[0]:raise HTTPException(422,'Configure and enroll the demo recipient before enabling live texts')
        with database() as db:save_preferences(db,identity,body)
        return {'saved':True}

    @router.get('/watchlist')
    def list_watches(identity=Depends(owner)):
        with database() as db:return watches(db,identity)

    @router.post('/watchlist')
    def add(body:WatchPurchase,identity=Depends(owner),snapshot=Depends(snapshot_dependency)):
        if snapshot.customer_id!=customer:raise HTTPException(403,'Snapshot customer mismatch')
        info=purchase_evidence(snapshot,body.model_dump(mode='json'),source)
        with database() as db:
            rows=watches(db,identity)
            # Duplicate submissions return the existing watch rather than another future text.
            doc=body.model_dump(mode='json')
            for item in rows:
                if all(item.get(k)==v for k,v in doc.items()):return {**item,**info}
            if len(rows)>=10:raise HTTPException(409,'At most ten watched purchases; remove one first')
            id=uuid4().hex;created=now()
            doc['last_ready']=info['ready']
            db.execute('INSERT INTO watched_purchases(id,scope,doc,created_at) VALUES (?,?,?,?)',(id,identity,json.dumps(doc),created))
            return {**doc,'id':id,'created_at':created,**info}

    @router.delete('/watchlist/{id}')
    def remove(id:str,identity=Depends(owner)):
        with database() as db:
            if not db.execute('DELETE FROM watched_purchases WHERE scope=? AND id=?',(identity,id)).rowcount:raise HTTPException(404,'Watch not found')
        return {'removed':True}

    @router.get('/history')
    def events(identity=Depends(owner)):
        with database() as db:return history(db,identity)

    def perform(snapshot):
        if snapshot.customer_id!=customer:raise HTTPException(403,'Snapshot customer mismatch')
        if not lock.acquire(blocking=False):raise HTTPException(409,'An alert check is already running')
        try:return check_account(snapshot,scope,source,app.state.history_source)
        finally:lock.release()

    @router.post('/check')
    def check(identity=Depends(owner),snapshot=Depends(snapshot_dependency)):
        return perform(snapshot)

    task=None
    async def worker():
        while True:
            await asyncio.sleep(poll)
            try:
                with database() as db:enabled=preferences(db,scope).enabled
                if not enabled:continue
                def tick():
                    req=Request({'type':'http','app':app,'headers':[]})
                    return perform(snapshot_dependency(req))
                await run_in_threadpool(tick)
                app.state.alert_poll_failed=False
            except asyncio.CancelledError:raise
            except Exception:app.state.alert_poll_failed=True # no raw records or URLs in logs
    async def start():
        nonlocal task
        if poll and customer and settings.api_token:task=asyncio.create_task(worker())
    async def stop():
        if task:
            task.cancel()
            try:await task
            except asyncio.CancelledError:pass
    app.include_router(router)
    from contextlib import asynccontextmanager
    previous_lifespan=app.router.lifespan_context
    @asynccontextmanager
    async def lifespan(application):
        async with previous_lifespan(application) as state:
            await start()
            try:yield state
            finally:await stop()
    app.router.lifespan_context=lifespan
