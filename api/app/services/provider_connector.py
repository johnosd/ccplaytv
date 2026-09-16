"""Conector de provedor (DNS/usuário/senha) — reaproveita o pipeline M3U em
vez de implementar o protocolo JSON completo do Xtream nesta feature
(research.md R2; ADR-004 §3 trata Xtream-compatível como hipótese, não
protocolo confirmado)."""

from __future__ import annotations

from urllib.parse import quote

from app.models.source import Source


class ProviderAuthError(ValueError):
    """Credenciais de provedor inválidas ou resposta não é uma lista M3U válida (FR-002 cenário 2)."""


class ProviderIncompatibleError(ValueError):
    """Endereço de servidor incompatível com o padrão esperado, ou inalcançável (FR-002 cenário 3)."""


def build_m3u_url(source: Source) -> str:
    """Monta a URL M3U autenticada a partir de DNS/usuário/senha — hipótese
    de compatibilidade com painéis Xtream (endpoint de exportação M3U)."""
    if not source.provider_dns or not source.provider_username or not source.provider_password:
        raise ProviderIncompatibleError("Dados do provedor incompletos.")

    dns = source.provider_dns.strip()
    if not dns:
        raise ProviderIncompatibleError("Endereço do servidor vazio.")
    if not dns.startswith(("http://", "https://")):
        dns = f"http://{dns}"
    dns = dns.rstrip("/")

    username = quote(source.provider_username, safe="")
    password = quote(source.provider_password, safe="")
    return f"{dns}/get.php?username={username}&password={password}&type=m3u_plus&output=m3u8"
