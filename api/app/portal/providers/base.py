"""Contratos internos: respostas do provedor são reduzidas a referências financeiras."""
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

from app.portal.commercial_models import OrderDocument


class PaymentProviderError(ValueError):
    def __init__(self):
        super().__init__("payment_provider_unavailable")


@dataclass(frozen=True, repr=False)
class CheckoutPreference:
    preference_id: str
    checkout_url: str


@dataclass(frozen=True)
class PaymentObservation:
    payment_id: str
    external_reference: str
    merchant_id: str
    price_minor: int
    currency: str
    status: Literal["pending", "approved", "refused", "cancelled", "refunded", "charged_back"]
    confirmed_at: datetime | None
    updated_at: datetime
    live_mode: bool
    refunded_minor: int = 0


class PaymentProvider(Protocol):
    async def preference(self, order: OrderDocument) -> CheckoutPreference: ...
    async def payment(self, payment_id: str) -> PaymentObservation: ...
    async def search(self, reference: str, after: str | None = None) -> tuple[list[str], str | None]: ...
