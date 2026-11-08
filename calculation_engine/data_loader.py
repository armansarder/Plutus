"""Adapters normalize external output to FinancialData, never to simulator internals."""
import json
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Callable, Protocol

from .models import FinancialData
from .outbound import MAX_SOURCE_BYTES, read_json_https

MOCK_PATH = Path(__file__).with_name('mock_data.json')


class DataSourceError(Exception):
    """Unavailable or invalid source data (HTTP 503 at the API boundary)."""


class FinancialDataSource(Protocol):
    def load(self) -> dict | FinancialData:
        """Return a snapshot matching the shared contract, or raise an exception."""
        ...


def decode_json(text: str):
    def reject_constant(value):
        raise ValueError(f'Non-finite JSON value: {value}')

    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f'Duplicate JSON key: {key}')
            result[key] = value
        return result

    return json.loads(text, parse_float=Decimal, parse_constant=reject_constant,
                      object_pairs_hook=unique_keys)


@dataclass
class JsonFileAdapter:
    path: str | Path = MOCK_PATH

    def load(self):
        with Path(self.path).open('rb') as stream:
            content = stream.read(MAX_SOURCE_BYTES + 1)
        if len(content) > MAX_SOURCE_BYTES:
            raise ValueError('Source file exceeds size limit')
        return decode_json(content.decode('utf-8-sig'))


@dataclass
class FunctionAdapter:
    function: Callable[[], dict | FinancialData]

    def load(self):
        return self.function()


@dataclass
class ApiAdapter:
    """URL and transformation supplied by integration code, not guessed here."""
    url: str
    transform: Callable[[dict], dict] = lambda payload: payload
    timeout: float = 10.0
    allowed_hosts: tuple[str, ...] = ()

    def load(self):
        return self.transform(read_json_https(self.url, allowed_hosts=self.allowed_hosts,
                                              timeout=self.timeout))


def load_financial_data(source: FinancialDataSource | None = None) -> FinancialData:
    try:
        raw = (source if source is not None else JsonFileAdapter()).load()
        # Revalidate even model instances; adapters cannot bypass the contract.
        return FinancialData.model_validate(
            raw.model_dump() if isinstance(raw, FinancialData) else raw
        ).model_copy(deep=True)
    except Exception as exc:
        raise DataSourceError('Financial source is unavailable or violates the schema') from exc
