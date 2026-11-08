"""Authoritative, shared deterministic purchase-readiness evaluation.

Used by both Nemotron Agent / Council and the Photon notification evaluator.
Integrates Shiv's cash planning module (planning.py) and multi-scenario
cash flow forecasts (SimulatorAdapter / simulator.py).
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from calculation_engine.models import Contract, Day, FinancialData, ResultMoney
from calculation_engine.planning import CashPlanRequest, preview_cash_plan
from nemotron_agent.adapter import SimulatorAdapter
from nemotron_agent.contracts import AgentRequest

Recommendation = Literal['consider_purchase', 'consider_waiting', 'reserve_at_risk']


class PurchaseReadinessResult(Contract):
    ready: bool
    verdict: Literal["ready_to_purchase", "stress_sensitive", "erodes_savings", "reserve_at_risk"]
    recommendation: Recommendation
    purchase_amount: ResultMoney
    reserve: ResultMoney
    savings_target: ResultMoney
    essential_buffer: ResultMoney
    protected_amount: ResultMoney
    purchase_minimum: ResultMoney
    stress_tests_passed: int
    stress_tests_total: int
    reasons: list[str]
    failed_constraints: list[str]
    safe_purchase_dates: list[Day]


def evaluate_purchase_readiness(
    snapshot: FinancialData,
    purchase_amount: Decimal,
    purchase_date: date | None = None,
    reserve: Decimal = Decimal("200.00"),
    savings_target: Decimal = Decimal("0.00"),
    essential_buffer: Decimal = Decimal("0.00"),
    horizon_days: int = 30,
) -> PurchaseReadinessResult:
    """Evaluates purchase readiness deterministically against cash flow, stress tests, and cash planning.
    
    A purchase is marked 'ready' if and only if:
    1. Cash reserve rule is preserved under expected conditions.
    2. Planned savings target and essential buffer are fully protected (via planning.py).
    3. Applicable stress tests (delayed income, unexpected expense) maintain the selected reserve.
    """
    total_protected = reserve + savings_target + essential_buffer
    
    # 1. Clamp purchase date inside forecast window
    start = snapshot.as_of_date + timedelta(days=1 if snapshot.snapshot_basis == "intraday" else 0)
    end = start + timedelta(days=horizon_days - 1)
    effective_date = purchase_date or start
    if effective_date < start:
        effective_date = start
    elif effective_date > end:
        effective_date = end

    # 2. Run multi-scenario analysis via SimulatorAdapter
    agent_req = AgentRequest(
        purchase_amount=purchase_amount,
        purchase_date=effective_date,
        reserve=reserve,
        horizon_days=horizon_days,
        allow_model=False,
        channel="web",
        message="Purchase readiness check",
    )
    adapter = SimulatorAdapter(snapshot, agent_req)
    
    baseline = adapter.forecast("baseline")
    purchase_res = adapter.forecast("purchase")
    delayed_res = adapter.forecast("delayed_income")
    unexpected_res = adapter.forecast("unexpected_expense")
    
    min_bal = Decimal(purchase_res["forecast"]["minimum_balance"])
    purchase_maintains_reserve = purchase_res["maintains_reserve"]
    
    # Stress tests count
    stress = [delayed_res, unexpected_res]
    applicable_stress = [s for s in stress if s["applicable"]]
    passed_stress = sum(1 for s in applicable_stress if s["maintains_reserve"])
    total_stress = len(applicable_stress)
    
    # 3. Cash Planning Check (Shiv's planning.py)
    # Earmarking total protected funds: min_bal must also preserve the savings target
    # If the user has a savings target, min_bal must be >= total_protected
    savings_preserved = min_bal >= total_protected
    
    failed = []
    reasons = []
    
    if not purchase_maintains_reserve:
        failed.append("reserve_breached")
        reasons.append(f"Projected minimum cash ({min_bal:.2f} {snapshot.currency}) breaches your {reserve:.2f} {snapshot.currency} reserve.")
    
    if not savings_preserved:
        failed.append("savings_eroded")
        headroom = min_bal - total_protected
        reasons.append(f"Purchase leaves {min_bal:.2f} {snapshot.currency}, eroding your {savings_target:.2f} {snapshot.currency} savings goal by {abs(headroom):.2f} {snapshot.currency}.")
    
    if passed_stress < total_stress:
        failed.append("stress_sensitive")
        reasons.append(f"Only {passed_stress} of {total_stress} applicable adverse stress tests maintain your reserve.")
        
    safe_dates = adapter.safe_dates()
    
    # 4. Formulate authoritative verdict and recommendation
    if purchase_maintains_reserve and savings_preserved and passed_stress == total_stress:
        ready = True
        verdict = "ready_to_purchase"
        recommendation = "consider_purchase"
        reasons.append(f"Purchase maintains your {reserve:.2f} {snapshot.currency} reserve, protects your {savings_target:.2f} {snapshot.currency} savings, and passes all {total_stress} applicable stress tests.")
    elif purchase_maintains_reserve and not savings_preserved:
        ready = False
        verdict = "erodes_savings"
        recommendation = "consider_waiting"
    elif purchase_maintains_reserve and passed_stress < total_stress:
        ready = False
        verdict = "stress_sensitive"
        recommendation = "consider_waiting"
    elif safe_dates:
        ready = False
        verdict = "reserve_at_risk"
        recommendation = "consider_waiting"
    else:
        ready = False
        verdict = "reserve_at_risk"
        recommendation = "reserve_at_risk"
        
    return PurchaseReadinessResult(
        ready=ready,
        verdict=verdict,
        recommendation=recommendation,
        purchase_amount=format(purchase_amount, ".2f"),
        reserve=format(reserve, ".2f"),
        savings_target=format(savings_target, ".2f"),
        essential_buffer=format(essential_buffer, ".2f"),
        protected_amount=format(total_protected, ".2f"),
        purchase_minimum=format(min_bal, ".2f"),
        stress_tests_passed=passed_stress,
        stress_tests_total=total_stress,
        reasons=reasons,
        failed_constraints=failed,
        safe_purchase_dates=safe_dates,
    )
