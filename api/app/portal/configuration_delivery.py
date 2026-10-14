"""Entrega privada à TV; revalida epochs/fences após decifragem fora do CAS."""

import json
import re
from datetime import datetime, timedelta

from google.cloud.firestore_v1.base_query import FieldFilter
from google.cloud.firestore_v1.field_path import FieldPath

from app.portal.auth import AuthError, Principal
from app.portal.configurations import PENDING, ConfigurationService, operation_view
from app.portal.models import ConfigurationDocument, ConfigurationVersionDocument, OperationDocument
from app.portal.repositories.control import TransactionPlan, document_path


class ConfigurationDelivery:
    def __init__(self, configurations: ConfigurationService):
        self.configurations = configurations
        self.repository = configurations.repository
        self.auth = configurations.auth

    async def pull(self, principal: Principal, now: datetime) -> list[dict]:
        await self.configurations.expire_pending(principal.device_id, now)
        root = self.repository.client.collection("devices").document(principal.device_id)
        pending = root.collection("operations").where(filter=FieldFilter("state", "in", sorted(PENDING)))
        candidates = []
        for action, limit in (("delete", 20), ("create", 5), ("update", 5)):
            query = (root.collection("operations").where(filter=FieldFilter(
                "state", "in", sorted(PENDING | {"conflict"}))) if action == "delete" else pending
            ).where(filter=FieldFilter("action", "==", action)).limit(limit)
            candidates.extend([doc async for doc in query.stream(timeout=5, retry=None)])
        # Delete tem prioridade; create/update compartilham o limite de cinco.
        mutations = 0
        selected = []
        for row in candidates:
            operation = OperationDocument.model_validate(row.to_dict())
            if operation.action != "delete":
                if mutations >= 5:
                    continue
                mutations += 1
            selected.append((row.reference.path, operation))
        device_path = document_path("devices", principal.device_id)
        paths = {device_path}
        for path, item in selected:
            paths.add(path)
            paths.add(document_path("tombstones", item.source_id, device_id=principal.device_id))
            if item.config_version:
                paths.add(document_path("configurationVersions", item.config_version, device_id=principal.device_id))

        def authorize(rows):
            self.auth._same_principal(rows[device_path], principal)
            granted = []
            for path, preliminary in selected:
                if rows[path] is None:
                    continue
                item = OperationDocument.model_validate(rows[path])
                if item != preliminary or (item.state not in PENDING and not (item.action == "delete" and item.state == "conflict")):
                    continue
                if item.action == "delete":
                    # Delete definitivo continua entregável após recuperação/rotação.
                    granted.append((path, item, None))
                    continue
                fence = document_path("tombstones", item.source_id, device_id=principal.device_id)
                version_path = document_path("configurationVersions", item.config_version, device_id=principal.device_id)
                if item.auth_epoch != principal.auth_epoch or item.expires_at <= now or rows[fence] or not rows[version_path]:
                    continue
                version = ConfigurationVersionDocument.model_validate(rows[version_path])
                if version.source_id != item.source_id or version.reference_count < 1:
                    raise AuthError("service_unavailable", 503)
                granted.append((path, item, version))
            return TransactionPlan(granted)

        grants = await self.repository.transact(tuple(paths), authorize)
        bodies = {}
        for path, item, version in grants:
            body = {**operation_view(item), "deviceId": principal.device_id,
                    "authEpoch": principal.auth_epoch}
            if version:
                value = json.loads(self.configurations.crypto.decrypt(version.envelope,
                    self.configurations.context(principal.device_id, item.source_id, item.config_version)))
                if item.action == "update":
                    value.pop("type", None)
                body["input"] = value
            bodies[path] = body

        def mark_received(rows):
            self.auth._same_principal(rows[device_path], principal)
            output, puts = [], {}
            for path, item, version in grants:
                if rows[path] != item.model_dump(by_alias=True):
                    continue
                fence = document_path("tombstones", item.source_id, device_id=principal.device_id)
                if version:
                    version_path = document_path("configurationVersions", item.config_version, device_id=principal.device_id)
                    if rows[fence] or rows[version_path] != version.model_dump(by_alias=True):
                        continue
                updated = item.model_copy(update={
                    "state": item.state if item.state in {"awaiting_confirmation", "conflict"} else "received",
                    "lease_owner": principal.device_id, "lease_until": now + timedelta(seconds=60),
                })
                puts[path] = updated
                output.append({**bodies[path], "state": updated.state,
                               "leaseUntil": updated.lease_until.isoformat()})
            return TransactionPlan(output, puts)

        return await self.repository.transact(tuple(paths), mark_received)

    async def values(self, principal: Principal, source_id: str) -> dict | None:
        """Valores salvos da lista para o painel autenticado da MESMA TV (070/D-006, ADR-014).

        Decifra transitoriamente a versão corrente; devolve só a allowlist do tipo. `None` para fonte
        inexistente, excluída (tombstone) ou com ID malformado — nunca distingue o motivo.
        """
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", source_id):
            return None
        device_path = document_path("devices", principal.device_id)
        config_path = document_path("configurations", source_id, device_id=principal.device_id)
        fence_path = document_path("tombstones", source_id, device_id=principal.device_id)

        def read(rows):
            self.auth._same_principal(rows[device_path], principal)
            if rows[fence_path] is not None or rows[config_path] is None:
                return TransactionPlan(None)
            return TransactionPlan(ConfigurationDocument.model_validate(rows[config_path]))

        saved = await self.repository.transact((device_path, config_path, fence_path), read)
        if saved is None:
            return None
        value = json.loads(self.configurations.crypto.decrypt(
            saved.envelope, self.configurations.context(principal.device_id, source_id, saved.config_version)))
        keys = (("providerDns", "providerUsername", "providerPassword") if saved.type == "provider_credentials"
                else ("m3uUrl",)) + ("epgManualUrl", "epgOffsetHours", "epgDisabled")
        return {"type": saved.type, "displayName": saved.display_name,
                **{key: value[key] for key in keys if value.get(key) not in (None, "")}}

    async def public_rows(self, principal: Principal, collection: str, limit: int = 99,
                          after: str | None = None) -> list:
        if collection not in {"configurations", "operations"}:
            raise ValueError("invalid_collection")
        root = self.repository.client.collection("devices").document(principal.device_id)
        if not 1 <= limit <= 99:
            raise AuthError("invalid_input", 422)
        query = root.collection(collection).order_by(FieldPath.document_id()).limit(limit)
        if after is not None:
            document_path(collection, after, device_id=principal.device_id)
            query = query.start_after({FieldPath.document_id(): root.collection(collection).document(after)})
        candidates = [doc async for doc in query.stream(timeout=5, retry=None)]
        device_path = document_path("devices", principal.device_id)
        paths = (device_path, *(row.reference.path for row in candidates))

        def read(rows):
            self.auth._same_principal(rows[device_path], principal)
            return TransactionPlan([rows[path] for path in paths[1:] if rows[path] is not None])

        rows = await self.repository.transact(paths, read)
        if collection == "operations":
            return [operation_view(OperationDocument.model_validate(row)) for row in rows]
        return [{"sourceId": row["sourceId"], "type": row["type"], "displayName": row["displayName"],
                 "configVersion": row["configVersion"], "expectedRevision": row["expectedRevision"],
                 "appliedRevision": row["appliedRevision"], "operationId": row["activeOperationId"],
                 "updatedAt": row["updatedAt"].isoformat()} for row in rows]
