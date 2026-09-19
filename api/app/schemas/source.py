from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ProviderCredentialsIn(BaseModel):
    dns: str = Field(min_length=1)
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class CreateSourceRequest(BaseModel):
    """Corpo de POST /sources — FR-001, FR-002. Aceita as duas entradas
    (URL ou provedor) na mesma spec (ver Clarifications em spec.md)."""

    type: Literal["m3u_url", "provider_credentials"]
    display_name: str
    m3u_url: str | None = None
    provider: ProviderCredentialsIn | None = None
    request_key: str = Field(min_length=1)

    @model_validator(mode="after")
    def _validate_by_type(self) -> CreateSourceRequest:
        if not self.display_name.strip():
            raise ValueError("display_name não pode ser vazio.")
        if self.type == "m3u_url" and not self.m3u_url:
            raise ValueError("m3u_url é obrigatório quando type=m3u_url.")
        if self.type == "provider_credentials" and self.provider is None:
            raise ValueError("provider é obrigatório quando type=provider_credentials.")
        return self


class CreateSourceResponse(BaseModel):
    source_id: uuid.UUID
    import_job_id: uuid.UUID


class ProviderCredentialsPatch(BaseModel):
    """Corpo de PATCH /sources/{id} para o trecho de credenciais — cada
    campo é opcional; ausente/vazio significa "manter o valor atual", nunca
    "apagar". Diferente de ProviderCredentialsIn (POST), que exige os três."""

    dns: str | None = None
    username: str | None = None
    password: str | None = None


class UpdateSourceRequest(BaseModel):
    """Corpo de PATCH /sources/{id}. Atualização parcial: campo ausente ou
    vazio mantém o valor já gravado. Editar dns/username/password reabre a
    fonte para nova checagem de status na próxima abertura (a credencial
    mudou, então o resultado anterior de account status não vale mais)."""

    display_name: str | None = None
    m3u_url: str | None = None
    provider: ProviderCredentialsPatch | None = None


class SourceOut(BaseModel):
    """Nunca inclui provider_username nem provider_password (FR-014/
    constitution) — esses dois só existem em texto plano no banco e nunca
    saem dele. provider_dns é diferente: sozinho não autentica nada, e
    reexibi-lo (mesmo na listagem comum) é o que permite a tela de edição
    mostrar/corrigir o endereço sem obrigar o usuário a redigitar
    usuário/senha só para trocar um typo no host."""

    id: uuid.UUID
    type: Literal["m3u_url", "provider_credentials"]
    display_name: str
    connection_state: Literal["never_synced", "synced", "error"]
    last_successful_sync_at: datetime | None
    # `None` para fonte `m3u_url`, ou fonte de provedor ainda não migrada
    # pelo conector novo. `legacy_m3u` é o sinal para a Home indicar modo
    # limitado (FR-011) — estado normal, não erro (D-008).
    provider_import_mode: Literal["xtream_api", "legacy_m3u"] | None = None
    provider_dns: str | None = None


class SourceListResponse(BaseModel):
    sources: list[SourceOut]


class ResyncSourceResponse(BaseModel):
    source_id: uuid.UUID
    import_job_id: uuid.UUID


class OpenSourceResponse(BaseModel):
    """Resposta de `POST /sources/{id}/open` (D-004) — a TV só informa que
    abriu a fonte; o backend decidiu migrar, atualizar por idade, ou nada."""

    triggered: bool
    import_job_id: uuid.UUID | None
