import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.portal.access_rotation import AccessRotation
from app.portal.application import create_app
from app.portal.auth import AuthError, AuthService
from app.portal.auth_tokens import AuthTokens, new_token
from app.portal.crypto import PortalCrypto
from app.portal.enrollment import EnrollmentService
from app.portal.models import DeviceDocument
from app.portal.operations import DeletionService
from app.portal.recovery_codes import RecoveryCodes
from app.portal.recovery_journal import JournalError, MemoryJournal
from app.portal.repositories.control import TransactionPlan
from app.portal.settings import PortalSettings
from app.portal.worker import PortalWorker


async def prepared(control):
    repository, paths = control
    tokens = AuthTokens({"fixture": b"i" * 32}, "fixture")
    auth = AuthService(repository, tokens, public_origin="http://127.0.0.1:5174",
                       recovery_epoch=new_token())
    signing = ec.generate_private_key(ec.SECP256R1())
    crypto = PortalCrypto({"fixture": b"a" * 32}, "fixture", signing, "fixture",
                           {"fixture": signing.public_key()})
    codes = RecoveryCodes({"fixture": b"r" * 32}, "fixture")
    enrollment = EnrollmentService(auth, crypto, codes)
    identity, now = "fixture-" + uuid.uuid4().hex, datetime.now(UTC)
    issued = await enrollment.enroll(identity, new_token(), "rotation-ip", now)
    credentials = issued.credentials
    device_id = credentials["deviceId"]
    paths.extend(["devices/" + device_id, "recoveryResults/" + issued.operation_id,
                  "identityClaims/" + tokens.digest("identity", identity),
                  "recoveryCodes/" + codes.digest(credentials["recoveryCode"])])
    paths.extend("rateLimits/" + tokens.digest("rate_limit", scope)
                 for scope in ("enroll-ip/rotation-ip", "enroll-global"))
    # Licença/trial têm que sobreviver à rotação; nenhuma nova concessão é criada aqui.
    path = "devices/" + device_id

    def trial(rows):
        device = DeviceDocument.model_validate(rows[path])
        return TransactionPlan(None, {path: device.model_copy(update={
            "trial_started_at": now, "trial_expires_at": now + timedelta(days=7),
            "entitlement_generation": 4,
        })})

    await repository.transact((path,), trial)
    operation_id, claim = new_token(), new_token()
    paths.extend(["devices/" + device_id + "/accessIntents/" + operation_id,
                  "recoveryResults/" + operation_id,
                  "jobs/" + AccessRotation.job_id(device_id, operation_id)])
    rotation = AccessRotation(auth, crypto, codes, MemoryJournal(environment="test"))
    return rotation, enrollment, credentials, operation_id, claim, now


async def remember_new_code(control, rotation, device_id):
    row = (await rotation.repository.client.document("devices/" + device_id).get()).to_dict()
    control[1].append("recoveryCodes/" + row["recoveryCodeHmac"])
    return row


async def test_rotation_revokes_old_access_and_code_preserves_trial_and_replays_delivery(control):
    rotation, _, old, operation_id, claim, now = await prepared(control)
    principal = await rotation.auth.authenticate_tv(old["bearer"])
    result = await rotation.begin(principal, operation_id, claim, "revoke", now)
    assert result.state == "ready" and result.credentials is None
    current = await remember_new_code(control, rotation, old["deviceId"])
    assert current["trialStartedAt"] == now and current["trialExpiresAt"] == now + timedelta(days=7)
    assert current["entitlementGeneration"] == 4
    assert current["authEpoch"] == 2 and current["recoveryCodeVersion"] == 2
    with pytest.raises(AuthError):
        await rotation.auth.authenticate_tv(old["bearer"])
    with pytest.raises(AuthError):
        await rotation.poll(old["deviceId"], operation_id, new_token(), now)
    delivered = await asyncio.gather(*(
        rotation.poll(old["deviceId"], operation_id, claim, now) for _ in range(2)
    ))
    assert delivered[0].credentials == delivered[1].credentials
    assert delivered[0].credentials["bearer"] != old["bearer"]
    assert delivered[0].credentials["recoveryCode"] != old["recoveryCode"]
    old_index = (await rotation.repository.client.document(
        "recoveryCodes/" + rotation.codes.digest(old["recoveryCode"])
    ).get()).to_dict()
    assert old_index["status"] == "consumed" and old_index["consumedByOperationId"] == operation_id
    current_principal = await rotation.auth.authenticate_tv(delivered[0].credentials["bearer"])
    assert await rotation.acknowledge(current_principal, operation_id, now)
    assert (await rotation.poll(old["deviceId"], operation_id, claim, now)).credentials is None
    row = (await rotation.repository.client.document("recoveryResults/" + operation_id).get()).to_dict()
    assert row["state"] == "acked" and row["envelope"] is None


async def test_journal_failure_keeps_fence_and_scoped_claim_resumes_after_crash(control):
    rotation, _, old, operation_id, claim, now = await prepared(control)

    class Unavailable:
        async def append(self, _event):
            raise JournalError("journal_unavailable")

    rotation.journal = Unavailable()
    principal = await rotation.auth.authenticate_tv(old["bearer"])
    assert (await rotation.begin(principal, operation_id, claim, "rotate", now)).state == "pending_journal"
    with pytest.raises(AuthError):
        await rotation.auth.authenticate_tv(old["bearer"])
    row = (await rotation.repository.client.document("devices/" + old["deviceId"]).get()).to_dict()
    assert row["authEpoch"] == 1 and row["accessFence"] == operation_id
    rotation.journal = MemoryJournal(environment="test")
    worker = PortalWorker(rotation.repository, DeletionService(rotation.repository, rotation.journal),
                          rotation)
    tick = await worker.run_once(now + timedelta(seconds=1))
    assert tick.completed == 1 and tick.failed == 0
    result = await rotation.poll(old["deviceId"], operation_id, claim, now + timedelta(seconds=1))
    assert result.state == "ready" and result.credentials is not None
    await remember_new_code(control, rotation, old["deviceId"])
    renewed = await asyncio.gather(*(
        rotation.poll(old["deviceId"], operation_id, claim, now + timedelta(minutes=5))
        for _ in range(2)
    ))
    assert renewed[0].credentials == renewed[1].credentials
    assert renewed[0].credentials["authEpoch"] == 3
    assert renewed[0].credentials["recoveryCodeVersion"] == 3
    await remember_new_code(control, rotation, old["deviceId"])
    row = (await rotation.repository.client.document("recoveryResults/" + operation_id).get()).to_dict()
    assert row["state"] == "ready" and row["expiresAt"] == now + timedelta(minutes=10)
    with pytest.raises(AuthError):
        await rotation.poll(old["deviceId"], operation_id, claim, now + timedelta(hours=24))


async def test_http_revoke_result_and_ack_use_distinct_proofs(control, tmp_path):
    rotation, enrollment, old, operation_id, claim, _ = await prepared(control)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = rotation.auth
    app.state.portal_enrollment = enrollment
    app.state.portal_access = rotation
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://127.0.0.1:5174") as client:
        issued = await client.post("/portal/v1/device/revoke", headers={
            "origin": "null", "authorization": "Bearer " + old["bearer"],
        }, json={"operationId": operation_id, "claimSecret": claim, "confirmed": True})
        assert issued.status_code == 202 and issued.json()["state"] == "ready"
        assert "credentials" not in issued.json() and claim not in issued.text
        await remember_new_code(control, rotation, old["deviceId"])
        for wrong in (old["bearer"], new_token()):
            denied = await client.post("/portal/v1/devices/recovery/result", headers={
                "origin": "null", "authorization": "Bearer " + wrong,
            }, json={"deviceId": old["deviceId"], "operationId": operation_id})
            assert denied.status_code == 401
        delivered = await client.post("/portal/v1/devices/recovery/result", headers={
            "origin": "null", "authorization": "Bearer " + claim,
        }, json={"deviceId": old["deviceId"], "operationId": operation_id})
        assert delivered.status_code == 200
        credentials = delivered.json()["credentials"]
        assert (await client.post("/portal/v1/devices/recovery/ack", headers={
            "origin": "null", "authorization": "Bearer " + credentials["bearer"],
        }, json={"operationId": operation_id})).status_code == 204
        delivered = await client.post("/portal/v1/devices/recovery/result", headers={
            "origin": "null", "authorization": "Bearer " + claim,
        }, json={"deviceId": old["deviceId"], "operationId": operation_id})
        assert "credentials" not in delivered.json()
