# Publicação no staging — feature 072 (T034)

Data: 2026-10-14. Autorização: resposta explícita do usuário ("Sim, publicar agora"). Projeto `ccplaytv-511322`,
`us-central1`, domínio `https://portal.ccplaytv.com`.

| Item | Valor |
| --- | --- |
| Build (Cloud Build) | `2620c76d-9d4d-4653-8e5c-0ef09cc2d0dc`, SUCCESS, 1m56s |
| Imagem | `…/portal/ccplaytv-portal:072-20261014-2058`, digest `sha256:a70c089731c0bcc7c6052bff1b300277ea345e891973641d4db891ec51700777` |
| `ccplaytv-portal` | revisão `ccplaytv-portal-00019-kqv` (antes: `00018-nx5`) |
| `ccplaytv-portal-jobs` | revisão `ccplaytv-portal-jobs-00018-t7g` (antes: `00017-kxv`) |

Variáveis de ambiente e service account preservadas (`update --image` por digest).

**Rollback**: `gcloud run services update-traffic ccplaytv-portal --to-revisions ccplaytv-portal-00018-nx5=100` e
`ccplaytv-portal-jobs --to-revisions ccplaytv-portal-jobs-00017-kxv=100` (`--region=us-central1`). Documentos
`backups/current` gravados ficam inertes na versão antiga.

## Verificação

| Verificação | Resultado |
| --- | --- |
| `smoke-staging.ps1` | passou |
| `smoke-sources.ps1` (071) | passou |
| `smoke-backup.ps1` (novo): PUT/summary/GET/DELETE, `no-store`, sem eco, `expectExisting` após apagar → 404, reassociação pelo código → mesmo `deviceId` com chave nova, código errado → 401 | passou |
| Logs do Cloud Run (20 min) com o marcador da chave TMDB e `recoveryCode` | 0 ocorrências |
| Pacote da TV | `build:tizen:commercial` (origem e site `portal.ccplaytv.com`, JWKS público) instalado sem desinstalar na TV 192.168.0.2 |
