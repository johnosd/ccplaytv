"""Configuração privada, sem leitura implícita do .env do fallback."""

from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class PortalSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CCPLAY_PORTAL_", env_file=None, extra="ignore", hide_input_in_errors=True
    )

    environment: Literal["development", "test", "staging", "production"] = "development"
    service_role: Literal["public", "jobs"] = "public"
    project_id: str = "demo-ccplaytv-portal"
    database_id: str = "(default)"
    firestore_emulator_host: str | None = Field(
        default=None, validation_alias="FIRESTORE_EMULATOR_HOST"
    )
    public_origin: str = "http://127.0.0.1:5174"
    static_dir: Path = Path(__file__).resolve().parents[3] / "portal-web" / "dist"
    port: int = Field(default=3001, ge=1, le=65535, validation_alias="PORT")
    checkout_enabled: bool = False
    journal_bucket: str | None = None
    service_recovery_epoch: str | None = None
    aes_key: SecretStr | None = None
    aes_key_version: str = "v1"
    aes_previous_keys: SecretStr | None = None
    signing_key: SecretStr | None = None
    signing_kid: str = "v1"
    signing_previous_public_keys: SecretStr | None = None
    identity_hmac_key: SecretStr | None = None
    identity_hmac_version: str = "v1"
    identity_hmac_previous_keys: SecretStr | None = None
    recovery_hmac_key: SecretStr | None = None
    recovery_hmac_version: str = "v1"
    recovery_hmac_previous_keys: SecretStr | None = None
    mercadopago_merchant_id: str | None = Field(default=None, pattern=r"^[0-9]{1,40}$")
    mercadopago_live_mode: bool = False
    mercadopago_access_token: SecretStr | None = None
    mercadopago_webhook_secret: SecretStr | None = None

    @model_validator(mode="after")
    def isolated_environment(self) -> "PortalSettings":
        local = self.environment in {"development", "test"}
        parsed = urlsplit(self.public_origin)
        if (
            parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in {"", "/"} or not parsed.hostname
        ):
            raise ValueError("invalid_public_origin")
        if self.checkout_enabled:
            # O gate comercial será implementado em T045, nunca um bypass de configuração.
            raise ValueError("checkout_not_released")
        if local:
            if not self.project_id.startswith("demo-") or not self.firestore_emulator_host:
                raise ValueError("local_emulator_required")
            emulator = urlsplit("//" + self.firestore_emulator_host)
            if (
                emulator.hostname not in {"localhost", "127.0.0.1", "::1"}
                or emulator.port is None or emulator.path or emulator.username
                or emulator.password or emulator.query or emulator.fragment
            ):
                raise ValueError("local_emulator_loopback_required")
            if parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1"}:
                raise ValueError("local_origin_required")
        else:
            if self.project_id.startswith("demo-") or self.firestore_emulator_host:
                raise ValueError("cloud_environment_required")
            if parsed.scheme != "https":
                raise ValueError("https_required")
            required = (
                self.aes_key, self.signing_key, self.identity_hmac_key, self.recovery_hmac_key
            )
            if any(value is None or len(value.get_secret_value()) < 32 for value in required):
                raise ValueError("private_keys_required")
        return self
