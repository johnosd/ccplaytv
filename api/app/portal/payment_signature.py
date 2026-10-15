"""HMAC oficial do webhook; replay é reconciliado por lookup/claims duráveis."""
import hashlib
import hmac
import re

from pydantic import SecretStr

from app.portal.auth import AuthError


def verify_payment_signature(signature: str | None, request_id: str | None,
                             payment_id: str, secret: SecretStr) -> None:
    if (not isinstance(signature, str) or len(signature) > 512 or not request_id
            or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", request_id)
            or not re.fullmatch(r"[0-9]{1,40}", payment_id)):
        raise AuthError("unauthorized", 401)
    fields = {}
    for part in signature.split(","):
        key, separator, value = part.strip().partition("=")
        if not separator or key in fields or key not in {"ts", "v1"}:
            raise AuthError("unauthorized", 401)
        fields[key] = value.strip()
    if (set(fields) != {"ts", "v1"} or not re.fullmatch(r"[0-9]{9,16}", fields["ts"])
            or not re.fullmatch(r"[0-9a-f]{64}", fields["v1"])):
        raise AuthError("unauthorized", 401)
    message = ("id:" + payment_id + ";request-id:" + request_id + ";ts:" + fields["ts"] + ";").encode()
    expected = hmac.digest(secret.get_secret_value().encode(), message, hashlib.sha256).hex()
    if not hmac.compare_digest(expected, fields["v1"]):
        raise AuthError("unauthorized", 401)
