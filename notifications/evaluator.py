"""Deterministic alert evaluator and Photon 2.0 delivery for Plutus."""
import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from calculation_engine.models import FinancialData, Transaction
from calculation_engine.simulator import forecast_cash_flow
from calculation_engine.readiness import evaluate_purchase_readiness
from .store import get_authoritative_financial_data, save_demo_state


def deliver_message(text: str) -> str:
    """Outbound delivery to the localhost Photon sender service (port 8790).

    Automated tests and preview runs return 'preview_only' without sending real texts.
    """
    mode = os.getenv("PLUTUS_DELIVERY_MODE", "preview").lower()
    if mode != "photon":
        return "preview_only"
    
    if os.getenv("PHOTON_RECIPIENT_OPTED_IN", "false").lower() != "true":
        return "blocked_not_enrolled"
    
    secret = os.getenv("PHOTON_INTERNAL_SECRET", "")
    if len(secret) < 32:
        return "blocked_missing_internal_secret"
    
    body = json.dumps({"message": text}).encode("utf-8")
    req = Request(
        "http://127.0.0.1:8790/send",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {secret}",
        },
        method="POST"
    )
    try:
        with urlopen(req, timeout=12) as response:
            if response.status not in (200, 202):
                return f"failed_http_{response.status}"
            return "submitted_to_photon_not_delivery_confirmed"
    except (URLError, TimeoutError):
        return "failed_transport"
    except Exception as exc:
        return f"failed_error_{type(exc).__name__}"


def queue_alert(db: sqlite3.Connection, customer_id: str, key: str, kind: str, message: str) -> dict[str, Any]:
    """Records an alert in SQLite with duplicate suppression via unique alert_key.

    If the key already exists, returns 'already_recorded' and skips external side effects.
    """
    now = datetime.now(timezone.utc).isoformat()
    cursor = db.execute(
        "INSERT OR IGNORE INTO alerts (customer_id, alert_key, kind, text, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (customer_id, key, kind, message, "pending", now)
    )
    if not cursor.rowcount:
        return {"key": key, "status": "already_recorded", "text": message, "kind": kind}
    
    db.commit()  # Claim idempotency key before external side effect
    status = deliver_message(message)
    db.execute("UPDATE alerts SET status=? WHERE alert_key=?", (status, key))
    db.commit()
    return {"key": key, "status": status, "text": message, "kind": kind}


def evaluate_purchase(financial_data: FinancialData, item: dict[str, Any], cash_plan: dict[str, Any] | None = None) -> dict[str, Any]:
    """Evaluates a saved purchase using the shared deterministic readiness engine.

    Enforces reserve preservation, cash-planning savings protection (planning.py),
    and applicable stress resilience (SimulatorAdapter).
    """
    amount = Decimal(int(item["amount_cents"])) / Decimal(100)
    reserve = Decimal(int(item["reserve_cents"])) / Decimal(100)
    
    savings_cents = int(item.get("savings_target_cents", 0))
    if savings_cents == 0 and cash_plan:
        savings_cents = int(cash_plan.get("savingsTargetCents", 0))
    savings_target = Decimal(savings_cents) / Decimal(100)
    
    purchase_date = None
    if item.get("purchase_date"):
        try:
            purchase_date = datetime.strptime(item["purchase_date"], "%Y-%m-%d").date()
        except ValueError:
            purchase_date = None
            
    horizon = int(item.get("horizon_days", 30))
    
    res = evaluate_purchase_readiness(
        snapshot=financial_data,
        purchase_amount=amount,
        purchase_date=purchase_date,
        reserve=reserve,
        savings_target=savings_target,
        horizon_days=horizon,
    )
    
    return {
        "ready": res.ready,
        "verdict": res.verdict,
        "recommendation": res.recommendation,
        "minimum_balance": res.purchase_minimum,
        "reserve": res.reserve,
        "savings_target": res.savings_target,
        "protected_amount": res.protected_amount,
        "stress_tests_passed": res.stress_tests_passed,
        "stress_tests_total": res.stress_tests_total,
        "reasons": res.reasons,
        "basis": f"Deterministic multi-scenario evaluation ({res.stress_tests_passed}/{res.stress_tests_total} stress tests passed, {res.protected_amount} protected).",
    }


def advance_payday(state: dict[str, Any]) -> dict[str, Any]:
    """Simulates Alex receiving his next scheduled paycheck.

    Advances the as_of date to that payday and applies all scheduled events up to and
    including that date.
    """
    paychecks = [x for x in state["scheduled"] if x["type"] == "income"]
    if not paychecks:
        raise ValueError("No future paycheck available to advance")
    
    next_pay = min(paychecks, key=lambda x: x["date"])
    when = next_pay["date"]
    
    applied = [e for e in state["scheduled"] if e["date"] <= when]
    balance = Decimal(state["balance"]) + sum((Decimal(e["amount"]) for e in applied), Decimal(0))
    
    state["balance"] = format(balance, ".2f")
    state["asOf"] = when
    state["scheduled"] = [e for e in state["scheduled"] if e["date"] > when]
    
    return {
        "applied": [e["id"] for e in applied],
        "asOf": when,
        "balance": state["balance"],
        "paycheckAmount": next_pay["amount"],
    }


def check_and_evaluate_all(db: sqlite3.Connection, state: dict[str, Any], prefs: dict[str, Any]) -> dict[str, Any]:
    """Evaluates both budget thresholds and saved purchases, triggering notifications when eligible."""
    events = []
    b = state["monthlyBudget"]
    customer_id = state.get("customerId", "synthetic_demo")
    
    # 1. Budget Red-Zone Evaluation
    allocated = b["allocatedCents"]
    spent = b["spentCents"]
    threshold = prefs.get("threshold_percent", 85)
    
    percent = round((spent * 100 / allocated), 1) if allocated > 0 else 0.0
    above = percent >= threshold
    crossed = above and not b.get("lastObservedAbove", False)
    
    if crossed:
        if prefs.get("enabled") and prefs.get("budget_alerts") and prefs.get("verified"):
            text = (
                f"Plutus budget alert: {b['category']} spending reached {percent}% "
                f"of your monthly plan. Open Plutus Monthly Plan to review flexible spending "
                f"and protect your savings goal. Replying to this text is not required."
            )
            key = f"{customer_id}:budget:{b['category']}:{b['period']}:{threshold}"
            events.append(queue_alert(db, customer_id, key, "budget_red_zone", text))
    
    b["lastObservedAbove"] = above
    
    # 2. Saved Purchases (Watchlist) Evaluation
    financial_data = get_authoritative_financial_data(customer_id)
    watchlist_rows = db.execute("SELECT * FROM watchlist WHERE customer_id=?", (customer_id,)).fetchall()
    cash_plan = state.get("cashPlan")
    
    for row in watchlist_rows:
        item = dict(row)
        result = evaluate_purchase(financial_data, item, cash_plan=cash_plan)
        previous_ready = bool(item.get("last_ready", 0))
        notified = bool(item.get("notified", 0))
        
        # Trigger ONLY on a transition from unready to ready, and only once
        if not previous_ready and result["ready"] and not notified:
            if prefs.get("enabled") and prefs.get("purchase_alerts") and prefs.get("verified"):
                text = (
                    f"Plutus purchase update: Your saved {item['label']} now meets your selected "
                    f"cash-reserve rule and savings plan under the current 30-day forecast. Open Plutus to review the "
                    f"Council comparison and financial assumptions before deciding. This is not a guarantee."
                )
                key = f"{customer_id}:purchase:{item['id']}:ready"
                events.append(queue_alert(db, customer_id, key, "purchase_opportunity", text))
                db.execute("UPDATE watchlist SET notified=1 WHERE id=?", (item["id"],))
                db.commit()
        
        db.execute(
            "UPDATE watchlist SET last_ready=?, last_result=?, updated_at=? WHERE id=?",
            (
                1 if result["ready"] else 0,
                json.dumps(result),
                datetime.now(timezone.utc).isoformat(),
                item["id"]
            )
        )
        db.commit()
    
    state["lastEvaluation"] = datetime.now(timezone.utc).isoformat()
    save_demo_state(db, state)
    
    return {
        "events": events,
        "budget": {
            "category": b["category"],
            "spentCents": b["spentCents"],
            "allocatedCents": b["allocatedCents"],
            "percent": percent,
            "above": above,
            "crossed": crossed,
        },
        "balance": state["balance"],
        "asOf": state["asOf"],
    }
