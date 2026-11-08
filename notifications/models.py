"""Pydantic data models for Plutus Photon notifications and preferences."""
from pydantic import BaseModel, Field, ConfigDict
from typing import Literal


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NotificationPreferencesRequest(Strict):
    phone_number: str = Field(default="", max_length=20)
    enabled: bool = False
    budget_alerts: bool = True
    purchase_alerts: bool = True
    threshold_percent: int = Field(default=85, ge=50, le=100)


class NotificationPreferencesResponse(Strict):
    phone_number: str
    phone_number_masked: str
    enabled: bool
    budget_alerts: bool
    purchase_alerts: bool
    threshold_percent: int
    verified: bool
    updated_at: str


class WatchlistCreateRequest(Strict):
    label: str = Field(min_length=1, max_length=100)
    amount_cents: int = Field(gt=0, le=100_000_000)
    reserve_cents: int = Field(ge=0, le=100_000_000)
    purchase_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    horizon_days: int = Field(default=30, ge=1, le=90)


class WatchlistItemResponse(Strict):
    id: str
    label: str
    amount_cents: int
    reserve_cents: int
    purchase_date: str
    horizon_days: int
    ready: bool
    notified: bool
    minimum_balance: str | None = None
    reserve: str | None = None
    basis: str | None = None
    created_at: str


class AlertEventResponse(Strict):
    id: int
    alert_key: str
    kind: str
    text: str
    status: str
    created_at: str


class SpendRequest(Strict):
    amount_cents: int = Field(gt=0, le=10_000_000)


class AdvancePaydayRequest(Strict):
    note: str | None = Field(default=None, max_length=200)


class MessagingStatusResponse(Strict):
    connected: bool
    demo: bool = True
    channel: str | None = None
    instructions: str | None = None

