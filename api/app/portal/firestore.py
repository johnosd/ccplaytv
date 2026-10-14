"""Cliente criado somente a partir de configuração já validada."""

import os

from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore_v1 import AsyncClient

from app.portal.settings import PortalSettings


def create_firestore_client(settings: PortalSettings) -> AsyncClient:
    # O SDK lê a variável global; validar novamente evita troca depois do bootstrap.
    if os.environ.get("FIRESTORE_EMULATOR_HOST") != settings.firestore_emulator_host:
        raise RuntimeError("firestore_environment_changed")
    credentials = AnonymousCredentials() if settings.firestore_emulator_host else None
    return AsyncClient(
        project=settings.project_id, database=settings.database_id, credentials=credentials
    )
