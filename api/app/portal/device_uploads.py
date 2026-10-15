"""Envio TV → site (feature 071, D-009/D-014): a TV é a fonte da verdade da lista que ela mesma criou ou editou.

Reaproveita a cifra, a versão imutável e o CAS da `ConfigurationService`, mas NÃO cria operação pendente: o
valor gravado já nasce aplicado (`applied_revision = revision`), sem prazo de 7 dias e sem contar nos 5 pendentes.
Nada daqui entra em log, erro, cabeçalho ou cache (constitution 1.11.0 (d)); só o ciphertext é persistido.
"""

import hashlib
from datetime import datetime

from app.portal.auth import AuthError, Principal
from app.portal.auth_tokens import new_token
from app.portal.configuration_input import ConfigurationPatch, merge_configuration
from app.portal.configurations import ConfigurationService
from app.portal.crypto import canonical_json
from app.portal.models import ConfigurationDocument, ConfigurationVersionDocument
from app.portal.repositories.control import TransactionPlan, document_path

UploadState = str  # "stored" | "unchanged" | "conflict" | "gone" | "invalid"


class DeviceSourceUploads:
    def __init__(self, configurations: ConfigurationService):
        self.configurations = configurations
        self.auth = configurations.auth
        self.repository = configurations.repository
        self.crypto = configurations.crypto

    async def upload(self, principal: Principal, *, source_id: str, revision: int,
                     patch: ConfigurationPatch, now: datetime) -> UploadState:
        # Digest do pedido: o mesmo conteúdo na mesma revisão é idempotente (reenvio após resposta perdida).
        digest = hashlib.sha256(canonical_json({"sourceId": source_id, "revision": revision,
                                                "input": patch.private_values()})).hexdigest()
        device_path = document_path("devices", principal.device_id)
        config_path = document_path("configurations", source_id, device_id=principal.device_id)
        fence_path = document_path("tombstones", source_id, device_id=principal.device_id)
        first = await self.repository.client.document(config_path).get(timeout=5, retry=None)
        previous = ConfigurationDocument.model_validate(first.to_dict()) if first.exists else None
        if previous is not None and previous.active_operation_id is not None:
            # Edição do portal ainda a caminho da TV: nunca sobrescrever em silêncio (069 CAS).
            return "conflict"
        try:
            merged = merge_configuration(None, patch, "create")
        except AuthError:
            return "invalid"
        version_id = new_token()
        envelope = self.crypto.encrypt(canonical_json(merged), self.configurations.context(
            principal.device_id, source_id, version_id))
        version_path = document_path("configurationVersions", version_id, device_id=principal.device_id)
        old_version_path = document_path("configurationVersions", previous.config_version,
                                         device_id=principal.device_id) if previous else None
        config = ConfigurationDocument(
            source_id=source_id, type=merged["type"], display_name=merged["displayName"],
            config_version=version_id, active_operation_id=None, expected_revision=revision,
            applied_revision=revision, envelope=envelope, upload_digest=digest,
            created_at=previous.created_at if previous else now, updated_at=now)
        version = ConfigurationVersionDocument(source_id=source_id, config_version=version_id,
                                               envelope=envelope, reference_count=0, created_at=now)

        def write(rows):
            self.auth._same_principal(rows[device_path], principal)
            if rows[fence_path] is not None:
                return TransactionPlan("gone")
            current = ConfigurationDocument.model_validate(rows[config_path]) if rows[config_path] else None
            if current is not None and current.upload_digest == digest:
                return TransactionPlan("unchanged")
            if current != previous or rows[version_path] is not None:
                raise AuthError("try_again", 409)
            if current is not None and current.active_operation_id is not None:
                return TransactionPlan("conflict")
            deletes = ()
            if old_version_path and rows[old_version_path]:
                old = ConfigurationVersionDocument.model_validate(rows[old_version_path])
                if old.reference_count == 0:
                    deletes = (old_version_path,)
            return TransactionPlan("stored", {config_path: config, version_path: version}, deletes)

        paths = (device_path, config_path, fence_path, version_path)
        if old_version_path:
            paths += (old_version_path,)
        return await self.repository.transact(paths, write)
