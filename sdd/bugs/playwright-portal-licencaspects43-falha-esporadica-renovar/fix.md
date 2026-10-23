# Bug Fix: licenca.spec.ts:43 falha esporádica ao esperar "Renovar licença"

- **Slug**: playwright-portal-licencaspects43-falha-esporadica-renovar
- **Corrigido**: 2026-10-23
- **Assessment**: ./assessment.md
- **Status**: partial

## Summary

`approve()` do fixture de `licenca.spec.ts` agora espera o painel ficar quieto antes de mudar a resposta do serviço fictício, fechando a corrida com a leitura serializada do portal
(`useTvData` descarta um gatilho feito com leitura em voo, deixando o `device` velho e o botão "Comprar licença" no lugar de "Renovar licença"). O produto não foi alterado.
Fica **parcial** porque sobrou uma falha rara de "primeira carga da página" que não é essa corrida e não foi explicada (ver Deviations/Follow-ups).

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `portal-web/e2e/portalQuiet.ts` | added | `trackPortalTraffic(page)` → `{ quiet() }`; sem `waitForTimeout` |
| `portal-web/e2e/licenca.spec.ts` | modified | o fixture registra o auxiliar antes do `goto`; `approve` virou `async` e faz `await traffic.quiet()` antes de `status = 'approved'`; os 3 usos passaram a `await state.approve()` |
| `portal-web/e2e/gerenciador.spec.ts` | modified | passa a usar o mesmo auxiliar (ver o bug irmão) |

## Tests Added or Updated

- `portal-web/e2e/licenca.spec.ts` › "um botão e a frase com o ID da TV…" (`:46`), "volta do Mercado Pago retoma a sessão…" e "Pix pendente da TV vira aviso…" — mesmas asserções, sem a corrida.

## Local Verification

- `npx tsc -b` e `npm run lint` (portal) → limpos.
- `npx playwright test --project=default` × 14 → 14/14 verdes; `npx playwright test e2e/licenca.spec.ts e2e/gerenciador.spec.ts --project=default --repeat-each=10 --workers=6` → 160/160.
- Antes: `licenca.spec.ts:43` falhou em 4 de ~20 suítes completas; `:124`, 1 vez.

## Deviations from Assessment

- Tentei `expect: { timeout: 10_000 }` em `playwright.config.ts` por achar que as falhas restantes eram carga do dev server. Uma falha ainda ocorreu com 10 s (`licenca.spec.ts:158`, fixture: o título "Listas" não apareceu em 10 s) e, sem benefício demonstrado,
  **a alteração foi revertida** (não deixar um timeout maior mascarando).
- Depois das duas correções, em ~55 execuções de todos os projetos houve 3 falhas, todas "a página não renderizou a tempo" em testes diferentes: `layout.spec.ts:81` (campo do ID não aparece), `licenca.spec.ts:158` ("Listas" não aparece) e `licenca.spec.ts:46`
  (erro não capturado). Não são a corrida do `approve`.

## Follow-ups

- Falha rara de primeira carga (≈ 1 em 15–40 suítes completas, só com os 4 projetos em paralelo): sem causa conhecida; o `error-context.md` não trouxe snapshot da página. Se persistir, abrir novo assess com `--trace on` na rodada que falhar.
