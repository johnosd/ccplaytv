"""Reassociação pela própria TV (072, ADR-017): mesmo registro, chave/código novos, recusa uniforme, sem eco."""

import logging
import uuid

import pytest

from app.portal.access_rotation import AccessRotation
from app.portal.auth import AuthError
from app.portal.auth_tokens import new_token
from app.portal.enrollment import EnrollmentService
from app.portal.self_relink import SelfRelinkService, relink_operation_id
from tests.portal.test_access_rotation import prepared, remember_new_code


def remember_relink(control, rotation, device_id, nonce, ip="relink-ip", identity=None):
    operation_id = relink_operation_id(nonce)
    tokens = rotation.auth.tokens
    control[1].extend(["devices/" + device_id + "/accessIntents/" + operation_id, "recoveryResults/" + operation_id,
                       "jobs/" + AccessRotation.job_id(device_id, operation_id)])
    scopes = ["relink-ip/" + ip, "relink-global"]
    if identity is not None:
        scopes.append("relink-identity/" + tokens.digest("identity", identity))
    control[1].extend("rateLimits/" + tokens.digest("rate_limit", scope) for scope in scopes)
    return operation_id


async def enrolled(control):
    rotation, _, _, _, _, now = await prepared(control)
    # `prepared` cadastra com uma identidade própria; para provar a identidade precisamos conhecê-la.
    identity = "relink-" + uuid.uuid4().hex
    fresh = await EnrollmentService(rotation.auth, rotation.crypto, rotation.codes).enroll(
        identity, new_token(), "relink-enroll-ip", now)
    tokens = rotation.auth.tokens
    control[1].extend(["devices/" + fresh.credentials["deviceId"], "recoveryResults/" + fresh.operation_id,
                       "identityClaims/" + tokens.digest("identity", identity),
                       "recoveryCodes/" + rotation.codes.digest(fresh.credentials["recoveryCode"])])
    control[1].extend("rateLimits/" + tokens.digest("rate_limit", scope)
                      for scope in ("enroll-ip/relink-enroll-ip", "enroll-global"))
    return rotation, identity, fresh.credentials, now


async def test_same_device_new_key_and_code_old_access_revoked_idempotent_and_code_out_of_logs(control, caplog):
    caplog.set_level(logging.DEBUG)
    rotation, identity, old, now = await enrolled(control)
    service = SelfRelinkService(rotation)
    nonce = new_token()
    operation_id = remember_relink(control, rotation, old["deviceId"], nonce, identity=identity)
    issued = await service.relink(identity, nonce, old["recoveryCode"], "relink-ip", now)
    await remember_new_code(control, rotation, old["deviceId"])
    assert issued["operationId"] == operation_id
    assert issued["deviceId"] == old["deviceId"] and issued["displayId"] == old["displayId"]
    assert issued["deviceKey"] != old["deviceKey"] and issued["recoveryCode"] != old["recoveryCode"]
    assert issued["authEpoch"] == old["authEpoch"] + 1
    with pytest.raises(AuthError):
        await rotation.auth.authenticate_tv(old["bearer"])
    principal = await rotation.auth.authenticate_tv(issued["bearer"])
    # Mesma TV, mesmo nonce: a mesma emissão (resposta perdida não gira duas vezes).
    again = await service.relink(identity, nonce, old["recoveryCode"], "relink-ip", now)
    assert again["bearer"] == issued["bearer"]
    assert await rotation.acknowledge(principal, operation_id, now)
    assert old["recoveryCode"] not in caplog.text and issued["recoveryCode"] not in caplog.text


async def test_wrong_or_consumed_code_and_unknown_identity_are_refused_uniformly(control):
    rotation, identity, old, now = await enrolled(control)
    service = SelfRelinkService(rotation)
    remember_relink(control, rotation, old["deviceId"], new_token(), identity=identity)
    remember_relink(control, rotation, old["deviceId"], new_token(), identity="ninguem")
    errors = []
    for candidate_identity, code in ((identity, "0000-0000-0000-0000-0000-0000-0000"),
                                     ("ninguem", old["recoveryCode"]), (identity, "nao é código")):
        with pytest.raises(AuthError) as caught:
            await service.relink(candidate_identity, new_token(), code, "relink-ip", now)
        errors.append((caught.value.code, caught.value.status))
    assert errors == [("invalid_credentials", 401)] * 3
    # Código consumido por uma reassociação deixa de valer.
    nonce = new_token()
    remember_relink(control, rotation, old["deviceId"], nonce)
    await service.relink(identity, nonce, old["recoveryCode"], "relink-ip", now)
    await remember_new_code(control, rotation, old["deviceId"])
    with pytest.raises(AuthError) as caught:
        await service.relink(identity, new_token(), old["recoveryCode"], "relink-ip", now)
    assert caught.value.code == "invalid_credentials"


async def test_rate_limit_per_identity(control):
    rotation, identity, _, now = await enrolled(control)
    service = SelfRelinkService(rotation)
    remember_relink(control, rotation, "unused", new_token(), ip="relink-ip-limit", identity=identity)
    for _ in range(5):
        with pytest.raises(AuthError):
            await service.relink(identity, new_token(), "0000-0000-0000-0000-0000-0000-0000", "relink-ip-limit", now)
    with pytest.raises(AuthError) as caught:
        await service.relink(identity, new_token(), "0000-0000-0000-0000-0000-0000-0000", "relink-ip-limit", now)
    assert caught.value.code == "rate_limited" and caught.value.status == 429
