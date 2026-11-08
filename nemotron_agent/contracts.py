"""Versioned JSON contract. Amounts are decimal strings; dates are ISO dates."""
from typing import Annotated, Literal
from pydantic import Field
from calculation_engine.models import Contract, Money, Day, ResultMoney, ForecastResult

ScenarioName = Literal['baseline', 'purchase', 'delayed_income', 'unexpected_expense', 'buy_later']

class AgentRequest(Contract):
    message: str = Field(default='', max_length=2000)
    purchase_amount: Annotated[Money, Field(gt=0, le=1000000)]
    purchase_date: Day | None = None
    reserve: Annotated[Money, Field(ge=0, le=1000000)] = '200.00'
    horizon_days: int = Field(default=30, ge=1, le=90, strict=True)
    allow_model: bool = True
    channel: Literal['web', 'photon'] = 'web'

class ScenarioOutput(Contract):
    name: ScenarioName
    purchase_date: Day | None
    maintains_reserve: bool
    applicable: bool = True
    forecast: ForecastResult

class Trace(Contract):
    tool: Literal['simulate_scenario', 'decision']
    scenario: ScenarioName | None = None
    status: Literal['completed', 'rejected', 'fallback']
    initiated_by: Literal['nemotron', 'server']

class Provenance(Contract):
    source: str
    snapshot_as_of: Day
    snapshot_id: str
    generated_at: str
    currency: str
    synthetic: bool
    schedule_complete: bool = False

class Passport(Contract):
    id: str
    purchase_amount: ResultMoney
    reserve: ResultMoney
    horizon_end: Day
    recommendation: Literal['consider_purchase', 'consider_waiting', 'reserve_at_risk']
    evidence_scenarios: list[ScenarioName]
    assumptions: list[str]
    payment_executed: Literal[False] = False

class TrustShield(Contract):
    permissions: list[str]
    payment_execution: Literal[False] = False
    external_message_sent: Literal[False] = False
    model_data_shared: bool
    untrusted_text_excluded: Literal[True] = True
    security_scope: str = 'Single configured customer; not a multi-user session system.'

class PhotonDraft(Contract):
    text: str
    simulated: Literal[True] = True
    delivery_status: Literal['draft_only'] = 'draft_only'
    requires_authenticated_delivery: Literal[True] = True

class AgentResponse(Contract):
    schema_version: Literal['1.0'] = '1.0'
    request_id: str
    mode: Literal['nemotron', 'deterministic_fallback']
    model: str | None
    fallback_reason: Literal['model_disabled', 'model_unavailable', 'model_protocol_failed'] | None
    summary: str
    risk_level: Literal['high', 'medium', 'low']
    scenarios: list[ScenarioOutput]
    safe_purchase_dates: list[Day]
    safe_to_spend_on_purchase_date: ResultMoney
    stress_tests_passed: int
    stress_tests_total: int
    provenance: Provenance
    passport: Passport
    trust_shield: TrustShield
    tool_trace: list[Trace]
    photon: PhotonDraft
