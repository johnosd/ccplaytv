# Bug Fix: gerenciador.spec.ts:95 falha na suíte paralela do portal

- **Slug**: playwright-portal-gerenciadorspects95-falha-na-suite
- **Corrigido**: 2026-10-23
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

O teste virava a rota do portal para 401 logo depois de "Listas" aparecer, com leituras iniciais ainda em voo; em paralelo uma delas recebia o 401 e o app saía da sessão antes do clique
(o botão "Atualizar estado" saía do DOM). Agora o teste conta as requisições `/portal/v1/` e só vira a rota depois que o painel ficou quieto. O produto não foi alterado.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `portal-web/e2e/gerenciador.spec.ts` | modified | usa `trackPortalTraffic(page).quiet()` (0 requisições do portal em voo e total estável entre duas leituras de 250 ms) antes de `page.route(... 401)`; espera também o botão "Editar" da lista |
| `portal-web/e2e/portalQuiet.ts` | added | auxiliar compartilhado `trackPortalTraffic` (contadores de `request`/`requestfinished`/`requestfailed` de `/portal/v1/`), reutilizado pelo bug irmão `playwright-portal-licencaspects43-falha-esporadica-renovar` |

## Tests Added or Updated

- `portal-web/e2e/gerenciador.spec.ts` › "sessão encerrada no meio do uso volta à entrada com o ID lembrado e o aviso" — mesmo roteiro e mesmas asserções finais, agora sem a corrida.

## Local Verification

- `npx tsc -b` e `npm run lint` (portal) → limpos.
- `npx playwright test --project=default` (suíte paralela) × 6 → **5 verdes (54/54)** e 1 com falha em `licenca.spec.ts:43` (não é este teste; ver Follow-ups).
- `npx playwright test e2e/gerenciador.spec.ts --project=default --repeat-each=5 --workers=4` → 30/30.
- Antes da correção: 5 de 5 rodadas da suíte paralela falharam em `gerenciador.spec.ts:95`.

## Deviations from Assessment

Nenhum no código. Observação: `licenca.spec.ts` voltou a falhar uma vez (agora `:43`, o primeiro teste do arquivo; antes `:124`) e não reproduz sob carga
(`--repeat-each=12 --workers=6`: 120/120 verdes; 3 suítes seguintes verdes). Por isso não houve correção especulativa nele.

## Follow-ups

- `licenca.spec.ts`: 2 falhas esporádicas em ~16 suítes completas, 0 em 120 repetições isoladas; sem error-context da primeira. Se voltar a falhar, abrir novo assess com o `error-context.md`
  (hipóteses: partida a frio do Vite ou recarga do dev server por arquivo gerado dentro da raiz do portal durante a rodada).
