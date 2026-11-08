"""FastAPI router for Plutus notification preferences, watchlist, and operator controls."""
import json
import os
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Header, HTTPException

from .models import (
    NotificationPreferencesRequest,
    NotificationPreferencesResponse,
    WatchlistCreateRequest,
    WatchlistItemResponse,
    AlertEventResponse,
    SpendRequest,
    AdvancePaydayRequest,
    MessagingStatusResponse,
)
from .store import (
    get_db,
    load_preferences,
    save_preferences,
    load_demo_state,
    save_demo_state,
    reset_demo_state,
    mask_phone,
    get_authoritative_financial_data,
)
from .evaluator import (
    check_and_evaluate_all,
    evaluate_purchase,
    advance_payday,
)

router = APIRouter(tags=["notifications"])

DEFAULT_OPERATOR_SECRET = "plutus-demo-operator-secret-2026"


def verify_operator_token(x_operator_token: str | None = Header(None)) -> None:
    demo_mode = os.getenv("PLUTUS_DEMO_MODE", "true").lower() == "true"
    if not demo_mode:
        raise HTTPException(status_code=403, detail="Operator interface is disabled outside demo mode.")
    
    secret = os.getenv("PLUTUS_OPERATOR_SECRET", DEFAULT_OPERATOR_SECRET)
    if not x_operator_token or x_operator_token != secret:
        raise HTTPException(status_code=401, detail="Invalid operator authorization token.")


@router.get("/api/notifications/preferences", response_model=NotificationPreferencesResponse)
def get_preferences(customer_id: str = "synthetic_demo"):
    with get_db() as db:
        p = load_preferences(db, customer_id)
        return NotificationPreferencesResponse(
            phone_number=p["phone_number"],
            phone_number_masked=mask_phone(p["phone_number"]),
            enabled=bool(p["enabled"]),
            budget_alerts=bool(p["budget_alerts"]),
            purchase_alerts=bool(p["purchase_alerts"]),
            threshold_percent=p["threshold_percent"],
            verified=bool(p["verified"]),
            updated_at=p["updated_at"],
        )


@router.post("/api/notifications/preferences", response_model=NotificationPreferencesResponse)
def update_preferences(payload: NotificationPreferencesRequest, customer_id: str = "synthetic_demo"):
    with get_db() as db:
        p = save_preferences(
            db,
            customer_id=customer_id,
            phone_number=payload.phone_number,
            enabled=payload.enabled,
            budget_alerts=payload.budget_alerts,
            purchase_alerts=payload.purchase_alerts,
            threshold_percent=payload.threshold_percent,
        )
        return NotificationPreferencesResponse(
            phone_number=p["phone_number"],
            phone_number_masked=mask_phone(p["phone_number"]),
            enabled=bool(p["enabled"]),
            budget_alerts=bool(p["budget_alerts"]),
            purchase_alerts=bool(p["purchase_alerts"]),
            threshold_percent=p["threshold_percent"],
            verified=bool(p["verified"]),
            updated_at=p["updated_at"],
        )


@router.get("/api/notifications/history", response_model=list[AlertEventResponse])
def get_history(customer_id: str = "synthetic_demo", limit: int = 50):
    with get_db() as db:
        rows = db.execute(
            "SELECT id, alert_key, kind, text, status, created_at FROM alerts WHERE customer_id=? ORDER BY id DESC LIMIT ?",
            (customer_id, limit)
        ).fetchall()
        return [
            AlertEventResponse(
                id=r["id"],
                alert_key=r["alert_key"],
                kind=r["kind"],
                text=r["text"],
                status=r["status"],
                created_at=r["created_at"],
            )
            for r in rows
        ]


@router.get("/api/notifications/watchlist", response_model=list[WatchlistItemResponse])
def get_watchlist(customer_id: str = "synthetic_demo"):
    with get_db() as db:
        financial_data = get_authoritative_financial_data(customer_id)
        rows = db.execute(
            "SELECT * FROM watchlist WHERE customer_id=? ORDER BY created_at DESC",
            (customer_id,)
        ).fetchall()
        
        items = []
        for r in rows:
            item = dict(r)
            eval_res = evaluate_purchase(financial_data, item)
            items.append(WatchlistItemResponse(
                id=item["id"],
                label=item["label"],
                amount_cents=item["amount_cents"],
                reserve_cents=item["reserve_cents"],
                purchase_date=item["purchase_date"],
                horizon_days=item["horizon_days"],
                ready=eval_res["ready"],
                notified=bool(item["notified"]),
                minimum_balance=eval_res["minimum_balance"],
                reserve=eval_res["reserve"],
                basis=eval_res["basis"],
                created_at=item["created_at"],
            ))
        return items


@router.post("/api/notifications/watchlist", response_model=WatchlistItemResponse)
def add_to_watchlist(payload: WatchlistCreateRequest, customer_id: str = "synthetic_demo"):
    with get_db() as db:
        item_id = uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()
        state = load_demo_state(db)
        purchase_date = payload.purchase_date or state["asOf"]
        
        item_dict = {
            "id": item_id,
            "customer_id": customer_id,
            "label": payload.label,
            "amount_cents": payload.amount_cents,
            "reserve_cents": payload.reserve_cents,
            "purchase_date": purchase_date,
            "horizon_days": payload.horizon_days,
            "created_at": now,
            "updated_at": now,
        }
        
        financial_data = get_authoritative_financial_data(customer_id)
        eval_res = evaluate_purchase(financial_data, item_dict)
        
        db.execute("""
            INSERT INTO watchlist 
            (id, customer_id, label, amount_cents, reserve_cents, purchase_date, horizon_days, last_ready, notified, last_result, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item_id, customer_id, payload.label, payload.amount_cents, payload.reserve_cents,
            purchase_date, payload.horizon_days, 1 if eval_res["ready"] else 0, 0,
            json.dumps(eval_res), now, now
        ))
        db.commit()
        
        return WatchlistItemResponse(
            id=item_id,
            label=payload.label,
            amount_cents=payload.amount_cents,
            reserve_cents=payload.reserve_cents,
            purchase_date=purchase_date,
            horizon_days=payload.horizon_days,
            ready=eval_res["ready"],
            notified=False,
            minimum_balance=eval_res["minimum_balance"],
            reserve=eval_res["reserve"],
            basis=eval_res["basis"],
            created_at=now,
        )


@router.delete("/api/notifications/watchlist/{item_id}")
def remove_from_watchlist(item_id: str, customer_id: str = "synthetic_demo"):
    with get_db() as db:
        cursor = db.execute("DELETE FROM watchlist WHERE id=? AND customer_id=?", (item_id, customer_id))
        db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Watchlist item not found.")
        return {"deleted": True, "id": item_id}


@router.get("/api/notifications/state")
def get_current_state():
    with get_db() as db:
        state = load_demo_state(db)
        b = state["monthlyBudget"]
        percent = round(b["spentCents"] * 100 / b["allocatedCents"], 1) if b["allocatedCents"] > 0 else 0.0
        return {
            "asOf": state["asOf"],
            "balance": state["balance"],
            "currency": state["currency"],
            "budget": {
                "category": b["category"],
                "allocatedCents": b["allocatedCents"],
                "spentCents": b["spentCents"],
                "thresholdPercent": b["thresholdPercent"],
                "percent": percent,
                "above": percent >= b["thresholdPercent"],
            },
            "scheduledCount": len(state["scheduled"]),
            "version": state.get("version", 1),
            "lastEvaluation": state.get("lastEvaluation"),
        }


@router.post("/api/notifications/check")
def manual_check(customer_id: str = "synthetic_demo"):
    with get_db() as db:
        state = load_demo_state(db)
        prefs = load_preferences(db, customer_id)
        return check_and_evaluate_all(db, state, prefs)


# --- Private Demo Operator Endpoints ---

@router.post("/api/notifications/operator/spend")
def operator_spend(
    payload: SpendRequest,
    x_operator_token: str | None = Header(None),
    customer_id: str = "synthetic_demo"
):
    verify_operator_token(x_operator_token)
    with get_db() as db:
        state = load_demo_state(db)
        state["monthlyBudget"]["spentCents"] += payload.amount_cents
        save_demo_state(db, state)
        
        prefs = load_preferences(db, customer_id)
        results = check_and_evaluate_all(db, state, prefs)
        return {
            "action": "spend",
            "addedCents": payload.amount_cents,
            "newSpentCents": state["monthlyBudget"]["spentCents"],
            "results": results,
        }


@router.post("/api/notifications/operator/advance-payday")
def operator_advance_payday(
    x_operator_token: str | None = Header(None),
    customer_id: str = "synthetic_demo"
):
    verify_operator_token(x_operator_token)
    with get_db() as db:
        state = load_demo_state(db)
        try:
            advance_info = advance_payday(state)
        except ValueError as err:
            raise HTTPException(status_code=400, detail=str(err)) from err
        
        save_demo_state(db, state)
        prefs = load_preferences(db, customer_id)
        results = check_and_evaluate_all(db, state, prefs)
        return {
            "action": "advance_payday",
            "advance": advance_info,
            "results": results,
        }


@router.post("/api/notifications/operator/reset")
def operator_reset(
    x_operator_token: str | None = Header(None),
    customer_id: str = "synthetic_demo"
):
    verify_operator_token(x_operator_token)
    with get_db() as db:
        reset_demo_state(db)
        fresh_state = load_demo_state(db)
        prefs = load_preferences(db, customer_id)
        return {
            "reset": True,
            "state": fresh_state,
            "preferences": prefs,
        }


# --- Frontend /api/messaging/status integration ---

@router.get("/api/messaging/status", response_model=MessagingStatusResponse)
def get_messaging_status(customer_id: str = "synthetic_demo"):
    with get_db() as db:
        p = load_preferences(db, customer_id)
        connected = bool(p["enabled"]) and bool(p["verified"])
        instructions = (
            "Text alerts are active. You will receive notifications via Photon 2.0 when budget thresholds cross or saved purchases become affordable."
            if connected
            else "Text alerts are currently disabled or unverified. Enable notifications in Text Notification Settings."
        )
        return MessagingStatusResponse(
            connected=connected,
            demo=True,
            channel="iMessage via Photon 2.0" if connected else None,
            instructions=instructions,
        )

