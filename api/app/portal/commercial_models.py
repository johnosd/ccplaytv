"""Controle comercial; nenhum dado de cartão ou webhook cru é persistido."""
from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from app.portal.models import Digest, OpaqueId, PortalDocument, Revision

OrderState = Literal["created", "pending", "approved", "refused", "cancelled", "refunded", "charged_back"]


class OrderDocument(PortalDocument):
    order_id: OpaqueId
    device_id: OpaqueId
    offer_version: Literal["annual-brl-3500-v1"] = "annual-brl-3500-v1"
    price_minor: Literal[3500] = 3500
    currency: Literal["BRL"] = "BRL"
    term_months: Literal[12] = 12
    reference: OpaqueId
    status: OrderState = "created"
    created_at: AwareDatetime
    updated_at: AwareDatetime
    confirmed_at: AwareDatetime | None = None
    provider_payment_id: OpaqueId | None = None
    preference_id: OpaqueId | None = None
    checkout_url: str | None = Field(default=None, max_length=4096, repr=False)
    provider_updated_at: AwareDatetime | None = None
    reconcile_after: AwareDatetime
    checkout_lease: OpaqueId | None = None
    checkout_lease_until: AwareDatetime | None = None
    # 073/D-001–D-003: Pix da tentativa corrente. O copia-e-cola só sai na rota da TV e some quando o pedido termina.
    pix_payment_id: OpaqueId | None = None
    pix_qr_code: str | None = Field(default=None, max_length=1024, repr=False)
    pix_expires_at: AwareDatetime | None = None
    pix_attempt: int = Field(default=0, ge=0)
    # 073/D-005: pedido derivado de um pagamento excedente aprovado no pedido `parent_order_id`.
    parent_order_id: OpaqueId | None = None

    @model_validator(mode="after")
    def fixed_reference(self):
        if self.reference != self.order_id:
            raise ValueError("immutable_order_reference")
        return self


class OrderClaimDocument(PortalDocument):
    device_id: OpaqueId
    order_id: OpaqueId
    digest: Digest
    created_at: AwareDatetime


class PaymentClaimDocument(PortalDocument):
    payment_id: OpaqueId
    order_id: OpaqueId
    device_id: OpaqueId
    created_at: AwareDatetime


class GrantDocument(PortalDocument):
    order_id: OpaqueId
    device_id: OpaqueId
    provider_payment_id: OpaqueId
    confirmed_at: AwareDatetime
    starts_at: AwareDatetime
    expires_at: AwareDatetime
    status: Literal["valid", "refunded", "charged_back"]


class LicensingStateDocument(PortalDocument):
    device_id: OpaqueId
    revision: Revision = 0
    pending_order_id: OpaqueId | None = None
    grant_order_ids: list[OpaqueId] = Field(default_factory=list)
    revocation_fence: OpaqueId | None = None

    @model_validator(mode="after")
    def unique_grants(self):
        if len(self.grant_order_ids) != len(set(self.grant_order_ids)):
            raise ValueError("duplicate_grants")
        return self


class PaymentEventDocument(PortalDocument):
    payment_id: OpaqueId
    created_at: AwareDatetime
    last_received_at: AwareDatetime
    reconcile_after: AwareDatetime
    state: Literal["pending", "completed"] = "pending"


class LicenseIntentDocument(PortalDocument):
    operation_id: OpaqueId
    device_id: OpaqueId
    order_id: OpaqueId
    payment_id: OpaqueId
    status: Literal["refunded", "charged_back"]
    confirmed_at: AwareDatetime
    provider_updated_at: AwareDatetime
    target_generation: Revision
    state: Literal["pending_journal", "finalized"] = "pending_journal"
    created_at: AwareDatetime
    journal_object_id: str
    journal_digest: Digest
