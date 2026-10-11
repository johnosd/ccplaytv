import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.portal.access_rotation import AccessResult, AccessRotation
from app.portal.application import create_app
from app.portal.auth import AuthError, AuthService
from app.portal.auth_tokens import AuthTokens, new_token
from app.portal.crypto import PortalCrypto
from app.portal.enrollment import EnrollmentService
from app.portal.models import DeviceDocument
from app.portal.recovery import RecoveryService, RecoveryWebIssuance
from app.portal.recovery_codes import RecoveryCodes, new_recovery_code
from app.portal.recovery_journal import JournalError, MemoryJournal
from app.portal.repositories.control import TransactionPlan
from app.portal.retention import RetentionService
from app.portal.settings import PortalSettings


async def prepared(control):
    repository, paths = control
    tokens = AuthTokens({"fixture": b"i" * 32}, "fixture")
    auth = AuthService(repository, tokens, public_origin="http://127.0.0.1:5174",
                       recovery_epoch=new_token())
    signing = ec.generate_private_key(ec.SECP256R1())
    crypto = PortalCrypto({"fixture": b"a" * 32}, "fixture", signing, "fixture",
                           {"fixture": signing.public_key()})
    codes = RecoveryCodes({"fixture": b"r" * 32}, "fixture")
    identity, now = "fixture-" + uuid.uuid4().hex, datetime.now(UTC)
    issued = await EnrollmentService(auth, crypto, codes).enroll(identity, new_token(), "fixture-ip", now)
    paths.extend(["devices/" + issued.credentials["deviceId"],
                  "identityClaims/" + tokens.digest("identity", identity),
                  "recoveryResults/" + issued.operation_id,
                  "recoveryCodes/" + codes.digest(issued.credentials["recoveryCode"])])
    paths.extend("rateLimits/" + tokens.digest("rate_limit", scope) for scope in (
        "enroll-ip/fixture-ip", "enroll-global", "recovery-ip/fixture-ip",
        "recovery-identity/" + identity, "recovery-global",
    ))
    recovery = RecoveryService(AccessRotation(auth, crypto, codes, MemoryJournal(environment="test")))
    return recovery, issued.credentials, identity, now


def remember(control, recovery, challenge):
    control[1].extend(["recoveryClaims/" + challenge["claimId"],
                      *recovery.auth._paths("invites", "invite", challenge["token"])])


async def test_challenge_retry_and_web_exchange_are_private_and_never_authorize_common_session(control):
    recovery, old, identity, now = await prepared(control)
    nonce = new_token()
    challenge = await recovery.challenge(identity, nonce, "fixture-ip", now)
    remember(control, recovery, challenge)
    assert await recovery.challenge(identity, nonce, "fixture-ip", now) == challenge
    assert challenge["deviceId"] == old["deviceId"]
    with pytest.raises(AuthError):
        await recovery.auth.exchange_invite(challenge["token"], recovery.auth.public_origin, now)
    web = await recovery.exchange(challenge["token"], recovery.auth.public_origin, now)
    control[1].extend(recovery.auth._paths("sessions", "recovery_session", web.token))
    assert web.device_id == old["deviceId"]
    with pytest.raises(AuthError):
        await recovery.auth.authenticate_session(web.token, None, now)
    assert (await recovery.web_claim(web.token, recovery.auth.public_origin, web.csrf, now)
            ).claim_id == challenge["claimId"]
    for origin, csrf in (("null", web.csrf), (recovery.auth.public_origin, new_token())):
        with pytest.raises(AuthError):
            await recovery.web_claim(web.token, origin, csrf, now)
    with pytest.raises(AuthError):
        await recovery.web_claim(web.token, recovery.auth.public_origin, web.csrf,
                                 now + timedelta(minutes=5))
    row = (await recovery.repository.client.document("recoveryClaims/" + challenge["claimId"]).get()).to_dict()
    assert identity not in str(row)
    assert challenge["claimSecret"] not in str(row)
    assert challenge["token"] not in str(row)


async def test_recovery_exchange_is_single_use_and_expired_challenge_is_refused(control):
    recovery, _, identity, now = await prepared(control)
    challenge = await recovery.challenge(identity, new_token(), "fixture-ip", now)
    remember(control, recovery, challenge)
    results = await asyncio.gather(*(
        recovery.exchange(challenge["token"], recovery.auth.public_origin, now) for _ in range(2)
    ), return_exceptions=True)
    assert sum(isinstance(result, RecoveryWebIssuance) for result in results) == 1
    assert sum(isinstance(result, AuthError) for result in results) == 1
    web = next(result for result in results if isinstance(result, RecoveryWebIssuance))
    control[1].extend(recovery.auth._paths("sessions", "recovery_session", web.token))
    other = await recovery.challenge(identity, new_token(), "fixture-ip", now)
    remember(control, recovery, other)
    with pytest.raises(AuthError):
        await recovery.exchange(other["token"], recovery.auth.public_origin, now + timedelta(minutes=5))


async def linked(control, recovery, identity, now):
    challenge = await recovery.challenge(identity, new_token(), "fixture-ip", now)
    remember(control, recovery, challenge)
    web = await recovery.exchange(challenge["token"], recovery.auth.public_origin, now)
    control[1].extend(recovery.auth._paths("sessions", "recovery_session", web.token))
    control[1].append("rateLimits/" + recovery.auth.tokens.digest("rate_limit", "recovery-forms/" + web.token))
    return challenge, web


def remember_attempt(control, recovery, challenge, code, operation_id):
    control[1].extend("rateLimits/" + rule.key_hash for rule in recovery.failure_rules(
        challenge["claimId"], code, "fixture-ip",
    ))
    device_id = challenge["deviceId"]
    control[1].extend(["devices/" + device_id + "/accessIntents/" + operation_id,
                      "recoveryResults/" + operation_id,
                      "jobs/" + recovery.access.job_id(device_id, operation_id)])


async def remember_code(control, recovery, device_id):
    row = (await recovery.repository.client.document("devices/" + device_id).get()).to_dict()
    control[1].append("recoveryCodes/" + row["recoveryCodeHmac"])
    return row


async def test_confirm_same_request_concurrent_is_once_and_delivers_only_to_tv_claim(control):
    recovery, old, identity, now = await prepared(control)
    challenge, web = await linked(control, recovery, identity, now)
    operation_id = new_token()
    remember_attempt(control, recovery, challenge, old["recoveryCode"], operation_id)
    arguments = {"code": old["recoveryCode"], "confirmed_device_id": old["deviceId"],
                 "request_id": operation_id, "ip": "fixture-ip", "now": now}
    results = await asyncio.gather(*(
        recovery.confirm(web.token, recovery.auth.public_origin, web.csrf, **arguments)
        for _ in range(2)
    ))
    assert all(result.state == "ready" and result.credentials is None for result in results)
    row = await remember_code(control, recovery, old["deviceId"])
    assert row["authEpoch"] == 2 and row["recoveryCodeVersion"] == 2
    assert (await recovery.confirm(web.token, recovery.auth.public_origin, web.csrf, **arguments)
            ).operation_id == operation_id
    with pytest.raises(AuthError):
        await recovery.auth.authenticate_tv(old["bearer"])
    delivered = await recovery.claim_result(challenge["claimId"], challenge["claimSecret"], now)
    assert delivered.credentials["deviceId"] == old["deviceId"]
    assert delivered.credentials["recoveryCode"] != old["recoveryCode"]
    principal = await recovery.auth.authenticate_tv(delivered.credentials["bearer"])
    assert await recovery.access.acknowledge(principal, operation_id, now)
    assert (await recovery.claim_result(challenge["claimId"], challenge["claimSecret"], now)).credentials is None


async def test_consumed_code_resumes_only_same_pending_operation_and_expires_at_24h(control):
    recovery, old, identity, now = await prepared(control)
    challenge, web = await linked(control, recovery, identity, now)
    operation_id = new_token()
    remember_attempt(control, recovery, challenge, old["recoveryCode"], operation_id)
    await recovery.confirm(web.token, recovery.auth.public_origin, web.csrf, code=old["recoveryCode"],
                           confirmed_device_id=old["deviceId"], request_id=operation_id,
                           ip="fixture-ip", now=now)
    await remember_code(control, recovery, old["deviceId"])
    later = now + timedelta(minutes=6)
    new_challenge, new_web = await linked(control, recovery, identity, later)
    request_id = new_token()
    remember_attempt(control, recovery, new_challenge, old["recoveryCode"], operation_id)
    result = await recovery.confirm(new_web.token, recovery.auth.public_origin, new_web.csrf,
                                    code=old["recoveryCode"], confirmed_device_id=old["deviceId"],
                                    request_id=request_id, ip="fixture-ip", now=later)
    assert result.operation_id == operation_id
    assert not (await recovery.repository.client.document("recoveryResults/" + request_id).get()).exists
    row = await remember_code(control, recovery, old["deviceId"])
    assert row["authEpoch"] == 3 and row["recoveryCodeVersion"] == 3
    with pytest.raises(AuthError):
        await recovery.claim_result(challenge["claimId"], challenge["claimSecret"], later)
    assert (await recovery.claim_result(new_challenge["claimId"], new_challenge["claimSecret"], later)
            ).credentials["authEpoch"] == 3
    expired = now + timedelta(hours=24, minutes=1)
    expired_challenge, expired_web = await linked(control, recovery, identity, expired)
    remember_attempt(control, recovery, expired_challenge, old["recoveryCode"], operation_id)
    with pytest.raises(AuthError):
        await recovery.confirm(expired_web.token, recovery.auth.public_origin, expired_web.csrf,
                               code=old["recoveryCode"], confirmed_device_id=old["deviceId"],
                               request_id=new_token(), ip="fixture-ip", now=expired)
    assert (await remember_code(control, recovery, old["deviceId"]))["authEpoch"] == 3


async def test_concurrent_two_challenges_have_one_rotation_winner(control):
    recovery, old, identity, now = await prepared(control)
    linked_claims = [await linked(control, recovery, identity, now) for _ in range(2)]
    calls = []
    for challenge, web in linked_claims:
        operation_id = new_token()
        remember_attempt(control, recovery, challenge, old["recoveryCode"], operation_id)
        calls.append(recovery.confirm(web.token, recovery.auth.public_origin, web.csrf,
                     code=old["recoveryCode"], confirmed_device_id=old["deviceId"],
                     request_id=operation_id, ip="fixture-ip", now=now))
    results = await asyncio.gather(*calls, return_exceptions=True)
    assert sum(isinstance(result, AccessResult) for result in results) == 1
    assert sum(isinstance(result, AuthError) for result in results) == 1
    assert (await remember_code(control, recovery, old["deviceId"]))["authEpoch"] == 2


async def test_invalid_code_and_wrong_destination_are_uniform_and_limit_is_shared(control):
    recovery, old, identity, now = await prepared(control)
    challenge, web = await linked(control, recovery, identity, now)
    operation_id, wrong_code = new_token(), new_recovery_code()
    remember_attempt(control, recovery, challenge, wrong_code, operation_id)
    remember_attempt(control, recovery, challenge, old["recoveryCode"], operation_id)
    second = RecoveryService(recovery.access)
    for index in range(5):
        with pytest.raises(AuthError) as error:
            await (second if index % 2 else recovery).confirm(
                web.token, recovery.auth.public_origin, web.csrf,
                code=wrong_code if index % 2 else old["recoveryCode"],
                confirmed_device_id=old["deviceId"] if index % 2 else "wrong-device",
                request_id=operation_id, ip="fixture-ip", now=now,
            )
        assert error.value.code == "invalid_credentials"
    with pytest.raises(AuthError) as error:
        await second.confirm(web.token, recovery.auth.public_origin, web.csrf,
                             code=old["recoveryCode"], confirmed_device_id=old["deviceId"],
                             request_id=operation_id, ip="fixture-ip", now=now)
    assert error.value.status == 429 and error.value.retry_after == 900
    assert (await recovery.repository.client.document("devices/" + old["deviceId"]).get()
            ).to_dict()["authEpoch"] == 1


async def test_http_recovery_browser_never_receives_credentials_and_tv_commits_before_ack(control, tmp_path):
    recovery, old, identity, _ = await prepared(control)
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = recovery.auth
    app.state.portal_access = recovery.access
    app.state.portal_recovery = recovery
    app.state.portal_enrollment = EnrollmentService(recovery.auth, recovery.crypto, recovery.codes)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url=recovery.auth.public_origin) as client:
        issued = await client.post("/portal/v1/devices/recovery/challenges", headers={"origin": "null"},
                                   json={"platformIdentity": identity, "nonce": new_token()})
        assert issued.status_code == 200
        challenge = issued.json()
        remember(control, recovery, challenge)
        control[1].extend("rateLimits/" + recovery.auth.tokens.digest("rate_limit", scope)
                         for scope in ("recovery-ip/127.0.0.1", "recover-ip/127.0.0.1"))
        exchanged = await client.post("/portal/v1/recoveries/exchange",
            headers={"origin": recovery.auth.public_origin}, json={"token": challenge["token"]})
        assert exchanged.status_code == 200
        cookie = client.cookies.get("ccplay_portal_recovery")
        control[1].extend(recovery.auth._paths("sessions", "recovery_session", cookie))
        control[1].append("rateLimits/" + recovery.auth.tokens.digest("rate_limit", "recovery-forms/" + cookie))
        assert "httponly" in exchanged.headers["set-cookie"].lower()
        assert "samesite=strict" in exchanged.headers["set-cookie"].lower()
        assert not {"bearer", "deviceKey", "recoveryCode", "claimSecret"} & exchanged.json().keys()
        operation_id = new_token()
        remember_attempt(control, recovery, challenge, old["recoveryCode"], operation_id)
        body = {"code": old["recoveryCode"], "confirmedDeviceId": old["deviceId"]}
        headers = {"origin": recovery.auth.public_origin, "idempotency-key": operation_id,
                   "x-csrf-token": exchanged.json()["csrfToken"]}
        denied = await client.post("/portal/v1/recoveries/confirm", headers={**headers, "origin": "null"}, json=body)
        assert denied.status_code == 403
        confirmed = await client.post("/portal/v1/recoveries/confirm", headers=headers, json=body)
        assert confirmed.status_code == 202 and confirmed.json() == {"operationId": operation_id, "state": "ready"}
        assert old["recoveryCode"] not in confirmed.text and challenge["claimSecret"] not in confirmed.text
        await remember_code(control, recovery, old["deviceId"])
        result = await client.post("/portal/v1/devices/recovery/result",
            headers={"origin": "null", "authorization": "Bearer " + challenge["claimSecret"]},
            json={"claimId": challenge["claimId"]})
        assert result.status_code == 200
        fresh = result.json()["credentials"]
        assert fresh["deviceId"] == old["deviceId"] and fresh["authEpoch"] == 2
        ack = await client.post("/portal/v1/devices/recovery/ack",
            headers={"origin": "null", "authorization": "Bearer " + fresh["bearer"]},
            json={"operationId": operation_id})
        assert ack.status_code == 204
        row = (await recovery.repository.client.document("recoveryResults/" + operation_id).get()).to_dict()
        assert row["envelope"] is None and row["state"] == "acked"


async def test_code_of_other_tv_is_refused_without_altering_either_identity(control):
    recovery, first, identity, now = await prepared(control)
    other_identity = "fixture-other-" + uuid.uuid4().hex
    other = await EnrollmentService(recovery.auth, recovery.crypto, recovery.codes).enroll(
        other_identity, new_token(), "fixture-ip", now,
    )
    second = other.credentials
    control[1].extend(["devices/" + second["deviceId"], "recoveryResults/" + other.operation_id,
        "identityClaims/" + recovery.auth.tokens.digest("identity", other_identity),
        "recoveryCodes/" + recovery.codes.digest(second["recoveryCode"])])
    challenge, web = await linked(control, recovery, identity, now)
    operation_id = new_token()
    remember_attempt(control, recovery, challenge, second["recoveryCode"], operation_id)
    with pytest.raises(AuthError) as error:
        await recovery.confirm(web.token, recovery.auth.public_origin, web.csrf,
            code=second["recoveryCode"], confirmed_device_id=first["deviceId"],
            request_id=operation_id, ip="fixture-ip", now=now)
    assert error.value.code == "invalid_credentials"
    for credentials in (first, second):
        assert (await recovery.auth.authenticate_tv(credentials["bearer"])).auth_epoch == 1
    assert not (await recovery.repository.client.document("recoveryResults/" + operation_id).get()).exists


async def test_restore_epoch_recovery_is_fenced_before_journal_and_preserves_trial(control):
    recovery, old, identity, now = await prepared(control)
    path = "devices/" + old["deviceId"]
    def trial(rows):
        current = DeviceDocument.model_validate(rows[path])
        return TransactionPlan(None, {path: current.model_copy(update={
            "trial_started_at": now, "trial_expires_at": now + timedelta(days=7),
            "entitlement_generation": 9,
        })})
    await recovery.repository.transact((path,), trial)
    recovery.auth.recovery_epoch = new_token()
    with pytest.raises(AuthError):
        await recovery.auth.authenticate_tv(old["bearer"])
    challenge, web = await linked(control, recovery, identity, now)
    operation_id = new_token()
    remember_attempt(control, recovery, challenge, old["recoveryCode"], operation_id)
    class Unavailable:
        async def append(self, _event):
            raise JournalError("journal_unavailable")
    recovery.access.journal = Unavailable()
    arguments = {"code": old["recoveryCode"], "confirmed_device_id": old["deviceId"],
                 "request_id": operation_id, "ip": "fixture-ip", "now": now}
    assert (await recovery.confirm(web.token, recovery.auth.public_origin, web.csrf, **arguments)
            ).state == "pending_journal"
    row = (await recovery.repository.client.document(path).get()).to_dict()
    assert row["accessFence"] == operation_id and row["authEpoch"] == 1
    assert row["recoveryEpoch"] == recovery.auth.recovery_epoch
    with pytest.raises(AuthError):
        await recovery.auth.authenticate_tv(old["bearer"])
    recovery.access.journal = MemoryJournal(environment="test")
    assert (await recovery.confirm(web.token, recovery.auth.public_origin, web.csrf, **arguments)).state == "ready"
    row = await remember_code(control, recovery, old["deviceId"])
    assert row["trialStartedAt"] == now and row["trialExpiresAt"] == now + timedelta(days=7)
    assert row["entitlementGeneration"] == 9 and row["identityHmac"] == recovery.auth.tokens.digest("identity", identity)
    delivered = await recovery.claim_result(challenge["claimId"], challenge["claimSecret"], now)
    assert (await recovery.auth.authenticate_tv(delivered.credentials["bearer"])).auth_epoch == 2
    with pytest.raises(AuthError):
        await recovery.auth.authenticate_tv(old["bearer"])


async def test_expired_pending_cipher_is_purged_and_journal_finalization_cannot_restore_it(control):
    recovery, old, identity, now = await prepared(control)
    challenge, web = await linked(control, recovery, identity, now)
    operation_id = new_token()
    remember_attempt(control, recovery, challenge, old["recoveryCode"], operation_id)
    class Unavailable:
        async def append(self, _event):
            raise JournalError("journal_unavailable")
    recovery.access.journal = Unavailable()
    await recovery.confirm(web.token, recovery.auth.public_origin, web.csrf,
        code=old["recoveryCode"], confirmed_device_id=old["deviceId"],
        request_id=operation_id, ip="fixture-ip", now=now)
    intent_path = "devices/" + old["deviceId"] + "/accessIntents/" + operation_id
    retention = RetentionService(recovery.repository)
    late = now + timedelta(minutes=6)
    assert await retention.expire(intent_path, late)
    row = (await recovery.repository.client.document(intent_path).get()).to_dict()
    assert row["envelope"] is None and row["envelopeExpired"] is True and row["state"] == "pending_journal"
    recovery.access.journal = MemoryJournal(environment="test")
    from app.portal.models import AccessIntentDocument
    assert (await recovery.access.resume(AccessIntentDocument.model_validate(row), late)).state == "ready"
    result_path = "recoveryResults/" + operation_id
    result = (await recovery.repository.client.document(result_path).get()).to_dict()
    assert result["envelope"] is None and result["state"] == "expired"
    await remember_code(control, recovery, old["deviceId"])
    # A prova privada continua vinculada à mesma operação; uma nova rodada gera
    # novo envelope/epoch em vez de reconstruir texto claro já expurgado.
    delivered = await recovery.claim_result(challenge["claimId"], challenge["claimSecret"], late)
    assert delivered.credentials["authEpoch"] == 3
    await remember_code(control, recovery, old["deviceId"])
    old_code_path = "recoveryCodes/" + recovery.codes.digest(old["recoveryCode"])
    assert not await retention.expire(old_code_path, now + timedelta(hours=24, microseconds=-1))
    assert await retention.expire(old_code_path, now + timedelta(hours=24))
    assert not (await recovery.repository.client.document(old_code_path).get()).exists
