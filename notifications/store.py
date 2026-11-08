"""Durable persistence for Plutus notification preferences, watchlist, and demo state."""
import json
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from calculation_engine.models import FinancialData, Transaction

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "plutus_notifications.sqlite3"


def get_db_path() -> Path:
    return Path(os.getenv("PLUTUS_NOTIFICATIONS_DB", str(DEFAULT_DB_PATH)))

DEMO_CUSTOMER_IDS = {"synthetic_demo", "0898b0b0-88cc-4011-ba91-3057e1b480a0", "alex_rivera"}


def clean_phone(phone: str) -> str:
    """Normalize phone to E.164-like string or empty."""
    stripped = re.sub(r"[^\d+]", "", phone.strip())
    if not stripped:
        return ""
    if stripped.startswith("+"):
        return stripped
    if len(stripped) == 10:
        return "+1" + stripped
    if len(stripped) == 11 and stripped.startswith("1"):
        return "+" + stripped
    return "+" + stripped


def mask_phone(phone: str) -> str:
    """Mask phone number safely, showing only last 4 digits. Never log unmasked phone."""
    p = clean_phone(phone)
    if not p or len(p) < 4:
        return ""
    last4 = p[-4:]
    return f"+1 (•••) •••-{last4}"


def is_phone_verified(phone: str) -> bool:
    """Outbound demo delivery is restricted strictly to the verified enrolled test recipient."""
    enrolled = clean_phone(os.getenv("PLUTUS_DEMO_PHONE_E164") or os.getenv("PHOTON_TEST_RECIPIENT") or "")
    if not enrolled:
        return False
    return clean_phone(phone) == enrolled


def initial_demo_state() -> dict[str, Any]:
    """Authoritative baseline financial state for demo customer Alex Rivera."""
    return {
        "customerId": "synthetic_demo",
        "customerName": "Alex Rivera",
        "asOf": "2026-11-08",
        "balance": "900.00",
        "currency": "USD",
        "monthlyBudget": {
            "category": "Groceries",
            "allocatedCents": 50000,   # $500.00
            "spentCents": 38000,       # $380.00
            "thresholdPercent": 85,
            "period": "2026-11",
            "lastObservedAbove": False,
        },
        "scheduled": [
            {"id": "rent", "date": "2026-11-11", "amount": "-900.00", "description": "Rent", "type": "expense", "source_status": "confirmed"},
            {"id": "pay_1", "date": "2026-11-15", "amount": "1300.00", "description": "Paycheck", "type": "income", "source_status": "estimated"},
            {"id": "grocery", "date": "2026-11-19", "amount": "-150.00", "description": "Groceries", "type": "expense", "source_status": "estimated"},
            {"id": "utility", "date": "2026-11-21", "amount": "-120.00", "description": "Utilities", "type": "expense", "source_status": "estimated"},
            {"id": "pay_2", "date": "2026-11-29", "amount": "1300.00", "description": "Paycheck", "type": "income", "source_status": "estimated"},
        ],
        "version": 1,
        "lastEvaluation": None,
    }


@contextmanager
def get_db():
    db = sqlite3.connect(get_db_path())
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout=5000")
    db.execute("PRAGMA journal_mode=WAL")
    
    # Initialize tables
    db.execute("""
        CREATE TABLE IF NOT EXISTS preferences (
            customer_id TEXT PRIMARY KEY,
            phone_number TEXT NOT NULL DEFAULT '',
            enabled INTEGER NOT NULL DEFAULT 0,
            budget_alerts INTEGER NOT NULL DEFAULT 1,
            purchase_alerts INTEGER NOT NULL DEFAULT 1,
            threshold_percent INTEGER NOT NULL DEFAULT 85,
            verified INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS watchlist (
            id TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL,
            label TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            reserve_cents INTEGER NOT NULL,
            purchase_date TEXT NOT NULL,
            horizon_days INTEGER NOT NULL DEFAULT 30,
            last_ready INTEGER NOT NULL DEFAULT 0,
            notified INTEGER NOT NULL DEFAULT 0,
            last_result TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT NOT NULL,
            alert_key TEXT UNIQUE NOT NULL,
            kind TEXT NOT NULL,
            text TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS demo_state (
            id INTEGER PRIMARY KEY CHECK (id=1),
            doc TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
        )
    """)
    
    # Initialize demo state if absent
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT OR IGNORE INTO demo_state (id, doc, version, updated_at) VALUES (1, ?, 1, ?)",
        (json.dumps(initial_demo_state()), now)
    )
    db.commit()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def load_preferences(db: sqlite3.Connection, customer_id: str = "synthetic_demo") -> dict[str, Any]:
    row = db.execute("SELECT * FROM preferences WHERE customer_id=?", (customer_id,)).fetchone()
    if row:
        return dict(row)
    now = datetime.now(timezone.utc).isoformat()
    # Notifications start disabled by default unless explicitly saved
    prefs = {
        "customer_id": customer_id,
        "phone_number": "",
        "enabled": 0,
        "budget_alerts": 1,
        "purchase_alerts": 1,
        "threshold_percent": 85,
        "verified": 0,
        "updated_at": now,
    }
    db.execute("""
        INSERT OR IGNORE INTO preferences 
        (customer_id, phone_number, enabled, budget_alerts, purchase_alerts, threshold_percent, verified, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        prefs["customer_id"], prefs["phone_number"], prefs["enabled"],
        prefs["budget_alerts"], prefs["purchase_alerts"], prefs["threshold_percent"],
        prefs["verified"], prefs["updated_at"]
    ))
    db.commit()
    return prefs


def save_preferences(
    db: sqlite3.Connection,
    customer_id: str,
    phone_number: str,
    enabled: bool,
    budget_alerts: bool,
    purchase_alerts: bool,
    threshold_percent: int,
) -> dict[str, Any]:
    cleaned = clean_phone(phone_number)
    verified = 1 if is_phone_verified(cleaned) else 0
    now = datetime.now(timezone.utc).isoformat()
    db.execute("""
        INSERT INTO preferences 
        (customer_id, phone_number, enabled, budget_alerts, purchase_alerts, threshold_percent, verified, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(customer_id) DO UPDATE SET
            phone_number=excluded.phone_number,
            enabled=excluded.enabled,
            budget_alerts=excluded.budget_alerts,
            purchase_alerts=excluded.purchase_alerts,
            threshold_percent=excluded.threshold_percent,
            verified=excluded.verified,
            updated_at=excluded.updated_at
    """, (
        customer_id, cleaned, 1 if enabled else 0,
        1 if budget_alerts else 0, 1 if purchase_alerts else 0,
        threshold_percent, verified, now
    ))
    db.commit()
    return load_preferences(db, customer_id)


def load_demo_state(db: sqlite3.Connection) -> dict[str, Any]:
    row = db.execute("SELECT doc FROM demo_state WHERE id=1").fetchone()
    if not row:
        init = initial_demo_state()
        now = datetime.now(timezone.utc).isoformat()
        db.execute("INSERT OR REPLACE INTO demo_state (id, doc, version, updated_at) VALUES (1, ?, 1, ?)",
                   (json.dumps(init), now))
        db.commit()
        return init
    return json.loads(row["doc"])


def save_demo_state(db: sqlite3.Connection, state: dict[str, Any]) -> None:
    version = state.get("version", 1) + 1
    state["version"] = version
    now = datetime.now(timezone.utc).isoformat()
    db.execute("UPDATE demo_state SET doc=?, version=?, updated_at=? WHERE id=1",
               (json.dumps(state), version, now))
    db.commit()


def reset_demo_state(db: sqlite3.Connection) -> None:
    """Safe reset for demo. Restores initial financial balances and transactions.

    Clears alert logs and resets watchlist notified status, while preserving user
    notification preferences.
    """
    db.execute("DELETE FROM alerts")
    db.execute("UPDATE watchlist SET last_ready=0, notified=0")
    now = datetime.now(timezone.utc).isoformat()
    fresh = initial_demo_state()
    db.execute("UPDATE demo_state SET doc=?, version=version+1, updated_at=? WHERE id=1",
               (json.dumps(fresh), now))
    db.commit()


def get_authoritative_financial_data(customer_id: str = "synthetic_demo") -> FinancialData:
    """Constructs a strict FinancialData model from the authoritative state."""
    with get_db() as db:
        state = load_demo_state(db)
    
    upcoming = []
    for t in state["scheduled"]:
        upcoming.append(Transaction(
            id=t["id"],
            date=t["date"],
            description=t["description"],
            amount=Decimal(t["amount"]),
            type=t["type"],
            source_status=t.get("source_status", "estimated")
        ))
    
    return FinancialData(
        customer_id=customer_id if customer_id in DEMO_CUSTOMER_IDS else "synthetic_demo",
        currency=state["currency"],
        as_of_date=state["asOf"],
        current_balance=Decimal(state["balance"]),
        snapshot_basis="opening",
        upcoming_transactions=upcoming,
        source_notes=[
            "Authoritative demo financial state for Alex Rivera.",
            "Deterministic 30-day projections based on scheduled events.",
        ],
    )
