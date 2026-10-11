import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.portal.application import create_app
from app.portal.auth import AuthError, AuthService
from app.portal.auth_tokens import AuthTokens, new_token
from app.portal.crypto import PortalCrypto
from app.portal.enrollment import EnrollmentIssuance, EnrollmentService
from app.portal.models import DeviceDocument
from app.portal.recovery_codes import RecoveryCodes
from app.portal.repositories.control import TransactionPlan
from app.portal.settings import PortalSettings


def service(control):
    repository, paths = control
    tokens = AuthTokens({"fixture": b"i" * 32}, "fixture")
    auth = AuthService(repository, tokens, public_origin="http://127.0.0.1:5174",
                       recovery_epoch=new_token())
    signing = ec.generate_private_key(ec.SECP256R1())
    crypto = PortalCrypto({"fixture": b"a" * 32}, "fixture", signing, "fixture",
                           {"fixture": signing.public_key()})
    codes = RecoveryCodes({"fixture": b"r" * 32}, "fixture")
    for scope in ("enroll-ip/fixture-ip", "enroll-ip/127.0.0.1", "enroll-global"):
        paths.append("rateLimits/" + tokens.digest("rate_limit", scope))
    return EnrollmentService(auth, crypto, codes)


def remember(control, enrollment, identity, issued):
    credentials = issued.credentials
    control[1].extend([
        "identityClaims/" + enrollment.auth.tokens.digest("identity", identity),
        "devices/" + credentials["deviceId"], "recoveryResults/" + issued.operation_id,
        "recoveryCodes/" + enrollment.codes.digest(credentials["recoveryCode"]),
    ])


async def test_concurrent_enrollment_replays_same_private_nonce_without_new_identity_or_trial(control):
    enrollment = service(control)
    identity, nonce, now = "fixture-" + uuid.uuid4().hex, new_token(), datetime.now(UTC)
    issued = await asyncio.gather(*(
        enrollment.enroll(identity, nonce, "fixture-ip", now) for _ in range(2)
    ))
    remember(control, enrollment, identity, issued[0])
    assert issued[0].operation_id == issued[1].operation_id
    assert issued[0].credentials == issued[1].credentials
    credentials = issued[0].credentials
    device = (await enrollment.repository.client.document("devices/" + credentials["deviceId"]
                                                          ).get()).to_dict()
    assert identity not in str(device)
    assert credentials["bearer"] not in str(device)
    assert credentials["recoveryCode"] not in str(device)
    assert device["trialStartedAt"] is None  # início elegível fica em T028, não recuperação.
    with pytest.raises(AuthError) as error:
        await enrollment.enroll(identity, new_token(), "fixture-ip", now)
    assert error.value.code == "recovery_required"
    with pytest.raises(AuthError):
        await enrollment.enroll("other-identity", nonce, "fixture-ip", now)
    with pytest.raises(AuthError):
        await enrollment.enroll(identity, nonce, "fixture-ip", now + timedelta(minutes=5))


async def test_ack_erases_envelope_and_nonce_cannot_read_after_ack(control):
    enrollment = service(control)
    identity, nonce, now = "fixture-" + uuid.uuid4().hex, new_token(), datetime.now(UTC)
    issued = await enrollment.enroll(identity, nonce, "fixture-ip", now)
    remember(control, enrollment, identity, issued)
    principal = await enrollment.auth.authenticate_tv(issued.credentials["bearer"])
    assert await enrollment.acknowledge(principal, issued.operation_id, now)
    assert await enrollment.acknowledge(principal, issued.operation_id, now)
    row = (await enrollment.repository.client.document("recoveryResults/" + issued.operation_id
                                                       ).get()).to_dict()
    assert row["state"] == "acked" and row["envelope"] is None
    with pytest.raises(AuthError):
        await enrollment.enroll(identity, nonce, "fixture-ip", now)
    assert (await enrollment.repository.client.document(
        "recoveryCodes/" + enrollment.codes.digest(issued.credentials["recoveryCode"])
    ).get()).to_dict()["status"] == "active"


async def test_http_enroll_hides_identity_and_requires_new_bearer_for_ack(control, tmp_path):
    enrollment = service(control)
    settings = PortalSettings(environment="test", static_dir=tmp_path)
    app = create_app(settings)
    app.state.portal_auth = enrollment.auth
    app.state.portal_enrollment = enrollment
    identity, nonce = "fixture-" + uuid.uuid4().hex, new_token()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://127.0.0.1:5174") as client:
        result = await client.post("/portal/v1/devices/enroll", headers={"origin": "null"},
                                   json={"platformIdentity": identity, "nonce": nonce})
        assert result.status_code == 200
        data = result.json()
        remember(control, enrollment, identity, EnrollmentIssuance(data["operationId"], data))
        assert identity not in result.text and nonce not in result.text
        assert result.headers["cache-control"] == "no-store"
        failed = await client.post("/portal/v1/devices/recovery/ack", headers={"origin": "null"},
                                   json={"operationId": data["operationId"]})
        assert failed.status_code == 401
        result = await client.post("/portal/v1/devices/recovery/ack", headers={
            "origin": "null", "authorization": "Bearer " + data["bearer"],
        }, json={"operationId": data["operationId"]})
        assert result.status_code == 204


async def test_nonce_does_not_deliver_stale_credentials_after_revocation(control):
    enrollment = service(control)
    identity, nonce, now = "fixture-" + uuid.uuid4().hex, new_token(), datetime.now(UTC)
    issued = await enrollment.enroll(identity, nonce, "fixture-ip", now)
    remember(control, enrollment, identity, issued)
    path = "devices/" + issued.credentials["deviceId"]

    def revoke(rows):
        device = DeviceDocument.model_validate(rows[path])
        return TransactionPlan(None, {path: device.model_copy(update={
            "auth_epoch": 2, "tv_bearer_hash": "0" * 64, "device_key_hash": "1" * 64,
        })})

    await enrollment.repository.transact((path,), revoke)
    with pytest.raises(AuthError):
        await enrollment.enroll(identity, nonce, "fixture-ip", now)
