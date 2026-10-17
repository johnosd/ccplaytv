"""Somente testes: não simula homologação, dinheiro ou assinatura Mercado Pago."""
import hashlib

from app.portal.commercial_models import OrderDocument
from app.portal.providers.base import (
    CheckoutPreference,
    PaymentObservation,
    PaymentProviderError,
    PixCharge,
)


class FakePaymentProvider:
    def __init__(self, *, environment: str):
        if environment != "test":
            raise PaymentProviderError()
        self.observations: dict[str, PaymentObservation] = {}
        self.preferences: dict[str, CheckoutPreference] = {}
        # 073: cada chamada de Pix fica registrada para provar reaproveitamento (nenhuma chamada nova).
        self.pix_calls: list[tuple[str, int, str]] = []
        self.unavailable = False

    async def preference(self, order: OrderDocument):
        if self.unavailable:
            raise PaymentProviderError()
        if order.order_id not in self.preferences:
            self.preferences[order.order_id] = CheckoutPreference("fake-" + order.order_id,
                "https://checkout.fixture.test/" + order.order_id)
        return self.preferences[order.order_id]

    async def pix(self, order: OrderDocument, *, attempt, expires_at, payer_email):
        if self.unavailable:
            raise PaymentProviderError()
        self.pix_calls.append((order.order_id, attempt, payer_email))
        digest = hashlib.sha256((order.order_id + "/" + str(attempt)).encode()).hexdigest()
        payment_id = str(int(digest[:12], 16))
        return PixCharge(payment_id, "00020126580014br.gov.bcb.pix0136fixture-" + digest[:16] + "6304ABCD", expires_at)

    async def payment(self, payment_id: str):
        if self.unavailable or payment_id not in self.observations:
            raise PaymentProviderError()
        return self.observations[payment_id]

    async def search(self, reference: str, after: str | None = None):
        if self.unavailable:
            raise PaymentProviderError()
        ids = sorted(value.payment_id for value in self.observations.values()
                     if value.external_reference == reference and (after is None or value.payment_id > after))
        return ids[:5], ids[4] if len(ids) > 5 else None
