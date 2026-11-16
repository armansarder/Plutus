"""Seeded fictional truth shared across presentation conditions; no participant data."""
import hashlib
import json
import random
from datetime import date,timedelta
from decimal import Decimal
from pathlib import Path
from typing import Literal
from pydantic import Field
from calculation_engine.models import Contract,FinancialData,Transaction,ResultMoney
from calculation_engine.multiverse import MultiverseRequest,MultiverseResponse,compare_futures
from nemotron_agent.contracts import AgentRequest
from nemotron_agent.service import run_agent

Condition=Literal['direct','evidence','multi_agent','uncertainty']
class ScenarioConfig(Contract):
    id:Literal['comfortable','tight_timing','shortfall']
    balance:ResultMoney
    purchase:ResultMoney
    rent:ResultMoney
    income:ResultMoney
    reserve:ResultMoney

class ExperimentConfig(Contract):
    experiment_version:Literal['pilot-1']
    decision_rule:Literal['reserve_and_applicable_stresses_v1']
    conditions:list[Condition]
    outcomes:list[str]
    scenarios:list[ScenarioConfig]

def config():return ExperimentConfig.model_validate_json(Path(__file__).with_name('scenarios.json').read_text(encoding='utf-8'))

class PreviewRequest(Contract):
    experiment_version:Literal['pilot-1']='pilot-1'
    scenario_id:Literal['comfortable','tight_timing','shortfall']='comfortable'
    seed:int=Field(default=42,ge=0,le=2147483647,strict=True)
    condition:Condition='direct'

class PreviewResult(Contract):
    experiment_version:Literal['pilot-1']='pilot-1'
    scenario_id:str
    instance_id:str
    seed:int
    condition:Condition
    source:Literal['research_scenario']='research_scenario'
    assigned_recommendation:Literal['consider_purchase','consider_waiting','reserve_at_risk']
    explanation:str
    simulated_presentation:Literal[True]=True
    collection_enabled:Literal[False]=False
    financial_truth:MultiverseResponse
    history:list[Transaction]
    outcomes:list[str]

def assignment(slot:int,seed:int):
    if not 0<=slot<10000:raise ValueError('Synthetic slot outside pilot bounds')
    values=list(config().conditions)
    rng=random.Random(int(hashlib.sha256(f'pilot-1:{seed}:{slot//4}'.encode()).hexdigest(),16))
    rng.shuffle(values)
    return values[slot%4]

def preview(request:PreviewRequest):
    cfg=config();scenario=next(s for s in cfg.scenarios if s.id==request.scenario_id)
    rng=random.Random(request.seed);start=date(2026,1,1)
    def event(id,offset,amount,label):
        return Transaction(id=id,date=start+timedelta(days=offset),amount=amount,
            description=label,type='income' if Decimal(amount)>0 else 'expense',source_status='estimated')
    history=[event('history_'+str(i),-30+i*7,format(-Decimal(rng.randrange(20,60)),'.2f'),'Fictional groceries') for i in range(3)]
    snapshot=FinancialData(customer_id='research_fictional',currency='USD',as_of_date=start,
        current_balance=scenario.balance,snapshot_basis='opening',historical_transactions=history,
        upcoming_transactions=[event('rent',5,'-'+scenario.rent,'Fictional rent'),
            event('income',14,scenario.income,'Fictional income'),
            event('groceries',10,format(-Decimal(rng.randrange(10,30)),'.2f'),'Fictional groceries')],
        source_notes=['Research Scenario: standardized fictional records; fixed dates, no bank connection.'])
    request_fields=dict(purchase_amount=scenario.purchase,purchase_date=start,reserve=scenario.reserve,horizon_days=30)
    analysis=run_agent(AgentRequest(**request_fields,allow_model=False),snapshot,'synthetic_demo')
    evidence=compare_futures(snapshot,MultiverseRequest(**request_fields,later_date=start+timedelta(days=15)),None)
    evidence.source.source='research_scenario';evidence.source.label='Research Scenario'
    evidence.source.observed_at='2026-01-01T00:00:00+00:00'
    verdict=analysis.passport.recommendation
    direct={'consider_purchase':'Consider the purchase within the stated assumptions.',
        'consider_waiting':'Consider waiting or reducing the purchase.',
        'reserve_at_risk':'The reserve is at risk; do not rely on this plan to preserve it.'}[verdict]
    purchase=next(s for s in analysis.scenarios if s.name=='purchase')
    numeric=f'Expected purchase minimum is {purchase.forecast.minimum_balance} USD against a {scenario.reserve} USD reserve.'
    explanations={
        'direct':direct,
        'evidence':direct+' '+numeric+f' Applicable stress cases passed: {analysis.stress_tests_passed}/{analysis.stress_tests_total}.',
        'multi_agent':direct+' Simulated Budget perspective: '+numeric+' Simulated Risk perspective: '+f'{analysis.stress_tests_passed}/{analysis.stress_tests_total} applicable stress cases preserve the reserve. No live agents were consulted.',
        'uncertainty':direct+' '+numeric+' This depends on the supplied schedule. Missing expenses, fees and interest are not modeled; test-case counts are not probabilities.'}
    return PreviewResult(scenario_id=request.scenario_id,instance_id=hashlib.sha256(f'pilot-1:{request.scenario_id}:{request.seed}'.encode()).hexdigest()[:24],
        seed=request.seed,condition=request.condition,assigned_recommendation=verdict,
        explanation=explanations[request.condition],financial_truth=evidence,history=history,outcomes=cfg.outcomes)

class SyntheticEvent(Contract):
    schema_version:Literal['pilot-1']='pilot-1'
    synthetic:Literal[True]=True
    sample_slot:int=Field(ge=0,lt=10000,strict=True)
    scenario_id:str
    condition:Condition
    event:Literal['condition_shown','synthetic_choice','explanation_acknowledged']
    decision_time_ms:int=Field(ge=0,le=3600000,strict=True)
    consent_basis:Literal['test_data_only']='test_data_only'

def install_research(app):
    import os
    from fastapi import APIRouter,Depends,HTTPException
    from notifications.operator import require_operator
    router=APIRouter(prefix='/api/research',dependencies=[Depends(require_operator)])
    @router.post('/preview',response_model=PreviewResult)
    def show(body:PreviewRequest):
        if os.getenv('PLUTUS_RESEARCH_ENABLED')!='1':raise HTTPException(404,'Not found')
        return preview(body)
    app.include_router(router)
