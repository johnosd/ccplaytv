"""ID do dispositivo no formato MAC e chave numérica (feature 070, ADR-014, logic/pareamento.md).

O ID exibido não é segredo nem autentica sozinho; a chave de 10 dígitos só é guardada como HMAC.
"""

import re
import secrets

from app.portal.auth_tokens import AuthTokens
from app.portal.repositories.control import document_path

DISPLAY_ID_PATTERN = re.compile(r"^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$")
DEVICE_KEY_PATTERN = re.compile(r"^\d{10}$")
GENERATED_CANDIDATES = 5  # derivados por TV: o 1º livre vence; os demais só cobrem colisão improvável


def normalize_mac(raw: object) -> str | None:
    """MAC útil em `XX:XX:XX:XX:XX:XX`; inválido, zerado, broadcast ou multicast → None."""
    if not isinstance(raw, str):
        return None
    hexa = re.sub(r"[:.\-]", "", raw.strip()).upper()
    if not re.fullmatch(r"[0-9A-F]{12}", hexa) or hexa in {"0" * 12, "F" * 12}:
        return None
    if int(hexa[:2], 16) & 0x01:
        return None
    return ":".join(hexa[i:i + 2] for i in range(0, 12, 2))


def derived_display_id(tokens: AuthTokens, identity_hmac: str, attempt: int = 0) -> str:
    """ADR-015: ID determinístico da TV a partir do HMAC de identidade (nunca o DUID bruto).

    Localmente administrado (bit 0x02) e unicast: nunca colide com MAC de fabricante. `attempt` só
    sobe quando o candidato anterior já pertence a outra TV, então continua reproduzível.
    """
    digest = tokens.digest("display_id_derived", f"{identity_hmac}:{attempt}")
    octets = bytearray(bytes.fromhex(digest[:12]))
    octets[0] = (octets[0] | 0x02) & 0xFE
    return ":".join(f"{octet:02X}" for octet in octets)


def display_candidates(tokens: AuthTokens, mac: object, identity_hmac: str) -> list[tuple[str, str]]:
    """Ordem de preferência: MAC útil, depois IDs derivados da identidade. Sem sorteio (ADR-015)."""
    normalized = normalize_mac(mac)
    derived = [(derived_display_id(tokens, identity_hmac, attempt), "derived")
               for attempt in range(GENERATED_CANDIDATES)]
    return ([(normalized, "mac")] if normalized else []) + derived


def display_claim_path(tokens: AuthTokens, display_id: str) -> str:
    return document_path("displayIdClaims", tokens.digest("display_id", display_id))


async def pick_display_id(repository, tokens: AuthTokens, identity_hmac: str, mac: object = None,
                          owner: str | None = None) -> tuple[str, str, str]:
    """Pré-leitura dos claims para escolher o 1º candidato livre (ou já do `owner`).

    O envelope de credenciais é cifrado antes da transação, então a escolha acontece aqui; a transação
    DEVE reler o claim devolvido e recusar (`try_again`) se outro dispositivo o tomou nesse intervalo.
    Só é chamado quando o aparelho ainda não tem ID: depois disso o ID é imutável (ADR-015).
    """
    candidates = display_candidates(tokens, mac, identity_hmac)
    paths = [display_claim_path(tokens, value) for value, _ in candidates]
    taken: dict[str, str] = {}
    async for snapshot in repository.client.get_all([repository.client.document(path) for path in paths]):
        if snapshot.exists:
            taken[snapshot.reference.path] = (snapshot.to_dict() or {}).get("deviceId", "")
    for (value, source), path in zip(candidates, paths, strict=True):
        if path not in taken or (owner is not None and taken[path] == owner):
            return value, source, path
    raise RuntimeError("display_id_exhausted")


def new_device_key() -> str:
    return f"{secrets.randbelow(10 ** 10):010d}"


def valid_device_key(value: object) -> bool:
    return isinstance(value, str) and DEVICE_KEY_PATTERN.fullmatch(value) is not None


def normalize_display_id(value: object) -> str | None:
    """Entrada digitada no painel: aceita minúsculas, hífens e sem separador; nunca levanta."""
    normalized = normalize_mac(value) if isinstance(value, str) else None
    if normalized is None and isinstance(value, str):
        candidate = value.strip().upper().replace("-", ":")
        normalized = candidate if DISPLAY_ID_PATTERN.fullmatch(candidate) else None
    return normalized
