from pydantic import Field
from calculation_engine.models import Contract, Day

class Preferences(Contract):
    enabled: bool = False
    purchase_alerts: bool = True
    budget_alerts: bool = False
    threshold_percent: int = Field(default=85, ge=50, le=100, strict=True)
    budget_category: str = Field(default='Groceries', min_length=1, max_length=80, strict=True)
    budget_limit_cents: int = Field(default=0, ge=0, le=100_000_000, strict=True)

class WatchPurchase(Contract):
    label: str = Field(min_length=1, max_length=100, strict=True)
    amount_cents: int = Field(gt=0, le=100_000_000, strict=True)
    reserve_cents: int = Field(ge=0, le=100_000_000, strict=True)
    purchase_date: Day | None = None
    horizon_days: int = Field(default=30, ge=1, le=90, strict=True)
