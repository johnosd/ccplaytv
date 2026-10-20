# Bug Fix: Vitrine de Filmes estoura "Maximum update depth exceeded" na descida longa sob carga

- **Slug**: vitrine-filmes-estoura-maximum-update-depth
- **Corrigido**: 2026-10-19
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`useOverflowEdges` só chama `setEdges` quando o lado com conteúdo oculto muda (comparação com um `ref` do valor
entregue). A medição continua a cada render, em `scroll`, no `ResizeObserver` e quando `deps` muda.

## Changes

- `tv-web/src/lib/focus/useOverflowEdges.ts`: `ref` `current` com o último valor; `measure` retorna sem `setState` quando
  igual.
- `tv-web/e2e/carrosseis-filmes-series.mjs`: opção `E2E_CPU=<n>` (CPU reduzida por CDP) para reproduzir sob carga.

## Not changed

Uma 1ª tentativa (medir no efeito só quando o elemento muda) também passava, mas mudava quando o hook mede e criava um
render extra no teste do próprio hook (`só re-renderiza quando algum lado muda`) — descartada pela guarda, que não muda o
comportamento. Um teste de unidade novo foi escrito e removido: ele passava com e sem a correção (no jsdom o render extra
não aparece), então não provaria nada. A regressão é o E2E com `E2E_CPU=4`.
