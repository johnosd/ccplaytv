"""Chaves de legenda BYOK (OpenSubtitles e SubDL) digitadas no portal e entregues à TV (feature 091, ADR-022,
constitution 1.17.0 exceção (m)). Mesmo molde de `tmdb_integration.py`: um documento por TV **e por fornecedor**
(`devices/{id}/integrations/subtitles-{provider}`), uma operação pendente por documento, envelope cifrado com contexto
`(device_id, "subtitle-key:{provider}", operation_id)`, apagado ao aplicar, recusar, substituir, remover, expirar ou
trocar a chave de acesso. Nada daqui entra em log, erro, resposta ao navegador ou índice.

Compõe duas instâncias de `KeyIntegrationService` (key_integration.py): a regra de segredo mora num lugar só.
"""

import re
from datetime import datetime

from app.portal.auth import AuthError, AuthService, Principal
from app.portal.crypto import PortalCrypto
from app.portal.key_integration import KeyIntegrationService

PROVIDERS = ("opensubtitles", "subdl")
# O mesmo formato amplo da TV na feature 090; o fornecedor decide o resto no teste da TV.
KEY_PATTERN = re.compile(r"[A-Za-z0-9._-]{8,200}")


class SubtitleKeyService:
    def __init__(self, auth: AuthService, crypto: PortalCrypto):
        self.auth = auth
        self.repository = auth.repository
        self.crypto = crypto
        self._services = {
            provider: KeyIntegrationService(
                auth, crypto, kind=f"subtitles-{provider}", cipher_label=f"subtitle-key:{provider}",
                key_pattern=KEY_PATTERN,
                reported=lambda integrations, name=provider: getattr(integrations.subtitles, name)
                if integrations.subtitles else None)
            for provider in PROVIDERS
        }

    def _for(self, provider: str) -> KeyIntegrationService:
        service = self._services.get(provider)
        if service is None:
            raise AuthError("invalid_input", 422)
        return service

    async def request(self, principal: Principal, provider: str, operation_id: str, action: str, key: str | None,
                      now: datetime) -> dict:
        """`set` (com chave) ou `remove` para UM fornecedor; substitui só a pendente dele."""
        result = await self._for(provider).request(principal, operation_id, action, key, now)
        return {"operationId": result["operationId"], "provider": provider, "action": result["action"],
                "state": result["state"]}

    async def view(self, principal: Principal, now: datetime) -> dict:
        """Estado por fornecedor para o navegador: pendência, último resultado e o que a TV informou. Nunca a chave."""
        return {provider: await self._services[provider].view(principal, now) for provider in PROVIDERS}

    async def pull(self, principal: Principal, now: datetime) -> dict:
        """Operações vivas desta TV (no máximo uma por fornecedor), em ordem estável. Só a própria TV as recebe."""
        operations = []
        for provider in PROVIDERS:
            operation = (await self._services[provider].pull(principal, now))["operation"]
            if operation is not None:
                operations.append({"provider": provider, **operation})
        return {"operations": operations}

    async def ack(self, principal: Principal, provider: str, operation_id: str, state: str, reason: str | None,
                  now: datetime) -> dict:
        """Resultado da TV para um fornecedor. Operação que não é a corrente dele é idempotente e não revela estado."""
        return await self._for(provider).ack(principal, operation_id, state, reason, now)
