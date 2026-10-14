"""Cifragem autenticada e JWS ES256; valores privados nunca entram em repr/erros."""

import base64
import json
import re
import secrets
from dataclasses import dataclass, field

from cryptography.exceptions import InvalidSignature, InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic import BaseModel, ConfigDict, Field

from app.portal.settings import PortalSettings


class CryptoError(ValueError):
    def __init__(self):
        super().__init__("invalid_crypto_envelope")


def b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def b64decode(value: str) -> bytes:
    if not value or len(value) > 100_000 or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise CryptoError()
    try:
        decoded = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
        if b64encode(decoded) != value:
            raise CryptoError()
        return decoded
    except ValueError:
        raise CryptoError() from None


def canonical_json(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def _unique_object(pairs: list[tuple]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise CryptoError()
        result[key] = value
    return result


@dataclass(frozen=True)
class CipherContext:
    device_id: str
    source_id: str
    config_version: str

    def aad(self, key_version: str) -> bytes:
        return canonical_json({
            "deviceId": self.device_id, "sourceId": self.source_id,
            "configVersion": self.config_version, "keyVersion": key_version,
        })


class CipherEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)
    key_version: str = Field(min_length=1, max_length=80)
    nonce: str = Field(repr=False)
    ciphertext: str = Field(repr=False)


@dataclass(repr=False)
class PortalCrypto:
    aes_keys: dict[str, bytes] = field(repr=False)
    active_aes_version: str
    signing_key: ec.EllipticCurvePrivateKey = field(repr=False)
    active_signing_kid: str
    verification_keys: dict[str, ec.EllipticCurvePublicKey] = field(repr=False)

    @classmethod
    def from_settings(cls, settings: PortalSettings) -> "PortalCrypto":
        try:
            if settings.aes_key is None or settings.signing_key is None:
                raise CryptoError()
            aes_keys = {}
            if settings.aes_previous_keys:
                previous = json.loads(settings.aes_previous_keys.get_secret_value())
                aes_keys = {version: b64decode(value) for version, value in previous.items()}
            if settings.aes_key_version in aes_keys:
                raise CryptoError()
            aes_keys[settings.aes_key_version] = b64decode(settings.aes_key.get_secret_value())
            signing_key = load_signing_key(settings.signing_key.get_secret_value().encode())
            public_keys = {}
            if settings.signing_previous_public_keys:
                previous = json.loads(settings.signing_previous_public_keys.get_secret_value())
                for kid, pem in previous.items():
                    key = serialization.load_pem_public_key(pem.encode())
                    if not isinstance(key, ec.EllipticCurvePublicKey):
                        raise CryptoError()
                    public_keys[kid] = key
            if settings.signing_kid in public_keys:
                raise CryptoError()
            public_keys[settings.signing_kid] = signing_key.public_key()
            return cls(aes_keys, settings.aes_key_version, signing_key, settings.signing_kid, public_keys)
        except (ValueError, TypeError, AttributeError):
            raise CryptoError() from None

    def __post_init__(self):
        versions = [*self.aes_keys, *self.verification_keys]
        if any(not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", version) for version in versions):
            raise CryptoError()
        if self.active_aes_version not in self.aes_keys or any(
            len(key) != 32 for key in self.aes_keys.values()
        ):
            raise CryptoError()
        if not isinstance(self.signing_key.curve, ec.SECP256R1):
            raise CryptoError()
        if self.active_signing_kid not in self.verification_keys or any(
            not isinstance(key.curve, ec.SECP256R1) for key in self.verification_keys.values()
        ):
            raise CryptoError()
        if self.signing_key.public_key().public_numbers() != self.verification_keys[
            self.active_signing_kid
        ].public_numbers():
            raise CryptoError()

    def encrypt(self, plaintext: bytes, context: CipherContext) -> CipherEnvelope:
        if len(plaintext) > 65_536:
            raise CryptoError()
        nonce = secrets.token_bytes(12)
        version = self.active_aes_version
        ciphertext = AESGCM(self.aes_keys[version]).encrypt(nonce, plaintext, context.aad(version))
        return CipherEnvelope(
            key_version=version, nonce=b64encode(nonce), ciphertext=b64encode(ciphertext)
        )

    def decrypt(self, envelope: CipherEnvelope, context: CipherContext) -> bytes:
        try:
            nonce = b64decode(envelope.nonce)
            ciphertext = b64decode(envelope.ciphertext)
            if len(nonce) != 12 or len(ciphertext) > 65_552:
                raise CryptoError()
            return AESGCM(self.aes_keys[envelope.key_version]).decrypt(
                nonce, ciphertext, context.aad(envelope.key_version)
            )
        except (InvalidTag, ValueError, KeyError):
            raise CryptoError() from None

    def sign(self, claims: dict) -> str:
        header = {"alg": "ES256", "typ": "JWT", "kid": self.active_signing_kid}
        signing_input = b64encode(canonical_json(header)) + "." + b64encode(canonical_json(claims))
        signature = self.signing_key.sign(signing_input.encode(), ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(signature)
        return signing_input + "." + b64encode(r.to_bytes(32, "big") + s.to_bytes(32, "big"))

    def verify(self, token: str, *, issuer: str, audience: str, device_id: str) -> dict:
        try:
            if len(token) > 16_384:
                raise CryptoError()
            header_part, claims_part, signature_part = token.split(".")
            header = json.loads(b64decode(header_part), object_pairs_hook=_unique_object)
            if set(header) != {"alg", "typ", "kid"} or header["alg"] != "ES256":
                raise CryptoError()
            if header["typ"] != "JWT" or not isinstance(header["kid"], str):
                raise CryptoError()
            signature = b64decode(signature_part)
            if len(signature) != 64:
                raise CryptoError()
            der = encode_dss_signature(
                int.from_bytes(signature[:32], "big"), int.from_bytes(signature[32:], "big")
            )
            self.verification_keys[header["kid"]].verify(
                der, (header_part + "." + claims_part).encode(), ec.ECDSA(hashes.SHA256())
            )
            claims = json.loads(b64decode(claims_part), object_pairs_hook=_unique_object)
            if not isinstance(claims, dict) or (
                claims.get("iss"), claims.get("aud"), claims.get("deviceId")
            ) != (issuer, audience, device_id):
                raise CryptoError()
            return claims
        except (InvalidSignature, ValueError, TypeError, KeyError, UnicodeError):
            raise CryptoError() from None

    def public_jwks(self) -> dict:
        return {"keys": [
            {"kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": kid,
             "x": b64encode(key.public_numbers().x.to_bytes(32, "big")),
             "y": b64encode(key.public_numbers().y.to_bytes(32, "big"))}
            for kid, key in self.verification_keys.items()
        ]}


def load_signing_key(pem: bytes) -> ec.EllipticCurvePrivateKey:
    try:
        key = serialization.load_pem_private_key(pem, password=None)
        if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
            raise CryptoError()
        return key
    except (ValueError, TypeError):
        raise CryptoError() from None
