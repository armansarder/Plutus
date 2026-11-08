import json

import httpx
import pytest

from nemotron_agent.check import completion, execute_tool, run


def call(name='simulate_purchase', **arguments):
    return {'id': 'demo_call', 'type': 'function', 'function': {
        'name': name, 'arguments': json.dumps(arguments or {
            'purchase_amount': '400.00', 'purchase_date': '2026-11-08'})}}


def test_real_simulator_result():
    result = execute_tool(call())
    assert result['minimum_balance'] == '-100.00'
    assert result['ending_balance'] == '900.00'
    assert result['shortfall_occurs'] is True


@pytest.mark.parametrize('tool', [call('transfer_money'),
    call(purchase_amount='401.00', purchase_date='2026-11-08'),
    call(purchase_amount='400.00', purchase_date='2026-11-08', customer_id='other'),
    call(purchase_amount=True, purchase_date='2026-11-08')])
def test_reject_unapproved_requests(tool):
    with pytest.raises(ValueError):
        execute_tool(tool)


def test_provider_errors_do_not_expose_body():
    transport = httpx.MockTransport(lambda r: httpx.Response(401, text='private provider detail'))
    with httpx.Client(transport=transport) as client:
        with pytest.raises(RuntimeError, match='NVIDIA HTTP 401') as error:
            completion(client, 'test-secret', 'test-model', [])
    assert 'private' not in str(error.value)
    assert 'test-secret' not in str(error.value)


def test_tool_round_trip(monkeypatch, capsys):
    monkeypatch.setenv('NVIDIA_API_KEY', 'offline-test-only')
    requests = []

    def fake_completion(client, key, model, messages, **options):
        requests.append(list(messages))
        if len(requests) == 1:
            return {'role': 'assistant', 'content': None, 'tool_calls': [call()]}
        assert messages[-1]['role'] == 'tool'
        assert json.loads(messages[-1]['content'])['minimum_balance'] == '-100.00'
        assert options['tool_choice'] == 'none'
        return {'role': 'assistant', 'content': 'The simulation shows a shortfall.'}

    monkeypatch.setattr('nemotron_agent.check.completion', fake_completion)
    run('tool')
    assert len(requests) == 2
    assert 'PASS:' in capsys.readouterr().out
