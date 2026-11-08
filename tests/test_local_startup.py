from start_local import environments
import start_local
from unittest.mock import Mock, MagicMock
import httpx
import pytest


def test_file_token_overrides_stale_shell_and_stays_server_side():
    values = dict(FINPILOT_MODE='local', FINPILOT_DATA_SOURCE='nessie',
                  FINPILOT_API_TOKEN='new-test-token', NESSIE_API_KEY='private-test-key',
                  FINPILOT_CUSTOMER_ID='test-customer', NESSIE_ACCOUNT_ID='test-account')
    backend, frontend = environments({'FINPILOT_API_TOKEN': 'stale-test-token',
                                      'NESSIE_API_KEY': 'old-test-key',
                                      'VITE_SITUATION_DATA_MODE': 'synthetic_demo'}, values)
    assert backend['FINPILOT_API_TOKEN'] == frontend['FINPILOT_API_TOKEN'] == values['FINPILOT_API_TOKEN']
    assert backend['NESSIE_API_KEY'] == values['NESSIE_API_KEY']
    assert not any(k.startswith(('NESSIE_', 'NVIDIA_')) for k in frontend)
    assert frontend['VITE_DATA_MODE'] == frontend['VITE_SITUATION_DATA_MODE'] == 'remote'
    assert frontend['VITE_COUNCIL_ENABLED'] == 'true'
    assert backend['PLUTUS_COUNCIL_ENABLED'] == '1'
    assert not any(k.startswith('VITE_') and v == values['FINPILOT_API_TOKEN'] for k, v in frontend.items())


def test_saved_backend_configuration_changes_trigger_reload(monkeypatch):
    engine, model = Mock(), Mock()
    engine.read_bytes.return_value = b'FINPILOT_API_TOKEN=first-test-token'
    model.read_bytes.return_value = b'NVIDIA_API_KEY=first-test-key'
    monkeypatch.setattr(start_local, 'CONFIG_FILES', (engine, model))
    original = start_local.configuration_version()
    model.read_bytes.return_value = b'NVIDIA_API_KEY=second-test-key'
    assert start_local.configuration_version() != original
    changed = start_local.configuration_version()
    engine.read_bytes.return_value = b'FINPILOT_API_TOKEN=second-test-token'
    assert start_local.configuration_version() != changed


def test_windows_shutdown_stops_owned_process_tree(monkeypatch):
    monkeypatch.setattr(start_local.os, 'name', 'nt')
    run = Mock()
    monkeypatch.setattr(start_local.subprocess, 'run', run)
    child = Mock(pid=12345)
    child.poll.return_value = None
    start_local.stop_child(child)
    assert run.call_args.args[0] == ['taskkill', '/PID', '12345', '/T', '/F']
    child.wait.assert_called_once_with(timeout=5)


def test_repeated_start_reuses_only_matching_services(monkeypatch):
    status = {'enabled': True, 'model_configured': True, 'roles': ['council']}
    client = Mock()
    client.get.return_value = httpx.Response(200, json=status)
    context = Mock()
    context.__enter__ = Mock(return_value=client)
    context.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(start_local.httpx, 'Client', Mock(return_value=context))
    backend = {'FINPILOT_API_TOKEN': 'private-test-token', 'NVIDIA_API_KEY': 'private-model-key'}
    assert start_local.reuse_running_app(backend, {8000, 8080})
    client.get.return_value = httpx.Response(401, json={'error': 'private-response'})
    with pytest.raises(ValueError, match='stale settings') as error:
        start_local.reuse_running_app(backend, {8000, 8080})
    assert 'private' not in str(error.value)


def test_partial_port_conflict_never_launches_duplicate_servers():
    assert start_local.reuse_running_app({}, set()) is False
    with pytest.raises(ValueError, match='old server occupies port 8000'):
        start_local.reuse_running_app({}, {8000})


def test_outage_still_opens_ui_and_invalid_save_keeps_services(monkeypatch, capsys):
    backend = {'FINPILOT_API_TOKEN': 'private-test-token'}
    monkeypatch.setattr(start_local, 'load_environments', Mock(side_effect=[
        (backend, {}), ValueError('private-invalid-value'), (backend, {})]))
    monkeypatch.setattr(start_local, 'configuration_version', Mock(side_effect=[0, 1, 2]))
    monkeypatch.setattr(start_local, 'ROOT', MagicMock())
    monkeypatch.setattr(start_local.shutil, 'which', Mock(return_value='node'))
    socket = MagicMock()
    socket.__enter__.return_value.connect_ex.return_value = 1
    monkeypatch.setattr(start_local.socket, 'socket', Mock(return_value=socket))
    client = MagicMock()
    client.__enter__.return_value.get.return_value = httpx.Response(503)
    monkeypatch.setattr(start_local.httpx, 'Client', Mock(return_value=client))
    api, ui = Mock(), Mock()
    api.poll.return_value = ui.poll.return_value = None
    spawn = Mock(side_effect=[api, ui])
    monkeypatch.setattr(start_local.subprocess, 'Popen', spawn)
    stop = Mock()
    monkeypatch.setattr(start_local, 'stop_child', stop)
    monkeypatch.setattr(start_local.time, 'sleep', Mock())
    assert start_local.run_once() == 2
    assert spawn.call_count == 2  # UI remains available during a Nessie outage.
    assert [call.args[0] for call in stop.call_args_list] == [ui, api]
    output = capsys.readouterr().out
    assert 'keeping the current services running' in output
    assert 'Authenticated Nessie check: HTTP 200' not in output
    assert 'private-invalid-value' not in output
