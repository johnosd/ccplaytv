"""Backup de uso (072): só a mesma TV lê; painel só vê resumo; sigilo; limites; uma versão só."""

import json
import logging

import httpx

from app.portal.application import create_app
from app.portal.backup import UsageBackupService
from app.portal.settings import PortalSettings
from tests.portal.test_auth import ORIGIN, seeded
from tests.portal.test_crypto import make_crypto

MARKER_TMDB = "tmdb-marcador-072"
COUNTS = {"favorites": 1, "history": 2, "progress": 1, "categoryPreferences": 0, "listPins": 1}


def backup(**changes):
    body = {"format": 1, "createdAt": 1_700_000_000_000, "counts": COUNTS,
            "usage": {"userStates": [{"stableId": "lista:movie:1", "sourceId": "lista", "isFavorite": True}],
                      "categoryPreferences": [], "listPins": [{"sourceId": "lista", "salt": "s", "hash": "h"}],
                      "settings": {"ccplaytv:app-language": "pt"}},
            "secrets": {"tmdb": {"key": MARKER_TMDB, "format": "v3"}}}
    body.update(changes)
    return body


def remember_backup(control, device_id):
    control[1].append(f"devices/{device_id}/backups/current")


def app_for(auth, tmp_path):
    app = create_app(PortalSettings(environment="test", static_dir=tmp_path))
    app.state.portal_auth = auth
    app.state.portal_backups = UsageBackupService(auth, make_crypto())
    return app


async def test_tv_round_trip_only_same_tv_no_store_and_marker_out_of_logs(control, tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    auth, device, bearer, _, _ = await seeded(control)
    _, other, other_bearer, _, _ = await seeded(control)
    remember_backup(control, device.device_id)
    remember_backup(control, other.device_id)
    control[1].append("rateLimits/" + auth.tokens.digest("rate_limit", "backup/" + device.device_id))
    app = app_for(auth, tmp_path)
    tv = {"origin": "null", "authorization": "Bearer " + bearer}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
        assert (await client.get("/portal/v1/device/backup/summary", headers=tv)).json() == {"exists": False}
        saved = await client.put("/portal/v1/device/backup", headers=tv, json=backup())
        assert saved.status_code == 200 and saved.headers["cache-control"] == "no-store"
        assert saved.json() == {"createdAt": 1_700_000_000_000, "counts": COUNTS}
        assert MARKER_TMDB not in saved.text
        read = await client.get("/portal/v1/device/backup", headers=tv)
        assert read.status_code == 200 and read.headers["cache-control"] == "no-store"
        assert read.json()["secrets"]["tmdb"]["key"] == MARKER_TMDB
        # Outra TV (de outra emissão) não enxerga nada desta: o caminho sai sempre do bearer, nunca do pedido.
        foreign = {"origin": "null", "authorization": "Bearer " + other_bearer}
        refused = await client.get("/portal/v1/device/backup", headers=foreign)
        assert refused.status_code in (401, 404) and MARKER_TMDB not in refused.text
        # Uma versão só: o novo substitui o anterior.
        newer = backup(createdAt=1_700_000_100_000, counts={**COUNTS, "favorites": 5})
        assert (await client.put("/portal/v1/device/backup", headers=tv, json=newer)).json()["counts"]["favorites"] == 5
        summary = (await client.get("/portal/v1/device/backup/summary", headers=tv)).json()
        assert summary == {"exists": True, "createdAt": 1_700_000_100_000, "counts": {**COUNTS, "favorites": 5}}
        assert (await client.delete("/portal/v1/device/backup", headers=tv)).status_code == 204
        assert (await client.get("/portal/v1/device/backup", headers=tv)).status_code == 404
        assert (await client.get("/portal/v1/device/backup", headers={"origin": "null"})).status_code == 401
    assert MARKER_TMDB not in caplog.text


async def test_ciphertext_at_rest_invalid_input_and_size_limit(control, tmp_path):
    auth, device, bearer, _, _ = await seeded(control)
    remember_backup(control, device.device_id)
    control[1].append("rateLimits/" + auth.tokens.digest("rate_limit", "backup/" + device.device_id))
    app = app_for(auth, tmp_path)
    tv = {"origin": "null", "authorization": "Bearer " + bearer}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
        assert (await client.put("/portal/v1/device/backup", headers=tv, json=backup())).status_code == 200
        stored = (await control[0].client.document(f"devices/{device.device_id}/backups/current").get()).to_dict()
        assert MARKER_TMDB not in json.dumps(stored, default=str) and "lista:movie:1" not in json.dumps(stored, default=str)
        assert stored["counts"] == COUNTS
        bad_counts = backup(counts={"favorites": -1})
        assert (await client.put("/portal/v1/device/backup", headers=tv, json=bad_counts)).status_code == 422
        assert (await client.put("/portal/v1/device/backup", headers=tv, json=backup(format=2))).status_code == 422
        huge = backup(usage={"userStates": [], "categoryPreferences": [], "listPins": [],
                             "settings": {"x": "y" * (600 * 1024)}})
        refused = await client.put("/portal/v1/device/backup", headers=tv, json=huge)
        assert refused.status_code == 413 and MARKER_TMDB not in refused.text


async def test_site_summary_never_returns_content(control):
    auth, device, _, _, now = await seeded(control)
    remember_backup(control, device.device_id)
    service = UsageBackupService(auth, make_crypto())
    principal = auth._principal(device)
    await service.put(principal, backup(), now)
    view = await service.summary(principal)
    assert view == {"exists": True, "createdAt": 1_700_000_000_000, "counts": COUNTS}
    assert MARKER_TMDB not in json.dumps(view)


async def test_deleted_backup_is_not_recreated_by_a_tv_that_expected_it(control, tmp_path):
    auth, device, bearer, _, _ = await seeded(control)
    remember_backup(control, device.device_id)
    control[1].append("rateLimits/" + auth.tokens.digest("rate_limit", "backup/" + device.device_id))
    app = app_for(auth, tmp_path)
    tv = {"origin": "null", "authorization": "Bearer " + bearer}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN) as client:
        assert (await client.put("/portal/v1/device/backup", headers=tv, json=backup())).status_code == 200
        assert (await client.delete("/portal/v1/device/backup", headers=tv)).status_code == 204
        # Atualizar seguinte (a TV achava que havia backup): não recria.
        refused = await client.put("/portal/v1/device/backup", headers=tv, json=backup(expectExisting=True))
        assert refused.status_code == 404
        assert (await client.get("/portal/v1/device/backup/summary", headers=tv)).json() == {"exists": False}
        # "Fazer backup agora" (ação explícita) volta a guardar.
        assert (await client.put("/portal/v1/device/backup", headers=tv, json=backup())).status_code == 200