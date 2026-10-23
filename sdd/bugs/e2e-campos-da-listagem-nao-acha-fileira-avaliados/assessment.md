# Bug Assessment: fileira de categoria fica em "esqueleto" depois que a pré-carga entrega a categoria

- **Slug**: e2e-campos-da-listagem-nao-acha-fileira-avaliados
- **Criado**: 2026-10-23
- **Origem**: achado pelo gate E2E da feature 090 (`campos-da-listagem` falhava; reportado ao usuário, que pediu `sdd-bugfix` sem rodada na TV)
- **Veredito**: valid
- **Severidade**: high

## Report

`tv-web/e2e/campos-da-listagem.mjs`, cenário "Cards de filmes sem hero": `section.vod-row[aria-label="Avaliados"]
.content-card` nunca aparece (timeout de 15 s). Falha igual no HEAD limpo `85e2ead` (sem a feature 090).

## Symptom

A fileira de uma categoria na vitrine (Filmes/Séries) continua com `aria-busy="true"` e só cartões-fantasma
(`vod-ghost-card--skeleton`) mesmo depois de a categoria ter sido obtida pela pré-carga em segundo plano. Esperado: os
cartões reais aparecem assim que a categoria chega (feature 038).

## Reproduction

1. `npm run dev`; `node e2e/campos-da-listagem.mjs` (fonte Xtream fictícia, uma categoria de filmes "Filmes | Avaliados").
2. Abrir a vitrine de Filmes: a fileira "Adicionados recentemente" tem 3 cartões; "Avaliados" fica com esqueletos.
   Observado por dump do DOM aos 6 s: `aria-busy="true"`, 0 `.content-card`.
3. **Bisseção** (worktree por commit, mesmo script): passa em `711680e`; falha em `f8179b8` e em `a9a6cdc`/`85e2ead`.
   O commit que introduz é `f8179b8` — "perf(089): a janela de previews para de se recriar a cada tecla".

## Suspected Code Paths

- `tv-web/src/features/catalog/catalogApi.ts` `useCategoryPreviews` (~l.1776) — o `useEffect` depende só de
  `[sourceId, idsKey, queryClient]`: avalia "o que falta" **uma vez por mudança de janela**.
- `tv-web/src/features/catalog/prefetchApi.ts:113-115` — a pré-carga, ao entregar uma categoria, chama
  `invalidateQueries(['category-preview', sourceId, categoryId])` (e a chave `'window'`, que **deixou de existir**).
- `tv-web/src/features/catalog/previewWindow.ts` — `previewsFaltando` já trata "invalidado" como faltando, mas só é
  chamada dentro do efeito.

## Root Cause Hypothesis

Antes da 089 a janela era um `useQuery` (chave `['category-preview', sourceId, 'window', idsKey]`): o `invalidateQueries`
da pré-carga (e `invalidateQueries([... 'window'])`) atingia essa consulta **observada**, que refazia sozinha e a tela
atualizava. A 089 trocou isso por um efeito sem consulta observada. A invalidação de uma consulta **sem observador** só
marca `isInvalidated` no cache; nada reexecuta o efeito (as dependências não mudam), então a prévia nunca é relida. O
comentário do commit diz que "stale e invalidado contam como faltando" para acompanhar a pré-carga — mas só vale no
próximo deslize, nunca na hora. Numa categoria que chega **depois** da primeira avaliação (lista nova / sob demanda), a
fileira fica em esqueleto até a pessoa mover a janela. Os testes da 089 não cobrem a invalidação.
Confiança: **high** (bisseção + leitura do invalidador; falta só o teste vermelho que o Fix escreve).

## Proposed Remediation

**Preferida**: dentro do efeito de `useCategoryPreviews`, assinar o `QueryCache` e reavaliar (`previewsFaltando` +
`fetchQuery` do que falta) quando chegar um evento `updated` com ação `invalidate` de uma chave
`['category-preview', sourceId, id]` com `id` na janela atual. Um único `subscribe` por janela, com filtro barato (não
volta a criar consultas nem observadores: preserva o ganho de eventos/tecla da 089). Mover o efeito para um arquivo ao
lado (`useCategoryPreviewWindow.ts`, callbacks por parâmetro, sem importar `catalogApi.ts`) porque `catalogApi.ts` está
no teto de linhas do ratchet — o arquivo só encolhe.

**Alternativas**:
- Voltar a uma consulta "da janela" — reintroduz o custo que a 089 mediu (19,6 eventos/tecla); descartada.
- `useQueries` com um observador por categoria — já estourou "Maximum update depth" (R-013 da 089); descartada.

**Files likely to change**:
- `tv-web/src/features/catalog/catalogApi.ts` (o hook fica fino e chama o novo)
- `tv-web/src/features/catalog/useCategoryPreviewWindow.ts` (novo)
- `tv-web/scripts/architecture-baseline.json` (só encolhe, via `--prune`)

**Tests to add or update**:
- Teste novo de regressão (vermelho antes): categoria sem dado → carrega; o cache da categoria é invalidado (como a
  pré-carga faz) e a prévia **relida** e atualizada sem mover a janela; invalidação de id fora da janela não relê.
- `catalogApi.preview-window.test.tsx` (089) continua verde: deslizar não relê o que já estava lá.
- `e2e/campos-da-listagem.mjs` volta a passar (sem rodada na TV, a pedido do usuário).

## Risks & Considerations

- Cada invalidação de uma categoria da janela dispara uma reavaliação + um `fetchQuery`: é o custo certo (a prévia
  precisa mesmo mudar); a 089 mediu eventos por **tecla**, não por categoria entregue.
- Rajadas de invalidação da pré-carga: coalescer num único `setPreviews` por microtarefa se o teste mostrar renders extras.
- **Sem medição na TV**: a mudança toca o caminho que a 089 otimizou; o ganho da 089 é preservado por construção (nenhuma
  consulta/observador novo por tecla), mas não foi re-medido — dito no `test.md`.
- É possível que a TV real mostrasse esqueletos persistentes em categorias que chegam tarde; nunca foi observado em
  medição (a sonda não confere o conteúdo das fileiras).
