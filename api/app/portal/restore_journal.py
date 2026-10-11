"""Leitura fail-closed do journal antes do replay de uma restauração isolada."""

import hmac
import json

from app.portal.recovery_journal import JournalError, JournalEvent


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
