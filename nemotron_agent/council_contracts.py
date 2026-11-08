"""Council v2 contracts; v1 remains unchanged. No model-authored financial numbers."""
from typing import Literal
from pydantic import Field
from calculation_engine.models import Contract, ResultMoney, Day
from .contracts import AgentRequest, AgentResponse, ScenarioName

Role = Literal['council', 'budget', 'risk', 'simulator']
Topic = Literal['liquidity', 'reserve', 'forecasting', 'debt', 'goals', 'privacy', 'scope']

class ConversationCreate(Contract):
    role: Role

class MessageRequest(Contract):
    request_key: str = Field(pattern=r'^[a-zA-Z0-9_-]{8,80}$')
    message: str = Field(min_length=1, max_length=2000)
    analysis: AgentRequest | None = None
    handoff: str | None = Field(default=None, pattern=r'^[a-f0-9]{32}:[a-f0-9]{32}$')
    expected_snapshot_id: str | None = Field(default=None, pattern=r'^[a-f0-9]{24}$')
    allow_model: bool = True

class Intake(Contract):
    kind: Literal['purchase', 'education', 'clarify', 'unsupported']
    topic: Topic

class RoleReply(Contract):
    fact_ids: list[str] = Field(max_length=8)
    position: Literal['conditional', 'insufficient_evidence', 'consider_purchase', 'consider_waiting', 'reserve_at_risk']
    topic: Topic

class SimulationSelection(Contract):
    scenarios: list[Literal['delayed_income', 'unexpected_expense', 'buy_later']] = Field(min_length=3, max_length=3)

class Finding(Contract):
    id: str
    text: str
    evidence_ids: list[str]

class Review(Contract):
    role: Role
    stage: Literal['framing', 'initial_review', 'evidence_review', 'direct_reply', 'synthesis']
    status: Literal['complete', 'unavailable', 'rejected', 'disabled', 'cancelled']
    position: str
    findings: list[Finding]
    summary: str
    recommendation: str | None = None
    revised: bool = False
    model: str | None = None

class Event(Contract):
    sequence: int
    role: Role
    action: str
    status: Literal['completed', 'failed', 'cancelled']

class Marker(Contract):
    scenario: ScenarioName
    date: Day
    balance: ResultMoney
    kind: Literal['minimum', 'first_reserve_breach']

class Point(Contract):
    date: Day
    balance: ResultMoney
    difference_from_baseline: ResultMoney
    reserve_headroom: ResultMoney

class Series(Contract):
    scenario: ScenarioName
    points: list[Point]

class Chart(Contract):
    id: str
    snapshot_id: str
    currency: str
    reserve: ResultMoney
    kind: Literal['line'] = 'line'
    series: list[Series]
    markers: list[Marker]
    assumptions: list[str]

class RunResult(Contract):
    schema_version: Literal['2.0'] = '2.0'
    run_id: str
    conversation_id: str
    role: Role
    status: Literal['complete', 'partial', 'needs_clarification', 'unsupported', 'cancelled']
    mode: Literal['nemotron_council', 'nemotron_specialist', 'partial', 'deterministic_only', 'no_analysis']
    message: str
    next_question: str | None = None
    snapshot_id: str
    reviews: list[Review]
    events: list[Event]
    analysis: AgentResponse | None = None
    chart: Chart | None = None
    handoff_reference: str | None = None
    limitations: list[str]

class MessageRecord(Contract):
    request_key: str
    message: str
    result: RunResult

class ConversationView(Contract):
    id: str
    role: Role
    messages: list[MessageRecord]
    busy: bool
    temporary: Literal[True] = True

class CouncilStatus(Contract):
    enabled: bool
    roles: list[Role]
    temporary: Literal[True] = True
    scope: str
