"""Bounded SQLite records scoped to configured customer AND selected account."""
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from .models import Preferences

def now(): return datetime.now(timezone.utc).isoformat()

@contextmanager
def database():
    path=Path(os.getenv('PLUTUS_NOTIFICATIONS_DB', str(Path(__file__).resolve().parents[1]/'private_data'/'notifications.sqlite3')))
    path.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(path,timeout=5)
    path.chmod(0o600)
    db.row_factory=sqlite3.Row
    db.executescript("""
    CREATE TABLE IF NOT EXISTS alert_preferences(scope TEXT PRIMARY KEY, doc TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS watched_purchases(id TEXT PRIMARY KEY,scope TEXT NOT NULL,doc TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notification_claims(scope TEXT NOT NULL,event_key TEXT PRIMARY KEY,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notification_events(id INTEGER PRIMARY KEY,scope TEXT NOT NULL,event_key TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
    """)
    try:
        yield db
        db.commit()
    except BaseException:
        db.rollback();raise
    finally:db.close()

def preferences(db,scope):
    row=db.execute('SELECT doc FROM alert_preferences WHERE scope=?',(scope,)).fetchone()
    return Preferences.model_validate_json(row['doc']) if row else Preferences()

def save_preferences(db,scope,value):
    db.execute('INSERT INTO alert_preferences(scope,doc) VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET doc=excluded.doc',(scope,value.model_dump_json()))

def watches(db,scope):
    return [{**json.loads(r['doc']),'id':r['id'],'created_at':r['created_at']} for r in db.execute('SELECT * FROM watched_purchases WHERE scope=? ORDER BY created_at',(scope,))]

def history(db,scope):
    return [dict(r) for r in db.execute('SELECT id,kind,text,status,created_at FROM notification_events WHERE scope=? ORDER BY id DESC LIMIT 100',(scope,))]
