"""Código privado de 128 bits, Base32 legível/checksum e verificador HMAC versionado."""

import hashlib
import hmac
import json
import re
import secrets
from dataclasses import dataclass, field

from app.portal.crypto import b64decode, canonical_json
from app.portal.settings import PortalSettings

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


class RecoveryCodeError(ValueError):
    def __init__(self):
        super().__init__("invalid_recovery_code")


def _encode(value: int, length: int) -> str:
    result = ""
    for _ in range(length):
        result = ALPHABET[value & 31] + result
        value >>= 5
    if value:
        raise RecoveryCodeError()
    return result


def _checksum(raw: bytes) -> str:
    digest = hashlib.sha256(b"ccplay-recovery-checksum-v1/" + raw).digest()
    return _encode(int.from_bytes(digest[:2], "big") & 1023, 2)


def new_recovery_code() -> str:
    raw = secrets.token_bytes(16)
    code = _encode(int.from_bytes(raw, "big"), 26) + _checksum(raw)
    return "-".join(code[index:index + 4] for index in range(0, 28, 4))


def normalize_recovery_code(value: str) -> str:
    if (not isinstance(value, str) or len(value) > 64
            or not re.fullmatch(r"[0-9A-Za-z -]+", value)):
        raise RecoveryCodeError()
    compact = value.upper().replace("-", "").replace(" ", "")
    compact = compact.translate(str.maketrans({"O": "0", "I": "1", "L": "1"}))
    if len(compact) != 28 or any(char not in ALPHABET for char in compact):
        raise RecoveryCodeError()
    number = 0
    for char in compact[:26]:
        number = (number << 5) | ALPHABET.index(char)
    if number >= 1 << 128:
        raise RecoveryCodeError()
    if not hmac.compare_digest(_checksum(number.to_bytes(16, "big")), compact[26:]):
        raise RecoveryCodeError()
    return compact


def _unique_keys(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise RecoveryCodeError()
        result[name] = value
    return result


@dataclass(frozen=True, repr=False)
class RecoveryCodes:
    keys: dict[str, bytes] = field(repr=False)
    active_version: str

    def __post_init__(self):
        if (not 1 <= len(self.keys) <= 5 or self.active_version not in self.keys
                or any(not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", version)
                       or not isinstance(key, bytes) or len(key) != 32
                       for version, key in self.keys.items())):
            raise RecoveryCodeError()
        object.__setattr__(self, "keys", self.keys.copy())

    @classmethod
    def from_settings(cls, settings: PortalSettings) -> "RecoveryCodes":
        try:
            if settings.recovery_hmac_key is None:
                raise RecoveryCodeError()
            previous = json.loads(settings.recovery_hmac_previous_keys.get_secret_value(),
                                  object_pairs_hook=_unique_keys) if (
                settings.recovery_hmac_previous_keys
            ) else {}
            if not isinstance(previous, dict) or settings.recovery_hmac_version in previous:
                raise RecoveryCodeError()
            keys = {version: b64decode(value) for version, value in previous.items()}
            keys[settings.recovery_hmac_version] = b64decode(
                settings.recovery_hmac_key.get_secret_value()
            )
            if settings.identity_hmac_key and hmac.compare_digest(
                settings.recovery_hmac_key.get_secret_value(),
                settings.identity_hmac_key.get_secret_value(),
            ):
                raise RecoveryCodeError()
            return cls(keys, settings.recovery_hmac_version)
        except (ValueError, TypeError, AttributeError):
            raise RecoveryCodeError() from None

    def digest(self, code: str, *, version: str | None = None) -> str:
        version = self.active_version if version is None else version
        if version not in self.keys:
            raise RecoveryCodeError()
        normalized = normalize_recovery_code(code)
        message = canonical_json({"domain": "ccplay-portal-recovery-v1", "version": version,
                                  "code": normalized})
        return hmac.new(self.keys[version], message, hashlib.sha256).hexdigest()

    def candidates(self, code: str) -> tuple[tuple[str, str], ...]:
        return tuple((version, self.digest(code, version=version)) for version in self.keys)
