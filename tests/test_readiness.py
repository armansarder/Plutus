"""Targeted regression and integration tests for authoritative purchase readiness,
cash planning, and Photon notification alignment.
"""
import os
from decimal import Decimal
from datetime import date
from fastapi.testclient import TestClient

from calculation_engine.models import FinancialData
from calculation_engine.readiness import evaluate_purchase_readiness
from nemotron_agent.contracts import AgentRequest
from nemotron_agent.service import run_agent
from nemotron_agent.main import create_app
from calculation_engine.security import SecuritySettings
from notifications.router import DEFAULT_OPERATOR_SECRET
from notifications.store import (
    get_db,
    load_demo_state,
    save_demo_state,
    reset_demo_state,
    get_authoritative_financial_data,
    save_preferences,
)
from notifications.evaluator import evaluate_purchase, advance_payday, check_and_evaluate_all

TEST_TOKEN = "test-token-readiness-32chars-min-ok"
TEST_RECIPIENT = "+19452439007"


def test_a_council_photon_agreement_stress_failure():
    """Test A: A $750 purchase passing ordinary reserve ($280 >= $200) but failing
    the $200 unexpected-expense stress test ($80 < $200) must NOT produce a ready notification.
    """
    with get_db() as db:
        reset_demo_state(db)
        db.execute("DELETE FROM watchlist")
        state = load_demo_state(db)
        # Advance to payday ($1300 balance, rent applied)
        advance_payday(state)
        save_demo_state(db, state)
        
        financial_data = get_authoritative_financial_data("synthetic_demo")
        assert financial_data.current_balance == Decimal("1300.00")
        
        # 1. Council Agent evaluation: recommendation is consider_waiting
        council_req = AgentRequest(
            purchase_amount=Decimal("750.00"),
            purchase_date=financial_data.as_of_date,
            reserve=Decimal("200.00"),
            horizon_days=30,
            allow_model=False,
            channel="web",
            message="Can I buy this 750 item?"
        )
        agent_res = run_agent(council_req, financial_data, "synthetic_demo")
        assert agent_res.passport.recommendation == "consider_waiting"
        assert agent_res.stress_tests_passed < agent_res.stress_tests_total
        
        # 2. Shared Purchase Readiness Engine: must match Council and hold ready=False
        readiness = evaluate_purchase_readiness(
            snapshot=financial_data,
            purchase_amount=Decimal("750.00"),
            purchase_date=financial_data.as_of_date,
            reserve=Decimal("200.00"),
            savings_target=Decimal("0.00"),
            horizon_days=30,
        )
        assert readiness.ready is False
        assert readiness.recommendation == "consider_waiting"
        assert readiness.verdict == "stress_sensitive"
        assert "stress_sensitive" in readiness.failed_constraints
        
        # 3. Notification Evaluator: must NOT mark ready
        item = {
            "id": "item_750",
            "customer_id": "synthetic_demo",
            "label": "Tablet 750",
            "amount_cents": 75000,
            "reserve_cents": 20000,
            "purchase_date": str(financial_data.as_of_date),
            "horizon_days": 30,
        }
        eval_res = evaluate_purchase(financial_data, item)
        assert eval_res["ready"] is False
        assert eval_res["verdict"] == "stress_sensitive"
        assert eval_res["recommendation"] == "consider_waiting"


def test_b_protected_savings_eroded_prevents_readiness():
    """Test B: A $600 purchase leaving $430 minimum cash against $500 protected funds
    ($200 reserve + $300 savings target) must NOT be marked ready.
    """
    with get_db() as db:
        reset_demo_state(db)
        db.execute("DELETE FROM watchlist")
        state = load_demo_state(db)
        advance_payday(state)
        save_demo_state(db, state)
        
        financial_data = get_authoritative_financial_data("synthetic_demo")
        
        # Evaluate with $300 savings target and $200 reserve ($500 protected)
        readiness = evaluate_purchase_readiness(
            snapshot=financial_data,
            purchase_amount=Decimal("600.00"),
            purchase_date=financial_data.as_of_date,
            reserve=Decimal("200.00"),
            savings_target=Decimal("300.00"),
            horizon_days=30,
        )
        assert readiness.ready is False
        assert readiness.verdict == "erodes_savings"
        assert readiness.recommendation == "consider_waiting"
        assert "savings_eroded" in readiness.failed_constraints
        assert Decimal(readiness.purchase_minimum) == Decimal("430.00")
        assert Decimal(readiness.protected_amount) == Decimal("500.00")

        # Council endpoint check: must agree on consider_waiting
        req = AgentRequest(
            purchase_amount=Decimal("600.00"),
            purchase_date=financial_data.as_of_date,
            reserve=Decimal("200.00"),
            savings_target=Decimal("300.00"),
            horizon_days=30,
            allow_model=False,
        )
        council_res = run_agent(req, financial_data, "synthetic_demo")
        assert council_res.passport.recommendation == "consider_waiting"
        assert "erodes your 300.00 planned savings target" in council_res.summary


def test_c_valid_purchase_opportunity_lifecycle():
    """Test C: A $600 purchase with $200 reserve and $200 savings target ($400 protected)
    starts not ready on Nov 8 (balance $900, rent -$900 -> min -$600),
    becomes genuinely ready on Nov 15 after payday (min $430 >= $400 >= $200, stress tests pass),
    and triggers exactly one notification.
    """
    with get_db() as db:
        reset_demo_state(db)
        db.execute("DELETE FROM watchlist")
        state = load_demo_state(db)
        
        prefs = save_preferences(
            db, "synthetic_demo", TEST_RECIPIENT, enabled=True,
            budget_alerts=True, purchase_alerts=True, threshold_percent=85
        )
        
        item = {
            "id": "laptop_600",
            "customer_id": "synthetic_demo",
            "label": "Work Laptop",
            "amount_cents": 60000,
            "reserve_cents": 20000,
            "savings_target_cents": 20000, # $200 savings target
            "purchase_date": "2026-11-08",
            "horizon_days": 30,
            "last_ready": 0,
            "notified": 0,
            "created_at": "2026-11-08T00:00:00Z",
            "updated_at": "2026-11-08T00:00:00Z",
        }
        db.execute("""
            INSERT INTO watchlist 
            (id, customer_id, label, amount_cents, reserve_cents, savings_target_cents, purchase_date, horizon_days, last_ready, notified, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item["id"], item["customer_id"], item["label"], item["amount_cents"],
            item["reserve_cents"], item["savings_target_cents"], item["purchase_date"], item["horizon_days"],
            item["last_ready"], item["notified"], item["created_at"], item["updated_at"]
        ))
        db.commit()
        
        # 1. Before payday: leaves -$600 cash < $200 reserve -> ready=False
        data_before = get_authoritative_financial_data("synthetic_demo")
        eval_before = evaluate_purchase(data_before, item)
        assert eval_before["ready"] is False
        assert eval_before["verdict"] == "reserve_at_risk"
        
        res1 = check_and_evaluate_all(db, state, prefs)
        assert len(res1["events"]) == 0
        
        # 2. Advance payday to Nov 15
        advance_info = advance_payday(state)
        assert advance_info["asOf"] == "2026-11-15"
        assert advance_info["balance"] == "1300.00"
        save_demo_state(db, state)
        
        # Update watchlist item purchase date to advanced date
        item["purchase_date"] = state["asOf"]
        db.execute("UPDATE watchlist SET purchase_date=? WHERE id=?", (state["asOf"], item["id"]))
        db.commit()
        
        # 3. After payday: min cash $430 >= $400 protected >= $200 reserve, all stress tests pass -> ready=True!
        data_after = get_authoritative_financial_data("synthetic_demo")
        eval_after = evaluate_purchase(data_after, item)
        assert eval_after["ready"] is True
        assert eval_after["verdict"] == "ready_to_purchase"
        assert eval_after["recommendation"] == "consider_purchase"
        assert Decimal(eval_after["minimum_balance"]) == Decimal("430.00")
        assert eval_after["stress_tests_passed"] == 2
        assert eval_after["stress_tests_total"] == 2
        
        # 4. Trigger transition: exactly one notification
        res2 = check_and_evaluate_all(db, state, prefs)
        assert len(res2["events"]) == 1
        assert res2["events"][0]["kind"] == "purchase_opportunity"
        assert "meets your selected cash-reserve rule and savings plan" in res2["events"][0]["text"]
        assert "Savings Agent" not in res2["events"][0]["text"]
        
        # 5. Idempotent: no duplicate notification on repeated evaluation
        res3 = check_and_evaluate_all(db, state, prefs)
        assert len(res3["events"]) == 0


def test_d_operator_spend_updates_budget_and_checking_consistently():
    """Test D: Simulating a $60 grocery spend in operator updates both the budget spent
    and deducts $60 from checking cash balance.
    """
    app = create_app(settings=SecuritySettings(api_token=TEST_TOKEN, customer_id="synthetic_demo"))
    operator_secret = os.getenv("PLUTUS_OPERATOR_SECRET", DEFAULT_OPERATOR_SECRET)
    headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
        "X-Operator-Token": operator_secret,
    }
    with get_db() as db:
        reset_demo_state(db)
        state_before = load_demo_state(db)
        init_bal = Decimal(state_before["balance"])
        init_spent = state_before["monthlyBudget"]["spentCents"]
    
    with TestClient(app) as client:
        resp = client.post(
            "/api/notifications/operator/spend",
            json={"amount_cents": 6000},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["addedCents"] == 6000
        assert data["newSpentCents"] == init_spent + 6000
        
        # Verify checking balance was also deducted
        with get_db() as db:
            state_after = load_demo_state(db)
            assert Decimal(state_after["balance"]) == init_bal - Decimal("60.00")
            assert state_after["monthlyBudget"]["spentCents"] == init_spent + 6000


def test_e_opt_out_prevents_ready_purchase_notification():
    """Test E: Opting out prevents notification delivery even when a purchase becomes ready."""
    with get_db() as db:
        reset_demo_state(db)
        db.execute("DELETE FROM watchlist")
        state = load_demo_state(db)
        # Advance to payday so purchases can be ready
        advance_payday(state)
        save_demo_state(db, state)
        
        # Explicit opt-out
        prefs = save_preferences(
            db, "synthetic_demo", TEST_RECIPIENT, enabled=False,
            budget_alerts=False, purchase_alerts=False, threshold_percent=85
        )
        
        item = {
            "id": "opt_out_laptop",
            "customer_id": "synthetic_demo",
            "label": "Laptop",
            "amount_cents": 60000,
            "reserve_cents": 20000,
            "savings_target_cents": 20000,
            "purchase_date": state["asOf"],
            "horizon_days": 30,
            "last_ready": 0,
            "notified": 0,
            "created_at": "2026-11-08T00:00:00Z",
            "updated_at": "2026-11-08T00:00:00Z",
        }
        db.execute("""
            INSERT INTO watchlist 
            (id, customer_id, label, amount_cents, reserve_cents, savings_target_cents, purchase_date, horizon_days, last_ready, notified, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item["id"], item["customer_id"], item["label"], item["amount_cents"],
            item["reserve_cents"], item["savings_target_cents"], item["purchase_date"], item["horizon_days"],
            item["last_ready"], item["notified"], item["created_at"], item["updated_at"]
        ))
        db.commit()
        
        res = check_and_evaluate_all(db, state, prefs)
        assert len(res["events"]) == 0


def test_f_budget_threshold_red_zone_notification():
    """Test F: When spending crosses the budget threshold, a budget red-zone alert is generated
    referencing 'Monthly Plan' and NOT 'Savings Agent', and repeated checks do not duplicate it.
    """
    with get_db() as db:
        reset_demo_state(db)
        state = load_demo_state(db)
        phone = os.getenv("PLUTUS_DEMO_PHONE_E164", TEST_RECIPIENT)
        prefs = save_preferences(
            db, "synthetic_demo", phone, enabled=True,
            budget_alerts=True, purchase_alerts=True, threshold_percent=85
        )
        
        # Spend up to 88% (44000 cents of 50000 allocated)
        state["monthlyBudget"]["spentCents"] = 44000
        state["monthlyBudget"]["lastObservedAbove"] = False
        save_demo_state(db, state)
        
        res1 = check_and_evaluate_all(db, state, prefs)
        assert len(res1["events"]) == 1
        event = res1["events"][0]
        assert event["kind"] == "budget_red_zone"
        assert "Monthly Plan" in event["text"]
        assert "Savings Agent" not in event["text"]
        
        # Subsequent check should not re-trigger because lastObservedAbove is now True
        res2 = check_and_evaluate_all(db, state, prefs)
        assert len(res2["events"]) == 0


def test_g_council_watchlist_payload_and_readiness_integrity():
    """Test G: Adding a purchase to the watchlist persists savings target and returns
    full structured readiness metrics (verdict, reasons, failed constraints).
    """
    app = create_app(settings=SecuritySettings(api_token=TEST_TOKEN, customer_id="synthetic_demo"))
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    with get_db() as db:
        reset_demo_state(db)
        db.execute("DELETE FROM watchlist")
    
    with TestClient(app) as client:
        resp = client.post(
            "/api/notifications/watchlist",
            json={
                "label": "Council Evaluated Laptop",
                "amount_cents": 60000,
                "reserve_cents": 20000,
                "savings_target_cents": 20000,
                "horizon_days": 30,
            },
            headers=headers,
        )
        assert resp.status_code == 200
        item = resp.json()
        assert item["label"] == "Council Evaluated Laptop"
        assert item["amount_cents"] == 60000
        assert item["reserve_cents"] == 20000
        assert item["savings_target_cents"] == 20000
        assert item["ready"] is False
        assert item["verdict"] == "reserve_at_risk"
        assert item["reasons"] is not None
        assert len(item["reasons"]) > 0


def test_h_cash_plan_update_and_budget_endpoint():
    """Test H: Cash plan updates via API persist to SQLite and affect subsequent watchlist evaluations,
    and GET /api/notifications/budget exposes authoritative numbers.
    """
    app = create_app(settings=SecuritySettings(api_token=TEST_TOKEN, customer_id="synthetic_demo"))
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    with TestClient(app) as client:
        # 1. Update cash plan to $350 savings target
        put_resp = client.put(
            "/api/notifications/cash-plan",
            json={"savings_target_cents": 35000, "reserve_cents": 25000},
            headers=headers,
        )
        assert put_resp.status_code == 200
        assert put_resp.json()["savingsTargetCents"] == 35000
        assert put_resp.json()["reserveCents"] == 25000

        # 2. Get cash plan
        get_resp = client.get("/api/notifications/cash-plan", headers=headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["savingsTargetCents"] == 35000

        # 3. Get monthly budget
        b_resp = client.get("/api/notifications/budget", headers=headers)
        assert b_resp.status_code == 200
        data = b_resp.json()
        assert data["category"] == "Groceries"
        assert "allocatedCents" in data
        assert "spentCents" in data
        assert "percent" in data


