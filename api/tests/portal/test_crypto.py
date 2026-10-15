import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import SecretStr

from app.portal.crypto import CipherContext, CryptoError, PortalCrypto, b64decode, b64encode
from app.portal.settings import PortalSettings


def make_crypto(version="v1", previous=None):
    key = ec.generate_private_key(ec.SECP256R1())
    crypto = PortalCrypto({version: bytes([int(version[-1])]) * 32}, version, key, version, {
        version: key.public_key()
    })
    if previous:
        crypto.aes_keys.update(previous.aes_keys)
        crypto.verification_keys.update(previous.verification_keys)
    return crypto


def test_cipher_nonce_tamper_and_destination_binding():
    crypto = make_crypto()
    context = CipherContext("tv-a", "source-a", "config-a")
    plaintext = b"fake-private-provider-password"
    first, second = crypto.encrypt(plaintext, context), crypto.encrypt(plaintext, context)
    assert first.nonce != second.nonce
    assert crypto.decrypt(first, context) == plaintext
    assert "fake-private" not in repr(first)
    assert "fake-private" not in repr(crypto)
    for changed in (
        CipherContext("tv-b", "source-a", "config-a"),
        CipherContext("tv-a", "source-b", "config-a"),
        CipherContext("tv-a", "source-a", "config-b"),
    ):
        with pytest.raises(CryptoError, match="^invalid_crypto_envelope$"):
            crypto.decrypt(first, changed)
    for patch in ({"ciphertext": "AAAA"}, {"nonce": "AAAA"}, {"key_version": "missing"}):
        with pytest.raises(CryptoError):
            crypto.decrypt(first.model_copy(update=patch), context)


def test_rotation_keeps_old_cipher_and_signatures_and_only_exports_public_keys():
    old = make_crypto()
    context = CipherContext("tv-a", "source-a", "config-a")
    envelope = old.encrypt(b"fake-private", context)
    claims = {"iss": "issuer", "aud": "tv", "deviceId": "tv-a", "generation": 3}
    token = old.sign(claims)
    current = make_crypto("v2", old)
    assert current.decrypt(envelope, context) == b"fake-private"
    assert current.encrypt(b"fake-private", context).key_version == "v2"
    assert current.verify(token, issuer="issuer", audience="tv", device_id="tv-a") == claims
    keys = current.public_jwks()["keys"]
    assert {key["kid"] for key in keys} == {"v1", "v2"}
    assert all(set(key) == {"kty", "crv", "alg", "use", "kid", "x", "y"} for key in keys)


def test_es256_raw_signature_rejects_tamper_wrong_device_and_algorithm():
    crypto = make_crypto()
    claims = {"iss": "issuer", "aud": "tv", "deviceId": "tv-a"}
    token = crypto.sign(claims)
    assert len(b64decode(token.split(".")[2])) == 64
    assert crypto.verify(token, issuer="issuer", audience="tv", device_id="tv-a") == claims
    header, payload, signature = token.split(".")
    tampered_payload = b64encode(json.dumps({**claims, "deviceId": "tv-b"}).encode())
    none_header = b64encode(json.dumps({"alg": "none", "typ": "JWT", "kid": "v1"}).encode())
    for invalid in (
        "invalid", f"{header}.{tampered_payload}.{signature}",
        f"{none_header}.{payload}.{signature}", f"{header}.{payload}.AAAA",
    ):
        with pytest.raises(CryptoError, match="^invalid_crypto_envelope$"):
            crypto.verify(invalid, issuer="issuer", audience="tv", device_id="tv-a")
    for overrides in ({"device_id": "tv-b"}, {"issuer": "other"}, {"audience": "other"}):
        with pytest.raises(CryptoError):
            crypto.verify(token, **{"issuer": "issuer", "audience": "tv", "device_id": "tv-a",
                                    **overrides})


def test_private_environment_keys_have_explicit_versions_and_fail_closed():
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption()).decode()
    settings = PortalSettings(
        environment="test", FIRESTORE_EMULATOR_HOST="127.0.0.1:8085",
        aes_key=SecretStr(b64encode(b"x" * 32)), signing_key=SecretStr(pem),
        aes_key_version="v2", signing_kid="sign2",
        aes_previous_keys=SecretStr(json.dumps({"v1": b64encode(b"y" * 32)})),
    )
    crypto = PortalCrypto.from_settings(settings)
    assert crypto.active_aes_version == "v2"
    assert set(crypto.aes_keys) == {"v1", "v2"}
    assert crypto.public_jwks()["keys"][0]["kid"] == "sign2"
    with pytest.raises(CryptoError):
        PortalCrypto.from_settings(settings.model_copy(update={"aes_key": SecretStr("bad")}))
