"""Leitura fail-closed do journal antes do replay de uma restauração isolada."""

import hmac
import json
from collections.abc import Iterable, Iterator

from google.api_core.exceptions import GoogleAPIError
from google.api_core.retry import Retry
from google.cloud import storage

from app.portal.recovery_journal import JournalError, JournalEvent
from app.portal.settings import PortalSettings


def decode_journal_object(object_id: str, content: bytes) -> JournalEvent:
    """Digest não autentica o autor: origem/IAM e imutabilidade são gates separados.

    Aceita somente a representação canônica emitida pelo writer. Isso também
    recusa campos desconhecidos, chaves JSON repetidas e aliases alternativos.
    Não escreve no banco nem constitui uma autorização para reabrir tráfego.
    """
    try:
        if not isinstance(content, bytes) or not 0 < len(content) <= 8192:
            raise ValueError()
        value = json.loads(content)
        if not isinstance(value, dict) or not isinstance(value.pop("digest", None), str):
            raise TypeError()
        event = JournalEvent.model_validate_json(json.dumps(value))
        if object_id != event.object_id or not hmac.compare_digest(event.content(), content):
            raise ValueError()
        return event
    except (ValueError, TypeError, RecursionError):
        raise JournalError("invalid_restore_journal") from None

def load_events(objects: Iterable[tuple[str, bytes]]) -> list[JournalEvent]:
    """Fail-closed: um objeto inválido bloqueia o replay inteiro (journal incompleto não reabre tráfego)."""
    return [decode_journal_object(name, content) for name, content in objects]


class CloudStorageJournalReader:
    """Somente leitura (list/get): o runtime da aplicação nunca ganha overwrite/delete no journal."""

    def __init__(self, settings: PortalSettings):
        if settings.environment not in {"staging", "production"} or not settings.journal_bucket:
            raise JournalError("cloud_journal_configuration_required")
        self._bucket = storage.Client(project=settings.project_id).bucket(settings.journal_bucket)

    def objects(self) -> Iterator[tuple[str, bytes]]:
        try:
            for blob in self._bucket.list_blobs(prefix="events/", timeout=10):
                yield blob.name, blob.download_as_bytes(
                    start=0, end=8192, timeout=10, retry=Retry(initial=0.2, maximum=1, deadline=10))
        except GoogleAPIError:
            raise JournalError("journal_unavailable") from None
