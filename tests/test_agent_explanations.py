"""Narrative regressions against actual deterministic forecasts, not invented figures."""
import pytest
from nemotron_agent.check import fixture
from nemotron_agent.contracts import AgentRequest
from nemotron_agent.service import run_agent, ModelUnavailable


@pytest.mark.parametrize('amount,reserve,empty,headline', [
    ('400', '200', False, "I wouldn't buy this right now."),
    ('200', '200', False, "I'd wait before buying this."),
    ('100', '200', False, "I'd be cautious about buying this."),
    ('100', '200', True, "I don't have enough information to recommend this yet."),
    ('10', '0', False, 'This fits your selected cash cushion in the scenarios we tested.'),
])
def test_summary_starts_with_grounded_recommendation(amount, reserve, empty, headline):
    snapshot = fixture()
    if empty:
        snapshot.upcoming_transactions = []
    result = run_agent(AgentRequest(purchase_amount=amount, reserve=reserve,
        purchase_date='2026-11-08', allow_model=False), snapshot, 'synthetic_demo', None)
    assert result.summary.startswith(headline)
    assert 'category budgets and protected savings are still unknown' in result.summary
    assert 'stress-sensitive' not in result.summary
    assert 'USD' not in result.summary
    assert len(result.summary.split('. ')) <= 3
    if amount == '400':
        assert '-$100' in result.summary
        assert '2026-11-16' in [day.isoformat() for day in result.safe_purchase_dates]
    if empty:
        assert "don't have upcoming bills or income" in result.summary


@pytest.mark.parametrize('partial', [False, True])
def test_unavailable_or_incomplete_investigation_keeps_engine_answer(partial):
    class Broken:
        model = 'test-provider'
        def chat(self, *args, **kwargs):
            if partial:
                return {'role': 'assistant', 'content': 'Done'}
            raise ModelUnavailable()
    result = run_agent(AgentRequest(purchase_amount='400', purchase_date='2026-11-08'),
        fixture(), 'synthetic_demo', Broken())
    assert result.mode == 'deterministic_fallback'
    assert result.fallback_reason == ('model_protocol_failed' if partial else 'model_unavailable')
    assert result.summary.startswith("I wouldn't buy this right now.")
    assert len(result.scenarios) == 5
