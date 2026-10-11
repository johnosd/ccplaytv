import asyncio
import base64
import io
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from PIL import Image

from app.portal.application import create_app
from app.portal.auth import AuthError, AuthService, SessionIssuance
from app.portal.auth_tokens import AuthTokens, new_token
from app.portal.models import DeviceDocument, SessionDocument
from app.portal.repositories.control import TransactionPlan
from app.portal.routes.auth import COOKIE
from app.portal.settings import PortalSettings

ORIGIN = "http://127.0.0.1:5174"


async def seeded(control):
    repository, paths = control
    tokens = AuthTokens({"fixture": b"i" * 32}, "fixture")
    epoch = new_token()
    service = AuthService(repository, tokens, public_origin=ORIGIN, recovery_epoch=epoch)
    now = datetime.now(UTC)
    device_id = "test-" + uuid.uuid4().hex
    bearer = device_id + "." + new_token()
    device_key = new_token()
    device = DeviceDocument(device_id=device_id,
                            identity_hmac=tokens.digest("identity", uuid.uuid4().hex),
                            tv_bearer_hash=tokens.digest("tv_bearer", bearer),
                            device_key_hash=tokens.digest("device_key", device_key),
                            auth_epoch=1, recovery_epoch=epoch, created_at=now)
    paths.extend(["devices/" + device_id, "identityClaims/" + device.identity_hmac])
    paths.extend("rateLimits/" + rule.key_hash
                 for rule in service._manual_limits(device_id, "fixture-ip"))
    await repository.enroll(device)
    return service, device, bearer, device_key, now


def remember(control, service, collection, purpose, token):
    control[1].extend(service._paths(collection, purpose, token))
    if collection == "sessions":
        control[1].append("rateLimits/" + service.tokens.digest("rate_limit", "forms/" + token))


async def test_invite_single_use_concurrent_exchange_expiry_and_no_plaintext(control):
    service, device, bearer, _, now = await seeded(control)
    principal = await service.authenticate_tv(bearer)
    invite = await service.create_invite(principal, "manage", now)
    remember(control, service, "invites", "invite", invite.token)
    results = await asyncio.gather(*(
        service.exchange_invite(invite.token, ORIGIN, now) for _ in range(2)
    ), return_exceptions=True)
    assert sum(isinstance(result, SessionIssuance) for result in results) == 1
    assert sum(isinstance(result, AuthError) for result in results) == 1
    issued = next(result for result in results if isinstance(result, SessionIssuance))
    remember(control, service, "sessions", "session", issued.token)
    assert issued.principal.device_id == device.device_id
    expired = await service.create_invite(principal, "buy", now)
    remember(control, service, "invites", "invite", expired.token)
    with pytest.raises(AuthError):
        await service.exchange_invite(expired.token, ORIGIN, now + timedelta(minutes=5))
    row = (await service.repository.client.document(
        service._paths("sessions", "session", issued.token)[0]
    ).get()).to_dict()
    assert issued.token not in str(row)
    assert issued.csrf not in str(row)
    assert invite.token not in repr(invite)


async def test_session_origin_csrf_idle_absolute_expiry_and_global_restore_epoch(control):
    service, device, bearer, key, now = await seeded(control)
    issued = await service.manual_session(device.device_id, key, "fixture-ip", ORIGIN, now)
    remember(control, service, "sessions", "session", issued.token)
    for origin, csrf in [("null", issued.csrf), (None, issued.csrf), (ORIGIN, new_token())]:
        with pytest.raises(AuthError):
            await service.authenticate_session(issued.token, origin, now, csrf=csrf, mutation=True)
    principal = await service.authenticate_session(issued.token, ORIGIN, now,
                                                  csrf=issued.csrf, mutation=True)
    assert principal.device_id == device.device_id
    with pytest.raises(AuthError):
        await service.authenticate_session(issued.token, None, now + timedelta(minutes=30))
    path = service._paths("sessions", "session", issued.token)[0]
    snapshot = (await service.repository.client.document(path).get()).to_dict()
    old = SessionDocument.model_validate(snapshot).model_copy(update={
        "created_at": now - timedelta(hours=8), "last_seen_at": now,
    })
    await service.repository.transact((path,), lambda _: TransactionPlan(None, {path: old}))
    with pytest.raises(AuthError):
        await service.authenticate_session(issued.token, None, now)
    restored = AuthService(service.repository, service.tokens, public_origin=ORIGIN,
                           recovery_epoch=new_token())
    with pytest.raises(AuthError):
        await restored.authenticate_tv(bearer)


async def test_epoch_revokes_sessions_invites_bearer_and_fence_blocks(control):
    service, device, bearer, key, now = await seeded(control)
    issued = await service.manual_session(device.device_id, key, "fixture-ip", ORIGIN, now)
    remember(control, service, "sessions", "session", issued.token)
    principal = await service.authenticate_tv(bearer)
    invite = await service.create_invite(principal, "manage", now)
    remember(control, service, "invites", "invite", invite.token)
    path = "devices/" + device.device_id
    # Rotação write-ahead real pertence a T007; aqui provar recusa de acessos antigos.
    updated = device.model_copy(update={"auth_epoch": 2, "tv_bearer_hash": "0" * 64,
                                        "device_key_hash": "1" * 64})
    await service.repository.transact((path,), lambda _: TransactionPlan(None, {path: updated}))
    for call in (
        service.authenticate_tv(bearer), service.authenticate_session(issued.token, None, now),
        service.exchange_invite(invite.token, ORIGIN, now),
        service.create_invite(principal, "manage", now),
    ):
        with pytest.raises(AuthError):
            await call
    await service.repository.transact((path,), lambda _: TransactionPlan(None, {
        path: updated.model_copy(update={"access_fence": "pending-rotation"}),
    }))
    with pytest.raises(AuthError):
        await service.manual_session(device.device_id, key, "fixture-ip", ORIGIN, now)


async def test_manual_limit_shared_between_instances_cooldown_and_no_secret_counter(control):
    service, device, _, key, now = await seeded(control)
    second = AuthService(service.repository, service.tokens, public_origin=ORIGIN,
                         recovery_epoch=service.recovery_epoch)
    for index in range(5):
        instance = service if index % 2 else second
        with pytest.raises(AuthError) as error:
            await instance.manual_session(device.device_id, new_token(), "fixture-ip", ORIGIN, now)
        assert error.value.code == "invalid_credentials"
    with pytest.raises(AuthError) as error:
        await second.manual_session(device.device_id, key, "fixture-ip", ORIGIN, now)
    assert error.value.status == 429
    assert error.value.retry_after == 900
    issued = await second.manual_session(device.device_id, key, "fixture-ip", ORIGIN,
                                          now + timedelta(minutes=15))
    remember(control, service, "sessions", "session", issued.token)
    for rule in service._manual_limits(device.device_id, "fixture-ip"):
        row = (await service.repository.client.document("rateLimits/" + rule.key_hash).get()).to_dict()
        assert "fixture-ip" not in str(row)
        assert key not in str(row)


async def test_http_cookie_sanitization_null_origin_csrf_logout_and_jobs_isolation(control, tmp_path):
    service, _device, bearer, key, _ = await seeded(control)
    settings = PortalSettings(environment="test", static_dir=tmp_path)
    app = create_app(settings)
    app.state.portal_auth = service
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
        result = await client.post("/portal/v1/device/invites", headers={
            "origin": "null", "authorization": "Bearer " + bearer,
        }, json={"purpose": "manage"})
        assert result.status_code == 200
        qr = result.json()["qrDataUrl"]
        assert qr.startswith("data:image/png;base64,")
        image = Image.open(io.BytesIO(base64.b64decode(qr.split(",", 1)[1])))
        assert image.format == "PNG"
        assert image.width >= 300
        assert bearer not in result.text and key not in result.text
        token = result.json()["token"]
        remember(control, service, "invites", "invite", token)
        result = await client.post("/portal/v1/sessions/exchange", headers={"origin": "null"},
                                   json={"token": token})
        assert result.status_code == 403
        result = await client.post("/portal/v1/sessions/exchange", headers={"origin": ORIGIN},
                                   json={"token": token})
        assert result.status_code == 200
        csrf = result.json()["csrfToken"]
        cookie = client.cookies.get(COOKIE)
        remember(control, service, "sessions", "session", cookie)
        assert "HttpOnly" in result.headers["set-cookie"]
        assert "SameSite=strict" in result.headers["set-cookie"]
        assert "Path=/portal/v1" in result.headers["set-cookie"]
        assert cookie not in result.text and key not in result.text
        assert (await client.delete("/portal/v1/session", headers={"origin": ORIGIN})).status_code == 403
        result = await client.delete("/portal/v1/session", headers={
            "origin": ORIGIN, "x-csrf-token": csrf,
        })
        assert result.status_code == 204
        assert client.cookies.get(COOKIE) is None
        too_large = await client.post("/portal/v1/sessions/manual", headers={
            "origin": ORIGIN, "content-type": "application/json",
        }, content=b"x" * 65537)
        assert too_large.status_code == 413
        assert "x" * 100 not in too_large.text
    jobs = create_app(settings.model_copy(update={"service_role": "jobs"}))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=jobs), base_url=ORIGIN) as client:
        assert (await client.post("/portal/v1/sessions/manual")).status_code == 404


async def test_form_limit_is_shared_and_logical_window_survives_ttl_delay(control):
    service, device, _, key, now = await seeded(control)
    issued = await service.manual_session(device.device_id, key, "fixture-ip", ORIGIN, now)
    remember(control, service, "sessions", "session", issued.token)
    rate_path = "rateLimits/" + service.tokens.digest("rate_limit", "forms/" + issued.token)
    control[1].append(rate_path)
    second = AuthService(service.repository, service.tokens, public_origin=ORIGIN,
                         recovery_epoch=service.recovery_epoch)
    for index in range(30):
        await (service if index % 2 else second).authenticate_session(
            issued.token, ORIGIN, now, csrf=issued.csrf, mutation=True,
        )
    with pytest.raises(AuthError) as error:
        await second.authenticate_session(issued.token, ORIGIN, now,
                                          csrf=issued.csrf, mutation=True)
    assert error.value.status == 429 and error.value.retry_after == 60
    assert await service.authenticate_session(issued.token, ORIGIN, now + timedelta(seconds=60),
                                              csrf=issued.csrf, mutation=True)
