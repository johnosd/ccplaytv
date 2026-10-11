import json

import pytest
from pydantic import SecretStr

from app.portal.crypto import b64encode
from app.portal.recovery_codes import (
    ALPHABET,
    RecoveryCodeError,
    RecoveryCodes,
    new_recovery_code,
    normalize_recovery_code,
)
from app.portal.settings import PortalSettings


def test_128bit_codes_checksum_and_readable_normalization():
    codes = {new_recovery_code() for _ in range(100)}
    assert len(codes) == 100
    for code in codes:
        compact = normalize_recovery_code(code)
        assert len(compact) == 28
        assert len(code.split("-")) == 7
        assert normalize_recovery_code(code.lower().replace("-", " ")) == compact
        assert normalize_recovery_code(compact.replace("0", "O").replace("1", "l")) == compact
        # Toda substituição de um dos símbolos de checksum é recusada.
        for char in ALPHABET:
            if char != compact[-1]:
                with pytest.raises(RecoveryCodeError):
                    normalize_recovery_code(compact[:-1] + char)
    for invalid in ("", "7" * 27, "Z" * 28, "0" * 65, "0" * 27 + "\n"):
        with pytest.raises(RecoveryCodeError, match="^invalid_recovery_code$"):
            normalize_recovery_code(invalid)


def test_versioned_hmac_never_accepts_hash_as_code_and_supports_rotation():
    code = new_recovery_code()
    old = RecoveryCodes({"old": b"a" * 32}, "old")
    new = RecoveryCodes({"old": b"a" * 32, "new": b"b" * 32}, "new")
    assert ("old", old.digest(code)) in new.candidates(code)
    assert old.digest(code) != new.digest(code)
    assert code not in repr(new)
    with pytest.raises(RecoveryCodeError):
        new.digest(old.digest(code))
    with pytest.raises(RecoveryCodeError):
        new.digest(code, version="missing")


def test_private_config_fail_closed_and_rejects_shared_identity_key(monkeypatch):
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8085")
    key = b64encode(b"r" * 32)
    settings = PortalSettings(environment="test", recovery_hmac_key=SecretStr(key),
                              recovery_hmac_previous_keys=SecretStr(json.dumps({
                                  "old": b64encode(b"o" * 32),
                              })))
    assert len(RecoveryCodes.from_settings(settings).keys) == 2
    for change in ({"identity_hmac_key": SecretStr(key)},
                   {"recovery_hmac_key": SecretStr("invalid-private-fixture")},
                   {"recovery_hmac_previous_keys": SecretStr('{"x":"a","x":"b"}')}):
        with pytest.raises(RecoveryCodeError) as error:
            RecoveryCodes.from_settings(settings.model_copy(update=change))
        assert str(error.value) == "invalid_recovery_code"
