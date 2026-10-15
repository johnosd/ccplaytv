"""Contratos estáticos da implantação do portal.

Estes testes não acessam o Google Cloud. Eles garantem que os manifestos
versionados mantêm a separação público/jobs e não carregam segredos na imagem.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
INFRA = ROOT / "infra" / "portal"


def read_json(name: str) -> dict:
    return json.loads((INFRA / name).read_text(encoding="utf-8"))


def env(service: dict) -> dict[str, str]:
    return {
        item["name"]: item["value"]
        for item in service["spec"]["template"]["spec"]["containers"][0]["env"]
    }


def test_public_and_jobs_manifests_keep_roles_and_scaling_isolated():
    public = read_json("cloud-run-public.json")
    jobs = read_json("cloud-run-jobs.json")

    assert public["metadata"]["labels"]["cloud.googleapis.com/location"] == "us-central1"
    assert jobs["metadata"]["labels"]["cloud.googleapis.com/location"] == "us-central1"
    assert env(public)["CCPLAY_PORTAL_SERVICE_ROLE"] == "public"
    assert env(jobs)["CCPLAY_PORTAL_SERVICE_ROLE"] == "jobs"
    for service in (public, jobs):
        template = service["spec"]["template"]
        assert template["metadata"]["annotations"]["autoscaling.knative.dev/minScale"] == "0"
        assert template["metadata"]["annotations"]["autoscaling.knative.dev/maxScale"] == "2"
        assert template["spec"]["timeoutSeconds"] == 60


def test_iam_and_scheduler_do_not_make_jobs_public():
    public_iam = read_json("iam-public.json")
    jobs_iam = read_json("iam-jobs.json")
    scheduler = read_json("scheduler.json")

    assert public_iam["bindings"] == [{"role": "roles/run.invoker", "members": ["allUsers"]}]
    assert "allUsers" not in json.dumps(jobs_iam)
    target = scheduler["httpTarget"]
    assert target["httpMethod"] == "POST"
    assert target["uri"].endswith("/internal/portal/jobs/tick")
    assert "oidcToken" in target
    assert target["oidcToken"]["serviceAccountEmail"].startswith("REPLACE_")


def test_manifests_use_placeholders_and_do_not_embed_private_keys():
    text = "\n".join(
        (INFRA / name).read_text(encoding="utf-8")
        for name in ("cloud-run-public.json", "cloud-run-jobs.json", "scheduler.json")
    )
    assert "REPLACE_" in text
    for marker in ("CCPLAY_PORTAL_AES_KEY", "CCPLAY_PORTAL_SIGNING_KEY", "ACCESS_TOKEN"):
        assert marker not in text


def test_firestore_rules_are_server_only():
    rules = (INFRA / "firestore.rules").read_text(encoding="utf-8")
    assert "allow read, write: if false" in rules
