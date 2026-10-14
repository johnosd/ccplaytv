import json
import os

import pytest
from pydantic import SecretStr

from app.portal.auth_tokens import AuthTokens, TokenError, new_token, valid_token
from app.portal.crypto import b64encode
from app.portal.settings import PortalSettings


def test_random_tokens_canonical_and_purpose_separation():
    tokens = {new_token() for _ in range(100)}
    assert len(tokens) == 100
    assert all(valid_token(token) for token in tokens)
    token = tokens.pop()
    assert not valid_token(token + "=")
    assert not valid_token("a" * 42)
    auth = AuthTokens({"v1": b"i" * 32}, "v1")
    hashes = {auth.digest(purpose, token) for purpose in (
        "identity", "tv_bearer", "device_key", "invite", "session", "csrf", "rate_limit", "enrollment", "issuance_claim",
    )}
    assert len(hashes) == 9
    assert auth.matches("tv_bearer", token, auth.digest("tv_bearer", token))
    assert not auth.matches("device_key", token, auth.digest("tv_bearer", token))
    assert token not in repr(auth)
    with pytest.raises(TokenError, match="^invalid_auth_material$"):
        auth.digest("unknown", token)


def test_rotation_keeps_old_identity_lookup_and_credentials_without_rehashing_duid():
    old = AuthTokens({"v1": b"a" * 32}, "v1")
    rotated = AuthTokens({"v1": b"a" * 32, "v2": b"b" * 32}, "v2")
    identity = "fixture-platform-identity"
    assert old.digest("identity", identity) in rotated.candidates("identity", identity)
    assert rotated.digest("identity", identity) != old.digest("identity", identity)
    token = new_token()
    assert rotated.matches("session", token, old.digest("session", token))
    assert not rotated.matches("session", new_token(), old.digest("session", token))


def test_settings_fail_closed_and_no_input_in_errors(monkeypatch):
    for name in list(os.environ):
        if name.startswith("CCPLAY_PORTAL_"):
            monkeypatch.delenv(name)
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8085")
    active = b64encode(b"a" * 32)
    settings = PortalSettings(environment="test", identity_hmac_key=SecretStr(active),
                              identity_hmac_previous_keys=SecretStr(json.dumps({
                                  "old": b64encode(b"b" * 32),
                              })))
    assert len(AuthTokens.from_settings(settings).keys) == 2
    for change in (
        {"identity_hmac_key": SecretStr("private-invalid-fixture")},
        {"recovery_hmac_key": SecretStr(active)},
        {"identity_hmac_previous_keys": SecretStr('{"old":"a","old":"b"}')},
        {"identity_hmac_previous_keys": SecretStr(json.dumps({"v1": active}))},
    ):
        with pytest.raises(TokenError) as error:
            AuthTokens.from_settings(settings.model_copy(update=change))
        assert str(error.value) == "invalid_auth_material"


def test_auth_error_never_exposes_unregistered_message():
    from app.portal.auth import AuthError

    error = AuthError("fixture-private-error", 500)
    assert error.code == "unauthorized"
    assert str(error) == "unauthorized"
    assert error.status == 401


def test_production_cookie_is_secure_and_token_stays_out_of_json():
    from datetime import UTC, datetime
    from types import SimpleNamespace

    from starlette.requests import Request

    from app.portal.auth import Principal, SessionIssuance
    from app.portal.routes.auth import issuance_response

    token = new_token()
    issuance = SessionIssuance(token, new_token(), Principal("device-a", 1, new_token()),
                                datetime.now(UTC))
    app = SimpleNamespace(state=SimpleNamespace(portal_settings=SimpleNamespace(
        environment="production",
    )))
    request = Request({"type": "http", "app": app, "headers": []})
    response = issuance_response(issuance, request)
    cookie = response.headers["set-cookie"]
    assert "; Secure" in cookie and "; HttpOnly" in cookie and "SameSite=strict" in cookie
    assert token.encode() not in response.body
