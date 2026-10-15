"""Normalização explícita de configuração; somente payload cifrado contém segredos."""

from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr

from app.portal.auth import AuthError


class ConfigurationPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)
    type: str | None = Field(default=None, max_length=32)
    displayName: str | None = Field(default=None, max_length=120)
    m3uUrl: SecretStr | None = Field(default=None, max_length=4096, repr=False)
    providerDns: SecretStr | None = Field(default=None, max_length=4096, repr=False)
    providerUsername: SecretStr | None = Field(default=None, max_length=1024, repr=False)
    providerPassword: SecretStr | None = Field(default=None, max_length=1024, repr=False)
    epgManualUrl: SecretStr | None = Field(default=None, max_length=4096, repr=False)
    epgOffsetHours: int | None = Field(default=None, ge=-12, le=12)
    epgDisabled: bool | None = None
    clearFields: list[str] | None = Field(default=None, max_length=2)

    def private_values(self) -> dict:
        values = self.model_dump(exclude_unset=True, exclude_none=True)
        return {key: value.get_secret_value() if isinstance(value, SecretStr) else value
                for key, value in values.items()}


def validate_url(value: str, *, dns: bool = False) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 4096:
        raise AuthError("invalid_input", 422)
    value = value.strip()
    try:
        parsed = urlsplit(value)
        if (parsed.scheme not in {"http", "https"} or not parsed.hostname
                or parsed.fragment or parsed.port is not None and not 1 <= parsed.port <= 65535
                or dns and (parsed.username is not None or parsed.password is not None)):
            raise ValueError
    except ValueError:
        raise AuthError("invalid_input", 422) from None
    return value.rstrip("/") if dns else value


def merge_configuration(previous: dict | None, patch: ConfigurationPatch, action: str) -> dict:
    values = patch.private_values()
    result = dict(previous or {})
    for key, value in values.items():
        if isinstance(value, str) and any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise AuthError("invalid_input", 422)
        if key == "clearFields":
            continue
        if isinstance(value, str) and not value.strip():
            continue
        result[key] = value
    clear = values.get("clearFields", [])
    remembered_clear = set(result.get("clearFields", []))
    if any(key not in {"epgManualUrl", "epgOffsetHours"} for key in clear):
        raise AuthError("invalid_input", 422)
    for key in clear:
        if key in values and values[key] not in {"", None}:
            raise AuthError("invalid_input", 422)
        result.pop(key, None)
        remembered_clear.add(key)
    for key in ("epgManualUrl", "epgOffsetHours"):
        if key in values and values[key] not in {"", None}:
            remembered_clear.discard(key)
    kind = result.get("type")
    name = result.get("displayName")
    if kind not in {"provider_credentials", "m3u_url"} or not isinstance(name, str) or not name.strip():
        raise AuthError("invalid_input", 422)
    if previous and kind != previous["type"]:
        raise AuthError("invalid_input", 422)
    result["displayName"] = name.strip()
    if kind == "provider_credentials":
        if any(not isinstance(result.get(key), str) or not result[key].strip()
               for key in ("providerDns", "providerUsername", "providerPassword")):
            raise AuthError("invalid_input", 422)
        if values.get("m3uUrl"):
            raise AuthError("invalid_input", 422)
        result["providerDns"] = validate_url(result["providerDns"], dns=True)
        result.pop("m3uUrl", None)
    else:
        if any(values.get(key) for key in ("providerDns", "providerUsername", "providerPassword")):
            raise AuthError("invalid_input", 422)
        result["m3uUrl"] = validate_url(result.get("m3uUrl", ""))
        for key in ("providerDns", "providerUsername", "providerPassword"):
            result.pop(key, None)
    if result.get("epgManualUrl"):
        result["epgManualUrl"] = validate_url(result["epgManualUrl"])
    if action == "update":
        # A TV conserva campos opcionais ausentes/vazios; clear precisa ir no comando.
        result["clearFields"] = sorted(remembered_clear)
    else:
        result.pop("clearFields", None)
    return result
