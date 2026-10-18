"""081/T009: gera o arquivo de ambiente privado da produção com chaves novas, sem imprimir nenhum valor secreto.

Saída no terminal: só os nomes das variáveis gravadas e o JWKS **público** (`kid`→`x`/`y`) que o build comercial da TV
embute. Nunca sobrescreve um arquivo existente (perder as chaves impede decifrar e validar o que já foi emitido).
"""
import argparse
import json
import os
import re
import secrets
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.portal.crypto import b64encode

SIGNING_KID = "prod1"


def random_key() -> str:
    return b64encode(secrets.token_bytes(32))


def build(project_id: str, public_origin: str) -> tuple[str, dict]:
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,61}[a-z0-9]", project_id) or project_id.startswith("demo-"):
        raise ValueError("invalid_project_id")
    if not re.fullmatch(r"https://[a-z0-9.-]+", public_origin):
        raise ValueError("invalid_public_origin")
    private = ec.generate_private_key(ec.SECP256R1())
    pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                serialization.NoEncryption()).decode("ascii")
    numbers = private.public_key().public_numbers()
    jwks = {SIGNING_KID: {"kty": "EC", "crv": "P-256", "x": b64encode(numbers.x.to_bytes(32, "big")),
                          "y": b64encode(numbers.y.to_bytes(32, "big"))}}
    values = {
        "CCPLAY_PORTAL_ENVIRONMENT": "production",
        "CCPLAY_PORTAL_SERVICE_ROLE": "public",
        "CCPLAY_PORTAL_PROJECT_ID": project_id,
        "CCPLAY_PORTAL_PUBLIC_ORIGIN": public_origin,
        "CCPLAY_PORTAL_CHECKOUT_ENABLED": "false",
        "CCPLAY_PORTAL_MERCADOPAGO_LIVE_MODE": "true",
        "CCPLAY_PORTAL_JOURNAL_BUCKET": project_id + "-portal-journal",
        "CCPLAY_PORTAL_SERVICE_RECOVERY_EPOCH": random_key(),
        "CCPLAY_PORTAL_AES_KEY": random_key(),
        "CCPLAY_PORTAL_AES_KEY_VERSION": "v1",
        "CCPLAY_PORTAL_SIGNING_KID": SIGNING_KID,
        "CCPLAY_PORTAL_IDENTITY_HMAC_KEY": random_key(),
        "CCPLAY_PORTAL_IDENTITY_HMAC_VERSION": "v1",
        "CCPLAY_PORTAL_RECOVERY_HMAC_KEY": random_key(),
        "CCPLAY_PORTAL_RECOVERY_HMAC_VERSION": "v1",
    }
    lines = [f'{key}: "{value}"' for key, value in values.items()]
    # Bloco literal: o PEM é a única variável multilinha do arquivo.
    lines.append("CCPLAY_PORTAL_SIGNING_KEY: |")
    lines.extend("  " + line for line in pem.strip().splitlines())
    return "\n".join(lines) + "\n", jwks


def write_new(path: Path, content: str) -> None:
    # "x": falha se existir; permissões restritas onde o sistema suporta.
    with open(path, "x", encoding="utf-8", newline="\n") as handle:
        handle.write(content)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Gera o arquivo de ambiente privado da produção")
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--public-origin", required=True)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        content, jwks = build(args.project_id, args.public_origin)
        write_new(args.out, content)
    except FileExistsError:
        print(json.dumps({"code": "env_file_exists"}))
        return 1
    except ValueError as error:
        print(json.dumps({"code": str(error)}))
        return 1
    names = [line.split(":", 1)[0] for line in content.splitlines() if line.startswith("CCPLAY_PORTAL_")]
    print(json.dumps({"written": names, "licensePublicKeys": jwks}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
