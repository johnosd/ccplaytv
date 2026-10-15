# Publicação no staging — feature 071 (T032)

Data: 2026-10-14. Autorização: pedido explícito do usuário ("publique a api"; depois "Siga"). Projeto
`ccplaytv-511322`, região `us-central1`.

## O que foi publicado

| Item | Valor |
| --- | --- |
| Build (Cloud Build) | `d7b15596-b262-409c-808c-78fa0377f638`, SUCCESS, 1m50s |
| Imagem | `us-central1-docker.pkg.dev/ccplaytv-511322/portal/ccplaytv-portal:071-20261014-1236` |
| Digest | `sha256:72988b991904b66b54425b43fe4c2e967373b504dfdce3b64f228976b84ab64e` |
| `ccplaytv-portal` | revisão `ccplaytv-portal-00017-664`, 100% do tráfego (antes: `…-00016-srm`) |
| `ccplaytv-portal-jobs` | revisão `ccplaytv-portal-jobs-00016-dhq`, 100% do tráfego (antes: `…-00015-647`) |
| Conteúdo | API (`POST /portal/v1/device/sources`, `trialStartedAt`) + portal-web (entrada `#id=&key=`) numa imagem única |

Os dois serviços foram atualizados com `gcloud run services update --image=<digest>` (variáveis de ambiente e
service account preservadas; nada passado na linha de comando). Ordem respeitada: API antes do pacote na TV.

**Rollback**: imagem anterior `…/ccplaytv-portal@sha256:d858f4cb213bcea515839645c0d31442e491c5bd4a89c8bbbe16616c974406db`;
`gcloud run services update-traffic ccplaytv-portal --to-revisions ccplaytv-portal-00016-srm=100 --region=us-central1`
e o mesmo para `ccplaytv-portal-jobs` com `ccplaytv-portal-jobs-00015-647`. Os documentos já gravados com
`uploadDigest` exigem o modelo novo no jobs: voltar os dois juntos só se nenhuma TV nova tiver enviado listas.

## Verificação no staging

| Verificação | Resultado |
| --- | --- |
| `infra/portal/smoke-staging.ps1` (`/` 200, `/health` 200, `/configurations` sem auth 401) | passou |
| `POST /portal/v1/device/sources` sem bearer | 401 (rota existe; rota inexistente dá 404) |
| `infra/portal/smoke-enrollment.ps1` | passou |
| `infra/portal/smoke-sources.ps1` (novo): enroll com `trialStartedAt` de 1 dia atrás → âncora respeitada; 1º envio `stored`, 2º `unchanged`; `Cache-Control: no-store`; resposta sem eco de usuário/senha | passou |
| `pwsh infra/portal/homologate-070.ps1` (regressão 070: sessão manual, recusa uniforme, `values`, limite 429) | 26/26 |
| Logs do Cloud Run (30 min) buscando os marcadores do smoke | 0 ocorrências; as 3 chamadas a `/device/sources` aparecem só com método/status |
| Pacote empacotado `file://` (`node e2e/portal-pacote-file.mjs`) com `build:tizen:commercial` apontando ao staging | PASS: painel, licença (teste, validade, oferta), QR fixo e chave por controle |

O pacote comercial foi gerado com `VITE_PORTAL_ORIGIN` = staging e `VITE_LICENSE_PUBLIC_KEYS` = JWKS público atual
(`kid=v1`, só `x`/`y`), variáveis só no processo; nenhum campo privado no pacote.

## Incidente de segredo (registro)

Ao descrever o serviço Cloud Run para conferir variáveis, a saída de um comando imprimiu a chave privada de
assinatura de staging (`CCPLAY_PORTAL_SIGNING_KEY`) no transcript da sessão (a máscara falhou em valor multilinha).
Nada foi gravado em arquivo do repositório. Recomendação: se o transcript sair do ambiente do usuário, rotacionar
essa chave (as chaves do staging são variáveis de ambiente em claro, decisão da 069). Daí em diante, nenhum comando
imprime env do serviço.

## Limites

- `measure-staging.ps1` simula a janela de polling da 069, que a 071 removeu; continua executável (usa
  `sessions/manual`), mas deixou de medir algo que o produto faz. Não reescrito.
- Não cobre DUID real, AVPlay, Chromium da TV nem a venda (continua desligada, R-022..R-026 da 069).
- A TV física (T033) segue aberta.
