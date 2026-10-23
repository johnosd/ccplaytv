# Bug Fix: a prévia da categoria acompanha a pré-carga

- **Slug**: e2e-campos-da-listagem-nao-acha-fileira-avaliados
- **Corrigido**: 2026-10-23
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`useCategoryPreviews` (feature 089) não reavaliava a prévia quando a pré-carga (038) entregava a categoria e invalidava
`['category-preview', sourceId, id]`: sem consulta observada, a invalidação só marcava o cache. Agora o efeito também
assina o `QueryCache` e, **numa janela parada**, relê a prévia invalidada de uma categoria que ainda não está "ready".

## Changes

- `tv-web/src/features/catalog/useCategoryPreviewWindow.ts` (novo): o efeito da janela, com callbacks (`keyOf`, `load`)
  para não importar `catalogApi.ts`. Roda quando a janela muda (como antes) **e** quando chega um evento `invalidate` de
  uma categoria da janela cuja prévia não está pronta. A reavaliação espera `QUIETUDE_MS` (400 ms) e é **cancelada por
  qualquer deslize da janela** (o efeito recomeça e já reavalia o invalidado). `setPreviews` só troca o Map se o conteúdo
  mudou (`igual`).
- `tv-web/src/features/catalog/catalogApi.ts`: `useCategoryPreviews` ficou um wrapper fino (2052 → 2036 linhas).
- `tv-web/scripts/architecture-baseline.json`: teto de `catalogApi.ts` encolhido por `--prune`.

## Tests Added or Updated

- `tv-web/src/features/catalog/catalogApi.preview-invalidate.test.tsx` (novo, 2 testes): categoria "pending" →
  pré-carga a entrega e invalida → vira "ready" sem deslizar a janela (vermelho antes: ficava "pending"); invalidação de
  id fora da janela ou de outra fonte não relê nada.
- Os testes da 089 (`catalogApi.preview-window.test.tsx`: eventos de cache por deslize, janela parada sem leitura)
  continuam verdes, sem alteração.

## Local Verification

- Bisseção por worktree: passa em `711680e`, falha em `f8179b8`, `a9a6cdc` e `85e2ead`.
- `npx vitest run src` → 684 arquivos / 3 734 testes verdes; `npx tsc -b` limpo; `npm run lint` → architecture ok.
- `e2e/campos-da-listagem.mjs` → 3/3 verdes após o conserto (falhava sempre antes).

## Deviations from Assessment

- A primeira versão reavaliava a cada evento (depois por microtarefa, depois com `startTransition`, depois em
  `requestIdleCallback`): todas somaram re-renders no meio da descida e **aumentaram** o "Maximum update depth" do
  virtualizador no E2E `carrosseis-filmes-series` (pilha de 302 categorias). A versão final só age com a janela parada
  (400 ms de quietude, cancelada por deslize) e só para prévia não-"ready".
- O "Maximum update depth" da pilha de 302 categorias **já acontece sem o conserto** sob carga (ver `test.md`): é outro
  problema (R-013 da 089), não corrigido aqui.

## Follow-ups

- O flake do E2E `carrosseis-filmes-series` ("Maximum update depth" no virtualizador, pilha de 302 categorias, sob carga
  paralela) merece um bug próprio.
- Não houve rodada na TV (pedido do usuário): o ganho de eventos por tecla da 089 é preservado por construção (nenhuma
  consulta/observador novo por tecla; nada roda durante a descida), mas não foi re-medido.
