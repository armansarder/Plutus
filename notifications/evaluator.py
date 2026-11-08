"""Same-snapshot deterministic checks and guarded Photon delivery. No bank writes."""
import json
import os
import re
from calculation_engine.data_loader import DataSourceError
from decimal import Decimal
from datetime import timedelta
from urllib.request import Request, build_opener, HTTPRedirectHandler, ProxyHandler
from uuid import uuid4
from fastapi import HTTPException
from calculation_engine.history import build_history
from nemotron_agent.contracts import AgentRequest
from nemotron_agent.service import run_agent
from .store import database, preferences, watches, now

def delivery_mode():
    mode=os.getenv('PLUTUS_DELIVERY_MODE','preview')
    if mode not in ('preview','photon'):raise ValueError('PLUTUS_DELIVERY_MODE must be preview or photon')
    return mode

def recipient():
    value=os.getenv('PHOTON_TEST_RECIPIENT','')
    enrolled=bool(re.fullmatch(r'\+[1-9]\d{7,14}',value) and os.getenv('PHOTON_RECIPIENT_OPTED_IN','false').lower()=='true')
    return enrolled, ('••• '+value[-4:] if value else '')

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None

def urlopen(request,timeout):
    return build_opener(ProxyHandler({}),NoRedirect()).open(request,timeout=timeout)

def deliver_message(text):
    if delivery_mode()=='preview':return 'preview_only'
    if not recipient()[0]:return 'blocked_not_enrolled'
    secret=os.getenv('PHOTON_INTERNAL_SECRET','')
    if len(secret)<32:return 'blocked_missing_sender_secret'
    req=Request('http://127.0.0.1:8790/send',data=json.dumps({'message':text}).encode(),
                headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json'},method='POST')
    try:
        with urlopen(req,timeout=12) as response:
            return 'submitted_not_delivery_confirmed' if response.status in (200,202) else 'sender_rejected'
    except Exception:return 'delivery_unconfirmed'

def purchase_evidence(snapshot,item,source):
    start=snapshot.as_of_date+timedelta(days=snapshot.snapshot_basis=='intraday')
    when=max(start,__import__('datetime').date.fromisoformat(item['purchase_date'])) if item.get('purchase_date') else start
    request=AgentRequest(purchase_amount=Decimal(item['amount_cents'])/100,
        reserve=Decimal(item['reserve_cents'])/100,purchase_date=when,horizon_days=item['horizon_days'],allow_model=False)
    result=run_agent(request,snapshot,source)
    purchase=next(s for s in result.scenarios if s.name=='purchase')
    return {'ready':result.passport.recommendation=='consider_purchase',
            'recommendation':result.passport.recommendation,'minimum_balance':purchase.forecast.minimum_balance,
            'stress_tests_passed':result.stress_tests_passed,'stress_tests_total':result.stress_tests_total,
            'effective_purchase_date':when.isoformat(),'snapshot_id':result.provenance.snapshot_id}

def budget_evidence(snapshot,history_source,prefs):
    if not prefs.budget_alerts:return None
    if prefs.budget_limit_cents<=0:return None
    if history_source is None:return None
    try:result=build_history(history_source,month=snapshot.as_of_date.strftime('%Y-%m'),today=snapshot.as_of_date)
    except Exception:raise DataSourceError('Category history unavailable') from None
    if result['customer_id']!=snapshot.customer_id:raise DataSourceError('Category history scope mismatch')
    month=next((m for m in result['months'] if m['month']==snapshot.as_of_date.strftime('%Y-%m')),None)
    spent=sum((Decimal(g['amount']) for g in (month['by_category'] if month else []) if g['category'].casefold()==prefs.budget_category.casefold()),Decimal(0))
    cents=int(spent*100)
    return {'category':prefs.budget_category,'spent_cents':cents,'limit_cents':prefs.budget_limit_cents,
            'threshold_percent':prefs.threshold_percent,'period':snapshot.as_of_date.strftime('%Y-%m'),
            'above':cents*100>=prefs.budget_limit_cents*prefs.threshold_percent}

def record_alert(db,scope,key,kind,text):
    current=preferences(db,scope)
    if not current.enabled or (kind=='purchase_ready' and not current.purchase_alerts) or (kind=='budget_threshold' and not current.budget_alerts):return None
    cursor=db.execute('INSERT OR IGNORE INTO notification_claims(scope,event_key,created_at) VALUES (?,?,?)',
                      (scope,scope+':'+key,now()))
    if not cursor.rowcount:return None
    cursor=db.execute('INSERT INTO notification_events(scope,event_key,kind,text,status,created_at) VALUES (?,?,?,?,?,?)',
        (scope,scope+':'+key,kind,text,'claimed_not_submitted',now()))
    event_id=cursor.lastrowid
    db.commit() # Claim before sending. Never retry an uncertain submission automatically.
    status=deliver_message(text)
    db.execute('UPDATE notification_events SET status=? WHERE id=?',(status,event_id))
    # Retain only the latest 100 events for this account.
    db.execute('DELETE FROM notification_events WHERE scope=? AND id NOT IN (SELECT id FROM notification_events WHERE scope=? ORDER BY id DESC LIMIT 100)',(scope,scope))
    return status

def check_account(snapshot,scope,source,history_source):
    events=[]
    deferred=0
    with database() as db:
        prefs=preferences(db,scope)
        rows=watches(db,scope)
        evidence=[]
        # Compute everything before claiming any delivery, against one snapshot.
        for item in rows:
            try: info=purchase_evidence(snapshot,item,source)
            except ValueError:
                info={'ready':False,'limitation':'Saved date is outside the supported forecast. Edit or re-save the purchase.'}
            evidence.append((item,info))
        budget=budget_evidence(snapshot,history_source,prefs)
        for item,info in evidence:
            if prefs.enabled and prefs.purchase_alerts and info['ready'] and not item.get('last_ready',False):
                if len(events)>=3:
                    deferred+=1
                    continue # Leave transition pending for the next manual/periodic check.
                status=record_alert(db,scope,'purchase:'+item['id'],'purchase_ready',
                    'Plutus: a saved purchase now passes your selected cash-flow checks. Open Plutus to review the results and assumptions before deciding. No purchase was made.')
                if status:events.append(status)
            updated={k:v for k,v in item.items() if k not in ('id','created_at')}
            updated.update(last_ready=info['ready'])
            db.execute('UPDATE watched_purchases SET doc=? WHERE id=? AND scope=?',(json.dumps(updated),item['id'],scope))
        if prefs.enabled and prefs.budget_alerts and budget and budget['above']:
            version=f"{budget['period']}:{prefs.budget_category.casefold()}:{prefs.budget_limit_cents}:{prefs.threshold_percent}"
            if len(events)<3:
                status=record_alert(db,scope,'budget:'+version,'budget_threshold',
                    'Plutus: recorded spending reached a warning threshold you set. Open Plutus to review your spending and plan. No money was moved.')
                if status:events.append(status)
            else:deferred+=1
    return {'checked_at':now(),'source':source,'snapshot_date':snapshot.as_of_date.isoformat(),
            'watchlist':[{**item,**info} for item,info in evidence], 'budget':budget,
            'budget_limitation': 'Category history is unavailable; no budget alert was inferred.' if prefs.budget_alerts and budget is None else None,
            'event_statuses':events,'deferred_notifications':deferred,'mode':delivery_mode()}
