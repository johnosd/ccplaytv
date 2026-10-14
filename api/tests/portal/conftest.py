import os

import pytest

from app.portal.firestore import create_firestore_client
from app.portal.repositories.control import ControlRepository
from app.portal.settings import PortalSettings


@pytest.fixture
async def control(monkeypatch):
    if os.environ.get("PORTAL_TEST_FIRESTORE") != "1":
        pytest.skip("requer PORTAL_TEST_FIRESTORE=1 e emulator local explícito")
    for key in list(os.environ):
        if key.startswith("CCPLAY_PORTAL_"):
            monkeypatch.delenv(key)
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8085")
    client = create_firestore_client(PortalSettings(environment="test"))
    paths = []
    yield ControlRepository(client), paths
    # Apenas documentos fictícios registrados pelo próprio teste, nunca limpar a base inteira.
    for path in paths:
        await client.document(path).delete()
    client.close()
