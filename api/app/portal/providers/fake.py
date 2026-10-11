"""Somente testes: não simula homologação, dinheiro ou assinatura Mercado Pago."""
from app.portal.commercial_models import OrderDocument
from app.portal.providers.base import CheckoutPreference, PaymentObservation, PaymentProviderError


class FakePaymentProvider:
    def __init__(self, *, environment: str):
        if environment != "test":
            raise PaymentProviderError()
        self.observations: dict[str, PaymentObservation] = {}
        self.preferences: dict[str, CheckoutPreference] = {}
        self.unavailable = False

    async def preference(self, order: OrderDocument):
        if self.unavailable:
            raise PaymentProviderError()
        if order.order_id not in self.preferences:
            self.preferences[order.order_id] = CheckoutPreference("fake-" + order.order_id,
                "https://checkout.fixture.test/" + order.order_id)
        return self.preferences[order.order_id]

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
