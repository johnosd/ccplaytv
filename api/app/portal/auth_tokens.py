"""Segredos aleatórios e hashes separados por finalidade; nenhum dado bruto persistido."""

import hashlib
import hmac
import json
import re
import secrets
from dataclasses import dataclass, field
from typing import Literal

from app.portal.crypto import CryptoError, b64decode, b64encode, canonical_json
from app.portal.settings import PortalSettings

Purpose = Literal[
    "identity", "tv_bearer", "device_key", "invite", "session", "csrf", "rate_limit", "enrollment", "issuance_claim", "recovery_request", "recovery_session", "display_id",
    "display_id_derived",
]
PURPOSES = {"identity", "tv_bearer", "device_key", "invite", "session", "csrf", "rate_limit", "enrollment", "issuance_claim", "recovery_request", "recovery_session", "display_id",
            "display_id_derived"}


class TokenError(ValueError):
    def __init__(self):
        super().__init__("invalid_auth_material")


def new_token() -> str:
    return b64encode(secrets.token_bytes(32))


def valid_token(token: str) -> bool:
    if not isinstance(token, str) or len(token) != 43:
        return False
    try:
        return len(b64decode(token)) == 32
    except CryptoError:
        return False


def _unique_keys(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise TokenError()
        result[name] = value
    return result


@dataclass(frozen=True, repr=False)
class AuthTokens:
    keys: dict[str, bytes] = field(repr=False)
    active_version: str

    def __post_init__(self):
        if (not 1 <= len(self.keys) <= 5 or self.active_version not in self.keys
                or any(not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", version)
                       or not isinstance(key, bytes) or len(key) != 32
                       for version, key in self.keys.items())):
            raise TokenError()
        # Desacoplar a configuração mutável do chamador.
        object.__setattr__(self, "keys", self.keys.copy())

    @classmethod
    def from_settings(cls, settings: PortalSettings) -> "AuthTokens":
        try:
            if settings.identity_hmac_key is None:
                raise TokenError()
            previous = json.loads(settings.identity_hmac_previous_keys.get_secret_value(),
                                  object_pairs_hook=_unique_keys) if (
                settings.identity_hmac_previous_keys
            ) else {}
            if not isinstance(previous, dict) or settings.identity_hmac_version in previous:
                raise TokenError()
            keys = {version: b64decode(value) for version, value in previous.items()}
            keys[settings.identity_hmac_version] = b64decode(
                settings.identity_hmac_key.get_secret_value()
            )
            if settings.recovery_hmac_key and hmac.compare_digest(
                settings.identity_hmac_key.get_secret_value(),
                settings.recovery_hmac_key.get_secret_value(),
            ):
                raise TokenError()
            return cls(keys, settings.identity_hmac_version)
        except (ValueError, TypeError, AttributeError):
            raise TokenError() from None

    def digest(self, purpose: Purpose, value: str, *, version: str | None = None) -> str:
        version = self.active_version if version is None else version
        if (purpose not in PURPOSES or version not in self.keys or not isinstance(value, str)
                or not 1 <= len(value) <= 1024 or any(ord(c) < 32 for c in value)):
            raise TokenError()
        message = canonical_json({"domain": "ccplay-portal-auth-v1", "purpose": purpose,
                                  "version": version, "value": value})
        return hmac.new(self.keys[version], message, hashlib.sha256).hexdigest()

    def candidates(self, purpose: Purpose, value: str) -> tuple[str, ...]:
        # Identidade antiga precisa ser consultada antes de criar novo trial na rotação.
        return tuple(self.digest(purpose, value, version=version) for version in self.keys)

    def matches(self, purpose: Purpose, value: str, stored_hash: str) -> bool:
        candidates = self.candidates(purpose, value)
        matched = False
        for candidate in candidates:
            matched |= hmac.compare_digest(candidate, stored_hash)
        return matched
