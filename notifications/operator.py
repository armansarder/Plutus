"""Read-only financial evaluation and authorized delivery administration; no bank writes."""
import hmac
import os
import re
from fastapi import APIRouter, Depends, Header, HTTPException
from .store import database
from .jobs import initialize, summaries, drain
from .evaluator import deliver_message

def require_operator(x_plutus_operator: str | None=Header(None)):
    secret=os.getenv('PLUTUS_OPERATOR_TOKEN','')
    if os.getenv('PLUTUS_PRIVATE_TOOLS')!='1':raise HTTPException(404,'Not found')
    if len(secret)<32 or not x_plutus_operator or not hmac.compare_digest(x_plutus_operator,secret):
        raise HTTPException(403,'Operator authorization required')

def install_operator(app,snapshot_dependency,source):
    router=APIRouter(prefix='/api/operator',dependencies=[Depends(require_operator)])
    settings=app.state.security_settings
    scope=(settings.customer_id or 'synthetic_demo')+':'+(getattr(app.state.financial_source,'account_id',None) or 'configured-source')
    @router.get('/jobs')
    def jobs():
        with database() as db:return {'jobs':summaries(db,scope)}
    @router.post('/jobs/{id}/{action}')
    def action(id:str,action:str):
        if not re.fullmatch('[a-f0-9]{32}',id) or action not in ('retry','cancel'):raise HTTPException(404,'Not found')
        with database() as db:
            initialize(db)
            row=db.execute('SELECT * FROM alert_jobs WHERE id=? AND scope=?',(id,scope)).fetchone()
            if not row:raise HTTPException(404,'Not found')
            if action=='cancel':
                if row['status'] not in ('queued','failed'):raise HTTPException(409,'Submission can no longer be cancelled')
                db.execute("UPDATE alert_jobs SET status='cancelled' WHERE id=?",(id,))
            else:
                if row['status']!='failed' or row['attempts']>=3 or row['outcome'] not in ('sender_unavailable','blocked_not_enrolled','blocked_missing_sender_secret'):
                    raise HTTPException(409,'Unsafe or exhausted retry')
                db.execute("UPDATE alert_jobs SET status='queued',due=0 WHERE id=?",(id,))
        return {'saved':True}
    @router.post('/process')
    def process():
        # The transport remains preview unless separately configured/enrolled.
        drain(deliver_message,scope)
        return {'processed':True}
    @router.post('/evaluate')
    def evaluate(snapshot=Depends(snapshot_dependency)):
        from .evaluator import check_account
        result=check_account(snapshot,scope,source,app.state.history_source)
        return {'checked_at':result['checked_at'],'source':result['source'],'events':len(result['event_statuses'])}
    app.include_router(router)
