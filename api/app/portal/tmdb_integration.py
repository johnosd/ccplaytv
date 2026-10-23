"""Chave TMDB BYOK digitada no portal e entregue à TV (feature 077, ADR-020, constitution 1.15.0 (j)).

Especialização de `KeyIntegrationService` (key_integration.py, extraída na feature 091 sem mudar o comportamento): documento
`devices/{id}/integrations/tmdb`, contexto de cifra `(device_id, "tmdb-key", operation_id)`, chave `[A-Za-z0-9._-]{16,600}`
e o que a TV informa em `integrations.tmdb`.
"""

import re

from app.portal.auth import AuthService
from app.portal.crypto import PortalCrypto
from app.portal.key_integration import (
    REJECT_REASONS,
    RETENTION,
    RETRY_REASONS,
    KeyIntegrationService,
)

KEY_PATTERN = re.compile(r"[A-Za-z0-9._-]{16,600}")

__all__ = ["KEY_PATTERN", "REJECT_REASONS", "RETENTION", "RETRY_REASONS", "TmdbIntegrationService"]


class TmdbIntegrationService(KeyIntegrationService):
    def __init__(self, auth: AuthService, crypto: PortalCrypto):
        super().__init__(auth, crypto, kind="tmdb", cipher_label="tmdb-key", key_pattern=KEY_PATTERN,
                         reported=lambda integrations: integrations.tmdb)
