"""Durable delivery ledger. Unknown outcomes are never retried automatically."""
import logging
import time
from uuid import uuid4
from .store import database, now

log=logging.getLogger('plutus.alerts')
TERMINAL={'preview','provider_accepted','delivery_unconfirmed','cancelled'}

def initialize(db):
    db.execute('''CREATE TABLE IF NOT EXISTS alert_jobs (
      id TEXT PRIMARY KEY, scope TEXT NOT NULL, event_key TEXT UNIQUE NOT NULL,
      kind TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, due REAL NOT NULL,
      outcome TEXT, created_at TEXT NOT NULL)''')
    db.execute('''CREATE TABLE IF NOT EXISTS alert_attempts (
      id INTEGER PRIMARY KEY, job_id TEXT NOT NULL, attempt INTEGER NOT NULL,
      outcome TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(job_id,attempt))''')

def enqueue(db,scope,key,kind,text):
    initialize(db)
    id=uuid4().hex
    db.execute('INSERT OR IGNORE INTO alert_jobs(id,scope,event_key,kind,text,status,due,created_at) VALUES (?,?,?,?,?,?,?,?)',
               (id,scope,key,kind,text,'queued',time.time(),now()))
    return db.execute('SELECT id FROM alert_jobs WHERE event_key=?',(key,)).fetchone()['id']

def process(id,deliver,clock=time.time):
    with database() as db:
        initialize(db)
        from .store import preferences
        pending=db.execute('SELECT * FROM alert_jobs WHERE id=?',(id,)).fetchone()
        if pending is None:return None
        prefs=preferences(db,pending['scope'])
        if not prefs.enabled or (pending['kind']=='purchase_ready' and not prefs.purchase_alerts) or (pending['kind']=='budget_threshold' and not prefs.budget_alerts):
            db.execute("UPDATE alert_jobs SET status='cancelled' WHERE id=? AND status='queued'",(id,))
            return None
        # One atomic durable claim. A crash after this point is an unknown outcome.
        claimed=db.execute("UPDATE alert_jobs SET status='submitting', attempts=attempts+1 WHERE id=? AND status='queued' AND due<=? AND attempts<3",(id,clock()))
        if not claimed.rowcount:return None
        row=db.execute('SELECT * FROM alert_jobs WHERE id=?',(id,)).fetchone()
        db.execute('INSERT INTO alert_attempts(job_id,attempt,outcome,created_at) VALUES (?,?,?,?)',
                   (id,row['attempts'],'submitting',now()))
    try:outcome=deliver(row['text'])
    except Exception:outcome='delivery_unconfirmed'
    if outcome=='preview_only':status='preview'
    elif outcome=='submitted_not_delivery_confirmed':status='provider_accepted'
    elif outcome=='delivery_unconfirmed':status='delivery_unconfirmed'
    elif outcome=='sender_unavailable' and row['attempts']<3:status='queued'
    else:status='failed'
    with database() as db:
        initialize(db)
        db.execute('UPDATE alert_jobs SET status=?,outcome=?,due=? WHERE id=?',
                   (status,outcome,clock()+min(300,5*2**row['attempts']),id))
        db.execute('UPDATE alert_attempts SET outcome=? WHERE job_id=? AND attempt=?',
                   (outcome,id,row['attempts']))
        db.execute('UPDATE notification_events SET status=? WHERE event_key=?',(outcome,row['event_key']))
    log.info('alert_attempt status=%s attempt=%d',status,row['attempts'])
    return outcome

def recover():
    with database() as db:
        initialize(db)
        db.execute("UPDATE alert_jobs SET status='delivery_unconfirmed',outcome='worker_restart_unconfirmed' WHERE status='submitting'")
        db.execute("UPDATE alert_attempts SET outcome='worker_restart_unconfirmed' WHERE outcome='submitting'")

def drain(deliver,scope,limit=3):
    with database() as db:
        initialize(db)
        ids=[r['id'] for r in db.execute("SELECT id FROM alert_jobs WHERE scope=? AND status='queued' AND due<=? ORDER BY due LIMIT ?",(scope,time.time(),limit))]
    return [process(id,deliver) for id in ids]

def summaries(db,scope):
    initialize(db)
    return [dict(row) for row in db.execute('SELECT id,kind,status,attempts,outcome,created_at FROM alert_jobs WHERE scope=? ORDER BY created_at DESC LIMIT 100',(scope,))]
