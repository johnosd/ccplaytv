import socket

import httpx
import pytest

from app.services import ssrf_guard

PUBLIC_IP = "93.184.216.34"


def _fake_getaddrinfo(mapping: dict[str, str]):
    def _getaddrinfo(host, port, *args, **kwargs):
        if host not in mapping:
            raise socket.gaierror(f"host não mapeado no teste: {host}")
        ip = mapping[host]
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]

    return _getaddrinfo


def test_validate_url_allows_public_host(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({"exemplo.test": PUBLIC_IP}))
    ssrf_guard.validate_url("https://exemplo.test/lista.m3u")


def test_validate_url_rejects_disallowed_scheme(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({"exemplo.test": PUBLIC_IP}))
    with pytest.raises(ssrf_guard.SSRFValidationError):
        ssrf_guard.validate_url("ftp://exemplo.test/lista.m3u")


@pytest.mark.parametrize(
    "hostname,ip",
    [
        ("loopback.test", "127.0.0.1"),
        ("privado.test", "10.0.0.5"),
        ("linklocal.test", "169.254.1.1"),
        ("metadata.test", "169.254.169.254"),
    ],
)
def test_validate_url_blocks_internal_hosts(monkeypatch, hostname, ip):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({hostname: ip}))
    with pytest.raises(ssrf_guard.SSRFValidationError):
        ssrf_guard.validate_url(f"http://{hostname}/lista.m3u")


async def test_fetch_text_ssrf_safe_returns_body(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({"exemplo.test": PUBLIC_IP}))

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, text="#EXTM3U\n#EXTINF:-1,Canal\nhttp://exemplo.test/canal.m3u8\n"
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        body = await ssrf_guard.fetch_text_ssrf_safe(
            "https://exemplo.test/lista.m3u", client=client
        )

    assert body.startswith("#EXTM3U")


async def test_fetch_text_ssrf_safe_revalidates_redirect(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        _fake_getaddrinfo({"exemplo.test": PUBLIC_IP, "interno.test": "10.0.0.5"}),
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "exemplo.test":
            return httpx.Response(302, headers={"location": "http://interno.test/lista.m3u"})
        return httpx.Response(200, text="nao deveria chegar aqui")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ssrf_guard.SSRFValidationError):
            await ssrf_guard.fetch_text_ssrf_safe(
                "https://exemplo.test/lista.m3u", client=client
            )


async def test_fetch_text_ssrf_safe_enforces_size_limit(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({"exemplo.test": PUBLIC_IP}))

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="x" * 1000)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ssrf_guard.SSRFValidationError):
            await ssrf_guard.fetch_text_ssrf_safe(
                "https://exemplo.test/lista.m3u", client=client, max_bytes=100
            )


# --- fetch_json_ssrf_safe (feature 004, T009) — irmão JSON do guardião ---
# Delega a fetch_text_ssrf_safe, então a política de rede (host bloqueado,
# redirecionamento revalidado, limite de tamanho) já está coberta pelos
# testes acima; aqui cobrimos só o que é específico do irmão JSON.


async def test_fetch_json_ssrf_safe_returns_parsed_body(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({"painel.test": PUBLIC_IP}))

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"user_info": {"auth": 1}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        body = await ssrf_guard.fetch_json_ssrf_safe(
            "https://painel.test/player_api.php", client=client
        )

    assert body == {"user_info": {"auth": 1}}


async def test_fetch_json_ssrf_safe_rejects_non_json_body(monkeypatch):
    # Painel que não fala o protocolo costuma devolver HTML/texto de erro —
    # é assim que o conector detecta incompatibilidade (FR-010).
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({"painel.test": PUBLIC_IP}))

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>não é json</html>")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ssrf_guard.SSRFValidationError):
            await ssrf_guard.fetch_json_ssrf_safe(
                "https://painel.test/player_api.php", client=client
            )


async def test_fetch_json_ssrf_safe_blocks_internal_host(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({"interno.test": "10.0.0.5"}))

    with pytest.raises(ssrf_guard.SSRFValidationError):
        await ssrf_guard.fetch_json_ssrf_safe("http://interno.test/player_api.php")
