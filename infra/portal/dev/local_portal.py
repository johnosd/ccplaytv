"""Launcher local do portal — SOMENTE desenvolvimento.

Troca o journal do Cloud Storage por um journal em memória (os testes da API fazem o mesmo), para que a
pilha HTTP completa rode contra o emulador do Firestore sem bucket. Não é evidência de durabilidade,
backup, IAM ou restore (T039/T052 exigem a nuvem real). Recusa qualquer ambiente que não seja local.

Uso (cwd qualquer; variáveis CCPLAY_PORTAL_* como em infra/portal/README.md):
    api/.venv/Scripts/python.exe infra/portal/dev/local_portal.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "api"))

import uvicorn
from app.portal.application import create_app
from app.portal.recovery_journal import MemoryJournal
from app.portal.routes import auth as auth_routes
from app.portal.settings import PortalSettings

settings = PortalSettings()
if settings.environment not in {"development", "test"} or not settings.firestore_emulator_host:
    raise SystemExit("local_portal_requires_local_environment_and_emulator")

# access_service() instancia CloudStorageJournal no primeiro uso; aqui vira memória (somente local).
auth_routes.CloudStorageJournal = lambda _settings: MemoryJournal(environment="test")

app = create_app(settings)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=settings.port, access_log=False)
