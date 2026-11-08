"""Comprehensive tests for Plutus Photon notifications, preferences, watchlist, and evaluator."""
import os
import json
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient

from calculation_engine.security import SecuritySettings
from nemotron_agent.main import create_app
from notifications.store import (
    get_db,
    clean_phone,
    mask_phone,
    is_phone_verified,
    load_preferences,
    save_preferences,
    load_demo_state,
    save_demo_state,
    reset_demo_state,
    get_authoritative_financial_data,
    initial_demo_state,
)
from notifications.evaluator import (
    deliver_message,
    queue_alert,
    evaluate_purchase,
    advance_payday,
    check_and_evaluate_all,
)
from notifications.router import DEFAULT_OPERATOR_SECRET


TEST_TOKEN = "notification-test-token-" + "x" * 32
TEST_RECIPIENT = "+12145550199"


@pytest.fixture(autouse=True)
def notification_test_env(tmp_path, monkeypatch):
    """Isolated SQLite database and safe preview mode for every test."""
    db_file = tmp_path / "test_notifications.sqlite3"
    monkeypatch.setenv("PLUTUS_NOTIFICATIONS_DB", str(db_file))
    monkeypatch.setenv("PLUTUS_DELIVERY_MODE", "preview")
    monkeypatch.setenv("PLUTUS_DEMO_PHONE_E164", TEST_RECIPIENT)
    monkeypatch.setenv("PHOTON_TEST_RECIPIENT", TEST_RECIPIENT)
    monkeypatch.setenv("PHOTON_RECIPIENT_OPTED_IN", "true")
    monkeypatch.setenv("PHOTON_INTERNAL_SECRET", "test-internal-secret-min-32-chars-long")
    monkeypatch.setenv("PLUTUS_DEMO_MODE", "true")
    monkeypatch.setenv("PLUTUS_OPERATOR_SECRET", DEFAULT_OPERATOR_SECRET)
    yield


def test_phone_number_cleaning_and_masking():
    assert clean_phone("214-555-0199") == "+12145550199"
    assert clean_phone("+1 (214) 555-0199") == "+12145550199"
    assert clean_phone("12145550199") == "+12145550199"
    assert clean_phone("") == ""
    
    assert mask_phone("+12145550199") == "+1 (•••) •••-0199"
    assert mask_phone("2145550199") == "+1 (•••) •••-0199"
    assert mask_phone("") == ""


def test_phone_verification_restricted_to_enrolled():
    assert is_phone_verified("+12145550199") is True
    assert is_phone_verified("214-555-0199") is True
    # Different unverified number must NOT be verified
    assert is_phone_verified("+19995551234") is False
    assert is_phone_verified("") is False


def test_preferences_persistence_and_opt_in_out():
    with get_db() as db:
        # Initial: disabled by default
        p0 = load_preferences(db, "synthetic_demo")
        assert p0["enabled"] == 0
        assert p0["phone_number"] == ""
        assert p0["verified"] == 0
        
        # User opts in with enrolled phone number
        p1 = save_preferences(
            db,
            customer_id="synthetic_demo",
            phone_number=TEST_RECIPIENT,
            enabled=True,
            budget_alerts=True,
            purchase_alerts=True,
            threshold_percent=85,
        )
        assert p1["enabled"] == 1
        assert p1["phone_number"] == TEST_RECIPIENT
        assert p1["verified"] == 1
        assert p1["threshold_percent"] == 85
        
        # User opts out
        p2 = save_preferences(
            db,
            customer_id="synthetic_demo",
            phone_number=TEST_RECIPIENT,
            enabled=False,
            budget_alerts=True,
            purchase_alerts=True,
            threshold_percent=85,
        )
        assert p2["enabled"] == 0
        # Phone number retained even when disabled
        assert p2["phone_number"] == TEST_RECIPIENT
        
        # Unenrolled phone number cannot be verified
        p3 = save_preferences(
            db,
            customer_id="synthetic_demo",
            phone_number="+19998887777",
            enabled=True,
            budget_alerts=True,
            purchase_alerts=True,
            threshold_percent=85,
        )
        assert p3["enabled"] == 1
        assert p3["verified"] == 0


def test_budget_threshold_crossing_and_duplicate_suppression():
    with get_db() as db:
        state = load_demo_state(db)
        # Ensure Groceries is $380 / $500 (76%)
        assert state["monthlyBudget"]["spentCents"] == 38000
        assert state["monthlyBudget"]["allocatedCents"] == 50000
        
        # Enable notifications for verified test recipient
        prefs = save_preferences(
            db, "synthetic_demo", TEST_RECIPIENT, enabled=True,
            budget_alerts=True, purchase_alerts=True, threshold_percent=85
        )
        
        # Check initial: 76% does not cross 85%
        res1 = check_and_evaluate_all(db, state, prefs)
        assert res1["budget"]["percent"] == 76.0
        assert res1["budget"]["above"] is False
        assert res1["budget"]["crossed"] is False
        assert len(res1["events"]) == 0
        
        # Add $60 spend -> $440 / $500 = 88% (crosses 85%)
        state["monthlyBudget"]["spentCents"] += 6000
        res2 = check_and_evaluate_all(db, state, prefs)
        assert res2["budget"]["percent"] == 88.0
        assert res2["budget"]["above"] is True
        assert res2["budget"]["crossed"] is True
        assert len(res2["events"]) == 1
        assert res2["events"][0]["status"] == "preview_only"
        assert "reached 88.0% of your monthly plan" in res2["events"][0]["text"]
        
        # Add another $60 spend -> $500 / $500 = 100% (already above 85% -> NO duplicate alert)
        state["monthlyBudget"]["spentCents"] += 6000
        res3 = check_and_evaluate_all(db, state, prefs)
        assert res3["budget"]["percent"] == 100.0
        assert res3["budget"]["above"] is True
        assert res3["budget"]["crossed"] is False
        assert len(res3["events"]) == 0


def test_budget_opt_out_prevents_texts():
    with get_db() as db:
        state = load_demo_state(db)
        # Opt-out
        prefs = save_preferences(
            db, "synthetic_demo", TEST_RECIPIENT, enabled=False,
            budget_alerts=True, purchase_alerts=True, threshold_percent=85
        )
        # Cross threshold
        state["monthlyBudget"]["spentCents"] += 6000
        res = check_and_evaluate_all(db, state, prefs)
        assert res["budget"]["crossed"] is True
        # No event queued or sent because enabled=False
        assert len(res["events"]) == 0


def test_watchlist_purchase_evaluation_and_payday_transition():
    with get_db() as db:
        state = load_demo_state(db)
        prefs = save_preferences(
            db, "synthetic_demo", TEST_RECIPIENT, enabled=True,
            budget_alerts=True, purchase_alerts=True, threshold_percent=85
        )
        
        # Add a $600 Laptop with $200 reserve requirement
        item = {
            "id": "laptop_001",
            "customer_id": "synthetic_demo",
            "label": "Laptop",
            "amount_cents": 60000,
            "reserve_cents": 20000,
            "purchase_date": "2026-11-08",
            "horizon_days": 30,
            "last_ready": 0,
            "notified": 0,
            "created_at": "2026-11-08T00:00:00Z",
            "updated_at": "2026-11-08T00:00:00Z",
        }
        db.execute("""
            INSERT INTO watchlist 
            (id, customer_id, label, amount_cents, reserve_cents, purchase_date, horizon_days, last_ready, notified, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item["id"], item["customer_id"], item["label"], item["amount_cents"],
            item["reserve_cents"], item["purchase_date"], item["horizon_days"],
            item["last_ready"], item["notified"], item["created_at"], item["updated_at"]
        ))
        db.commit()
        
        # Initial evaluation: balance is $900, rent -$900 on Nov 11 -> lowest cash is -$600 < $200 reserve -> ready=False
        financial_data = get_authoritative_financial_data("synthetic_demo")
        initial_eval = evaluate_purchase(financial_data, item)
        assert initial_eval["ready"] is False
        assert Decimal(initial_eval["minimum_balance"]) < Decimal("200.00")
        
        # Run check_and_evaluate_all -> no notification sent because ready is False
        res1 = check_and_evaluate_all(db, state, prefs)
        assert len(res1["events"]) == 0
        
        # Advance payday (Nov 15 paycheck $1300 applies, rent -$900 applies -> balance becomes $1300)
        advance_info = advance_payday(state)
        assert advance_info["asOf"] == "2026-11-15"
        assert advance_info["balance"] == "1300.00"
        save_demo_state(db, state)
        
        # Re-evaluate with updated financial state: lowest cash is $430 >= $200 reserve -> ready=True!
        updated_data = get_authoritative_financial_data("synthetic_demo")
        item["purchase_date"] = state["asOf"]
        db.execute("UPDATE watchlist SET purchase_date=? WHERE id=?", (state["asOf"], item["id"]))
        db.commit()
        
        updated_eval = evaluate_purchase(updated_data, item)
        assert updated_eval["ready"] is True
        assert Decimal(updated_eval["minimum_balance"]) >= Decimal("200.00")
        
        # Check transition: unready -> ready triggers exactly ONE notification!
        res2 = check_and_evaluate_all(db, state, prefs)
        assert len(res2["events"]) == 1
        assert res2["events"][0]["kind"] == "purchase_opportunity"
        assert "Your saved Laptop now meets your selected cash-reserve rule" in res2["events"][0]["text"]
        
        # Subsequent evaluation does NOT duplicate notification
        res3 = check_and_evaluate_all(db, state, prefs)
        assert len(res3["events"]) == 0


def test_operator_endpoints_and_reset():
    app = create_app(settings=SecuritySettings(api_token=TEST_TOKEN, customer_id="synthetic_demo"))
    auth_headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
        "X-Operator-Token": DEFAULT_OPERATOR_SECRET,
    }
    
    with TestClient(app) as client:
        # Invalid operator token is rejected with 401
        bad_token_resp = client.post(
            "/api/notifications/operator/spend",
            json={"amount_cents": 6000},
            headers={"Authorization": f"Bearer {TEST_TOKEN}", "X-Operator-Token": "wrong-token"}
        )
        assert bad_token_resp.status_code == 401
        
        # Valid operator spend increases spending
        spend_resp = client.post(
            "/api/notifications/operator/spend",
            json={"amount_cents": 6000},
            headers=auth_headers
        )
        assert spend_resp.status_code == 200
        assert spend_resp.json()["newSpentCents"] == 44000
        
        # Valid operator payday advances date and updates balance
        pay_resp = client.post(
            "/api/notifications/operator/advance-payday",
            json={},
            headers=auth_headers
        )
        assert pay_resp.status_code == 200
        assert pay_resp.json()["advance"]["asOf"] == "2026-11-15"
        
        # Reset restores initial state
        reset_resp = client.post(
            "/api/notifications/operator/reset",
            json={},
            headers=auth_headers
        )
        assert reset_resp.status_code == 200
        assert reset_resp.json()["reset"] is True
        assert reset_resp.json()["state"]["balance"] == "900.00"
        assert reset_resp.json()["state"]["monthlyBudget"]["spentCents"] == 38000


def test_api_preferences_and_watchlist_endpoints():
    app = create_app(settings=SecuritySettings(api_token=TEST_TOKEN, customer_id="synthetic_demo"))
    auth_headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    
    with TestClient(app) as client:
        # 1. Get preferences
        get_pref = client.get("/api/notifications/preferences", headers=auth_headers)
        assert get_pref.status_code == 200
        assert get_pref.json()["enabled"] is False
        
        # 2. Update preferences
        save_pref = client.post(
            "/api/notifications/preferences",
            json={
                "phone_number": TEST_RECIPIENT,
                "enabled": True,
                "budget_alerts": True,
                "purchase_alerts": True,
                "threshold_percent": 85,
            },
            headers=auth_headers
        )
        assert save_pref.status_code == 200
        assert save_pref.json()["enabled"] is True
        assert save_pref.json()["phone_number_masked"] == "+1 (•••) •••-0199"
        assert save_pref.json()["verified"] is True
        
        # 3. Add to watchlist
        watch_resp = client.post(
            "/api/notifications/watchlist",
            json={
                "label": "MacBook Pro",
                "amount_cents": 120000,
                "reserve_cents": 25000,
                "horizon_days": 30,
            },
            headers=auth_headers
        )
        assert watch_resp.status_code == 200
        item_id = watch_resp.json()["id"]
        assert watch_resp.json()["label"] == "MacBook Pro"
        
        # 4. List watchlist
        list_resp = client.get("/api/notifications/watchlist", headers=auth_headers)
        assert list_resp.status_code == 200
        assert any(it["id"] == item_id for it in list_resp.json())
        
        # 5. Delete from watchlist
        del_resp = client.delete(f"/api/notifications/watchlist/{item_id}", headers=auth_headers)
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted"] is True
        
        # 6. Messaging status endpoint
        msg_status = client.get("/api/messaging/status", headers=auth_headers)
        assert msg_status.status_code == 200
        assert msg_status.json()["connected"] is True
