"""Real role invocations, verified evidence, and deterministic chart assembly."""
import asyncio
import hashlib
import json
import os
import re
from decimal import Decimal
from uuid import uuid4
import httpx
from .adapter import SimulatorAdapter
from .council_language import choices, decision_copy
from .contracts import AgentRequest
from .council_contracts import RoleReply, SimulationSelection, Review, RunResult, Chart
from .council_prompts import PROMPTS, EDUCATION
from .data_safety import safe_question
from .service import run_agent
from .check import ENDPOINT

SCENARIOS = ['baseline', 'purchase', 'delayed_income', 'unexpected_expense', 'buy_later']


def fingerprint(snapshot):
    return hashlib.sha256(snapshot.model_dump_json().encode()).hexdigest()[:24]


class AsyncNvidiaProvider:
    def __init__(self):
        self.key = os.getenv('NVIDIA_API_KEY', '')
        self.model = os.getenv('NVIDIA_MODEL', 'nvidia/nemotron-3.5-bolt-e4b')

    async def chat(self, messages, *, schema=None, tools=None):
        if not self.key or 'PASTE_' in self.key:
            raise RuntimeError('model_unavailable')
        payload = {'model': self.model, 'messages': messages, 'stream': False,
                   'max_tokens': 1200, 'chat_template_kwargs': {'enable_thinking': False}}
        if schema is not None:
            payload['response_format'] = {'type': 'json_schema', 'json_schema': {
                'name': 'council_output', 'strict': True, 'schema': schema}}
        if tools:
            payload.update(tools=tools, tool_choice='none' if schema is not None else {'type': 'function', 'function': {'name': 'simulate_scenarios'}},
                           parallel_tool_calls=False)
        async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
            response = await client.post(ENDPOINT, headers={'Authorization': 'Bearer ' + self.key}, json=payload)
            if response.status_code != 200:
                raise RuntimeError('model_http_' + str(response.status_code))
            data = response.json()['choices'][0]['message']
            return {k: data[k] for k in ('content', 'tool_calls') if k in data}


def chart_for(analysis):
    baseline = {p.date.isoformat(): Decimal(p.ending_balance)
                for p in analysis.scenarios[0].forecast.daily_balances}
    reserve = Decimal(analysis.passport.reserve)
    series, markers = [], []
    for scenario in analysis.scenarios:
        if not scenario.applicable:
            continue
        forecast = scenario.forecast
        series.append({'scenario': scenario.name, 'points': [
            {'date': p.date, 'balance': p.ending_balance,
             'difference_from_baseline': format(Decimal(p.ending_balance) - baseline[p.date.isoformat()], '.2f'),
             'reserve_headroom': format(Decimal(p.ending_balance) - reserve, '.2f')}
            for p in forecast.daily_balances]})
        markers.append({'scenario': scenario.name, 'date': forecast.minimum_balance_date,
                        'balance': forecast.minimum_balance, 'kind': 'minimum'})
        if Decimal(forecast.starting_balance) < reserve:
            breach = {'date': forecast.start_date, 'balance': forecast.starting_balance}
        else:
            breach = next(({'date': p.date, 'balance': p.balance} for p in forecast.transaction_timeline
                           if Decimal(p.balance) < reserve), None)
        if breach:
            markers.append({'scenario': scenario.name, **breach, 'kind': 'first_reserve_breach'})
    return Chart(id=uuid4().hex, snapshot_id=analysis.provenance.snapshot_id,
                 currency=analysis.provenance.currency, reserve=analysis.passport.reserve,
                 series=series, markers=markers, assumptions=[
                     'Conditional daily closing balances; event-level minimum markers may be lower.',
                     'Same snapshot and horizon for every scenario. No probability or trained predictive model.'])


class CouncilRun:
    def __init__(self, conversation, request, snapshot, source, provider, handoff=None, deadline=60):
        self.conversation, self.request = conversation, request
        self.snapshot, self.source, self.provider = snapshot, source, provider
        self.handoff = handoff
        self.snapshot_id = fingerprint(snapshot)
        self.run_id = uuid4().hex
        self.events, self.reviews, self.results = [], [], {}
        self.analysis, self.chart = None, None
        self.calls = 0
        self.deadline = deadline
        self.role = conversation.role
        self.intake_failed = False
        self.semaphore = asyncio.Semaphore(2)
        self.adapter = None
        self.topic = 'scope'
        self.simulator_exchange = []
        self.simulator_tools = None

    def event(self, role, action, status='completed'):
        self.events.append({'sequence': len(self.events) + 1, 'role': role, 'action': action, 'status': status})

    def facts(self):
        facts = {'source_quality': {'text': 'Only supplied events are modeled; schedule completeness is unverified.',
                                    'evidence': [self.snapshot_id + ':snapshot']}}
        for name, result in self.results.items():
            f = result['forecast']
            ref = self.snapshot_id + ':' + name
            facts[name + '_minimum'] = {'text': f"{name.replace('_', ' ').title()}: minimum projected balance {f['minimum_balance']} {self.snapshot.currency} on {f['minimum_balance_date']}.", 'evidence': [ref]}
            facts[name + '_reserve'] = {'text': f"{name.replace('_', ' ').title()}: " + ('maintains' if result['maintains_reserve'] else 'does not maintain') + ' the selected reserve over this horizon.' + (' This test is not applicable.' if not result['applicable'] else ''), 'evidence': [ref]}
        if self.analysis:
            a = self.analysis
            facts['stress_count'] = {'text': f'{a.stress_tests_passed} of {a.stress_tests_total} applicable stress tests maintain the reserve. This is a test count, not a probability.', 'evidence': [self.snapshot_id + ':stress']}
            facts['safe_dates'] = {'text': (f'First ordinary reserve-preserving purchase date: {a.safe_purchase_dates[0].isoformat()}.' if a.safe_purchase_dates else 'No tested ordinary purchase date preserves the reserve throughout this horizon.'), 'evidence': [self.snapshot_id + ':safe_dates']}
            facts['capacity'] = {'text': f'Calculated spending capacity on the selected date: {a.safe_to_spend_on_purchase_date} {self.snapshot.currency}.', 'evidence': [self.snapshot_id + ':capacity']}
        return facts

    def context(self):
        # Only this role's prior validated outputs against this same snapshot.
        return [{'question': safe_question(m['message']),
                 'findings': [f.model_dump() for review in m['result'].reviews
                              if review.role == self.role for f in review.findings][:8]}
                for m in self.conversation.messages[-3:] if m['result'].snapshot_id == self.snapshot_id]

    async def call(self, role, payload, schema=None, tools=None):
        if self.calls >= 8:
            raise RuntimeError('call_budget')
        self.calls += 1
        async with self.semaphore:
            messages = [{'role': 'system', 'content': PROMPTS[role]}]
            if role == 'simulator' and schema is not None and self.simulator_exchange:
                messages.extend(self.simulator_exchange)
                tools = self.simulator_tools
            messages.append({'role': 'user', 'content': json.dumps(payload)})
            return await self.provider.chat(messages, schema=schema, tools=tools)

    def payload(self, stage):
        a = self.request.analysis
        return {'stage': stage, 'question': safe_question(self.request.message),
                'snapshot_reference': self.snapshot_id, 'facts': self.facts(),
                'confirmed_purchase': a.model_dump(mode='json', exclude={'message'}) if a else None,
                'history': self.context(), 'selected_handoff': self.handoff or [],
                'capabilities': ['cash_flow', 'purchase_timing', 'reserve_stress', 'education']}

    async def review(self, role, stage, extra=None):
        if not self.request.allow_model or (self.request.analysis and not self.request.analysis.allow_model):
            result = Review(role=role, stage=stage, status='disabled', position='insufficient_evidence',
                            findings=[], summary='Model use is disabled; no specialist review was performed.')
        else:
            try:
                payload = {**self.payload(stage), **(extra or {})}
                schema = RoleReply.model_json_schema()
                schema['properties']['fact_ids']['items'] = {'type': 'string', 'enum': list(self.facts())}
                schema['properties']['fact_ids']['minItems'] = 1 if self.request.analysis else 0
                if not self.request.analysis:
                    schema['properties']['fact_ids']['maxItems'] = 1
                    schema['properties']['position']['enum'] = ['insufficient_evidence']
                supported_choices = choices(role, self.results, self.analysis, stage)
                schema['properties']['position']['enum'] = supported_choices
                payload['supported_choices'] = supported_choices
                payload['decision_instruction'] = 'Choose a direct option from supported_choices; do not answer conditional or insufficient_evidence when calculations support a choice.'
                payload['allowed_fact_ids'] = list(self.facts())
                payload['fact_id_rule'] = 'Use keys from allowed_fact_ids, never underlying evidence references.'
                raw = await self.call(role, payload, schema)
                if raw.get('tool_calls'):
                    raise ValueError('Unexpected tool')
                from calculation_engine.data_loader import decode_json
                reply = RoleReply.model_validate(decode_json(raw.get('content') or ''))
                if reply.position not in supported_choices:
                    raise ValueError('Decision not supported by evidence')
                facts = self.facts()
                if len(set(reply.fact_ids)) != len(reply.fact_ids) or any(id not in facts for id in reply.fact_ids):
                    raise ValueError('Unknown evidence')
                if self.request.analysis and not reply.fact_ids:
                    raise ValueError('Missing evidence')
                if not self.request.analysis and (any(id != 'source_quality' for id in reply.fact_ids) or reply.position != 'insufficient_evidence'):
                    raise ValueError('Personalized claim without calculations')
                if reply.position == 'consider_purchase':
                    if not self.results.get('purchase', {}).get('maintains_reserve'):
                        raise ValueError('Unsupported affordability')
                    if role in ('risk', 'council') and self.analysis and self.analysis.passport.recommendation != 'consider_purchase':
                        raise ValueError('Unsupported resilience')
                if stage == 'synthesis' and self.analysis and reply.position != self.analysis.passport.recommendation:
                    raise ValueError('Ungrounded synthesis')
                previous = next((v for v in self.reviews if v.role == role and v.stage == 'initial_review'), None)
                findings = [{'id': self.run_id + ':' + role + ':' + stage + ':' + id,
                             'text': facts[id]['text'], 'evidence_ids': facts[id]['evidence']} for id in reply.fact_ids]
                revised = bool(previous and (previous.position != reply.position or
                               [f.text for f in previous.findings] != [f['text'] for f in findings]))
                recommendation, explanation = decision_copy(role, reply.position, self.results, self.analysis, self.request.analysis, self.snapshot.currency) if self.request.analysis else (None, EDUCATION[reply.topic])
                result = Review(role=role, stage=stage, status='complete', position=reply.position, recommendation=recommendation,
                                findings=findings, summary=explanation, revised=revised,
                                model=getattr(self.provider, 'model', 'configured_nemotron'))
            except asyncio.CancelledError:
                raise
            except Exception as error:
                result = Review(role=role, stage=stage,
                    status='rejected' if isinstance(error, ValueError) else 'unavailable',
                    position='insufficient_evidence', findings=[],
                    summary='This specialist did not complete a validated model response.')
        self.reviews.append(result)
        self.event(role, stage, 'completed' if result.status == 'complete' else 'failed')
        return result

    def simulate(self, names, actor):
        for name in names:
            if name not in self.results:
                self.results[name] = self.adapter.forecast(name)
                self.event('simulator', actor + ':' + name)

    async def simulator(self):
        enabled = self.request.allow_model and self.request.analysis.allow_model
        if enabled:
            try:
                schema = SimulationSelection.model_json_schema()
                schema['properties']['scenarios'].update(minItems=3, maxItems=3)
                schema['properties']['scenarios']['items'] = {'type': 'string', 'enum': ['delayed_income', 'unexpected_expense', 'buy_later']}
                self.simulator_tools = [{
                    'type': 'function', 'function': {'name': 'simulate_scenarios',
                        'description': 'Compute allowed financial scenarios through the deterministic engine.',
                        'parameters': schema}}]
                raw = await self.call('simulator', self.payload('tool_selection'), tools=self.simulator_tools)
                calls = raw.get('tool_calls', [])
                if len(calls) != 1 or calls[0].get('type') != 'function' or not isinstance(calls[0].get('id'), str) or not 1 <= len(calls[0]['id']) <= 200:
                    raise ValueError('Expected one tool call')
                fn = calls[0].get('function', {})
                if fn.get('name') != 'simulate_scenarios' or not isinstance(fn.get('arguments'), str) or len(fn['arguments']) > 1000:
                    raise ValueError('Unauthorized tool')
                from calculation_engine.data_loader import decode_json
                selection = SimulationSelection.model_validate(decode_json(fn['arguments']))
                if len(set(selection.scenarios)) != len(selection.scenarios) or not set(['delayed_income', 'unexpected_expense', 'buy_later']).issubset(selection.scenarios):
                    raise ValueError('Required comparisons missing')
                self.simulate(selection.scenarios, 'model_requested')
                self.simulator_exchange = [
                    {'role': 'assistant', 'content': None, 'tool_calls': [{'id': calls[0]['id'], 'type': 'function', 'function': {'name': 'simulate_scenarios', 'arguments': json.dumps(selection.model_dump())}}]},
                    {'role': 'tool', 'tool_call_id': calls[0]['id'], 'content': json.dumps({'verified_facts': self.facts()})},
                ]
            except asyncio.CancelledError:
                raise
            except Exception:
                self.event('simulator', 'tool_selection', 'failed')
        self.simulate(SCENARIOS, 'server_guaranteed')
        self.finish_calculations()
        return await self.review('simulator', 'direct_reply' if self.role == 'simulator' else 'evidence_review')

    def finish_calculations(self):
        if self.analysis is not None or not self.request.analysis:
            return
        request = self.request.analysis.model_copy(update={'allow_model': False, 'message': ''})
        self.analysis = run_agent(request, self.snapshot, self.source)
        self.chart = chart_for(self.analysis)

    def output(self, status='complete', message=None, question=None):
        completed = [v for v in self.reviews if v.status == 'complete']
        failed = any(v.status != 'complete' for v in self.reviews) or any(e['status'] == 'failed' for e in self.events)
        enabled = self.request.allow_model and (not self.request.analysis or self.request.analysis.allow_model)
        mode = ('no_analysis' if status in ('needs_clarification', 'unsupported') else
                'deterministic_only' if not enabled else 'partial' if failed or not completed else
                'nemotron_council' if self.role == 'council' else 'nemotron_specialist')
        if status == 'cancelled':
            mode = 'partial'
        if status == 'complete' and mode == 'partial':
            status = 'partial'
        limitations = ['Temporary, session-isolated chats; restart or expiry clears history.',
            'One configured customer; no multi-user login system. No payment or external message is executed.',
            'Only purchase cash-flow calculations are supported. Debt interest, goal dates and probabilities are unavailable.',
            'Model selects verified findings; financial prose and charts are assembled from engine evidence.']
        latest = next((v for v in reversed(self.reviews) if v.role == self.role), None)
        if message is None and latest and latest.status == 'complete' and latest.recommendation:
            message = latest.recommendation + ' ' + latest.summary
        return RunResult(run_id=self.run_id, conversation_id=self.conversation.id, role=self.role,
            status=status, mode=mode, message=message or (self.analysis.summary if self.analysis else EDUCATION[self.topic]),
            next_question=question, snapshot_id=self.snapshot_id, reviews=self.reviews, events=self.events,
            analysis=self.analysis, chart=self.chart, limitations=limitations,
            handoff_reference=(self.conversation.id + ':' + self.run_id) if completed else None)

    async def execute(self):
        try:
            async with asyncio.timeout(self.deadline):
                return await self.workflow()
        except TimeoutError:
            self.event(self.role, 'deadline', 'cancelled')
            self.finish_calculations()
            return self.output('cancelled', 'The council reached its time limit. Completed evidence is preserved; unfinished reviews are not attributed to agents.')

    async def workflow(self):
        if self.request.analysis and re.search(r'credit card|\bAPR\b|interest|mortgage|\bloan\b|retire|invest|pay off|\bdebt\b', self.request.message, re.I):
            return self.output('unsupported', 'Personalized debt, interest and investment comparisons require calculation modules that are not implemented. No purchase-only recommendation was substituted.', 'Would you like a purchase cash-flow analysis or a conceptual explanation instead?')
        if self.request.analysis:
            self.adapter = SimulatorAdapter(self.snapshot, self.request.analysis)
            self.simulate(['baseline', 'purchase'], 'server_baseline')
        else:
            # No parsing/execution of implied amounts. Education can run without numbers.
            numeric_intent = bool(re.search(r'[$€£]|\d|\b(buy|purchase|afford|repay|pay off|invest|retire)\b', self.request.message, re.I))
            if numeric_intent:
                if re.search(r'\blaptop\b',self.request.message,re.I) and re.search(r'\bcar\b',self.request.message,re.I):
                    return self.output('needs_clarification', 'We can compare buying the laptop, paying cash upfront for the car, and keeping your money. First I need the cost of each choice.',
                        'What is the laptop price and the car down payment? Your stated cash balance is context, not a purchase price. Car financing and ongoing costs need separate inputs.')
                return self.output('needs_clarification', 'What would the purchase cost, and when would you make it?',
                    'Confirm the price and date below, plus the cash reserve you want to keep. A balance you mention is kept separate from the purchase price and your connected account snapshot.')
        if self.role == 'council' and self.request.analysis:
            # Framing is a real Leader call. It does not receive specialist conclusions.
            await self.review('council', 'framing')
            initial = await asyncio.gather(self.review('budget', 'initial_review'), self.review('risk', 'initial_review'))
            await self.simulator()
            evidence = {'initial_positions': [{'role': v.role, 'position': v.position,
                'findings': [f.model_dump() for f in v.findings]} for v in initial]}
            revised = await asyncio.gather(self.review('budget', 'evidence_review', evidence),
                                           self.review('risk', 'evidence_review', evidence))
            await self.review('council', 'synthesis', {'specialist_reviews': [v.model_dump() for v in revised],
                'required_verdict': self.analysis.passport.recommendation})
        elif self.request.analysis:
            if self.role == 'simulator':
                await self.simulator()
            else:
                self.simulate(SCENARIOS, 'server_direct')
                self.finish_calculations()
                await self.review(self.role, 'direct_reply')
        else:
            result = await self.review(self.role, 'direct_reply')
            if result.status == 'complete':
                # Summary is a vetted educational template; no model prose is displayed.
                return self.output(message=result.summary)
        return self.output()
