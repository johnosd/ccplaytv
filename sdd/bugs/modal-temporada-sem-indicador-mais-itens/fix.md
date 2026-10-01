# Bug Fix: Modal de temporada — foco some e não há indicador de "mais abaixo"

- **Slug**: modal-temporada-sem-indicador-mais-itens
- **Corrigido**: 2026-09-28
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A `.vod-season-modal-list` virou o próprio contêiner rolável, o item focado é
trazido à vista a cada passo e também na abertura, e um edge fade vertical
aparece só na borda que tem mais conteúdo (DS V14 §17). Antes de corrigir, a
reprodução foi confirmada num Chromium real: com 24 temporadas, o destaque
saía da área visível na **Temporada 14** (descendo) e na **23** (subindo),
sem nenhum sinal de continuação.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/features/series/SeriesDetailScreen.tsx` | modified | `useScrollFocusedIntoView` no item focado (a cada ↑/↓); callback ref na `<ul>` que, ao montar, rola até a temporada atual e calcula o fade inicial; `onScroll` recalcula o fade; `.no-scrollbar` + classes `--fade-start/--fade-end` |
| `tv-web/src/styles/vod.css` | modified | lista com `max-height`/`overflow-y: auto`/`scroll-padding-block`; padding + margem negativa (`--space-3`) para a receita de foco não ser cortada; `min-width`/`max-height` compensados para o modal manter as dimensões de antes; 3 regras de `mask-image` vertical (espelho do `Rail`) |
| `tv-web/src/lib/focus/scrollEdges.ts` | added | `verticalScrollEdges()` — função pura, mesma regra do `Rail` no eixo vertical |
| `tv-web/e2e/modal-temporada.mjs` | added | roteiro Playwright com painel Xtream fictício (série de 24 temporadas), 12 asserções, grava evidência em `sdd/bugs/<slug>/evidencias/` |

## Tests Added or Updated

- `tv-web/src/lib/focus/scrollEdges.test.ts` (5) — tudo cabe / topo / meio / fim / folga de subpixel.
- `tv-web/src/features/series/SeriesDetailScreen.test.tsx › modal de temporada com mais itens do que cabem` (4):
  - a lista é o contêiner rolável, com `no-scrollbar`;
  - mover o foco chama `scrollIntoView` no item focado;
  - na abertura, a temporada atual já é trazida à vista;
  - fade só embaixo na abertura, nas duas bordas após rolar para o meio.
- `tv-web/e2e/modal-temporada.mjs` (12 asserções, layout real): o foco nunca sai da área visível descendo até a T24 e subindo até a T1; fade correto no topo, no fim e no meio; OK escolhe a temporada destacada; **reabrir com a T20 como atual** já abre rolado até ela, com fade em cima.

## Local Verification

- **Reprodução antes do fix** (`node e2e/modal-temporada.mjs`): 5 de 9 asserções falhando — foco sumiu na T14 descendo e na T23 subindo, nenhum fade.
- **Depois do fix**: 12/12 asserções.
- `npx vitest run src/features/series src/lib/focus` → 10 arquivos, 113/113.
- `node e2e/filmes-series-ds-v14.mjs` (feature 025, usa o modal com 2 temporadas) → todas as verificações passaram.
- `npx tsc -b` → limpo. `npm run lint` → exit 0; o único aviso em `SeriesDetailScreen.tsx` (`useVirtualizer`, incompatible-library) já existia antes, só mudou de linha.
- Suíte completa (`npx vitest run`): 7 falhas, todas do padrão de flake sob paralelismo já documentado (`*.favorites.test.tsx` ×5, `HomeContent` hold-OK ×1, `LiveScreen` T010 ×1); rodadas em série/isoladas, passam (39/39 + T010 com timeout maior).
- 12/12 travas de contrato do repositório íntegras.
- Checagem visual: `evidencias/modal-temporada-rolado.png` — modal com as mesmas dimensões de antes (344px × 76→1004px no stage), contorno/glow do foco inteiro, fade visível em cima (T8) e embaixo (T21).

## Deviations from Assessment

- **Rolagem e fade na abertura por callback ref, não pelo hook sozinho.** O
  `Modal` compartilhado só renderiza os filhos no render **seguinte** ao da
  montagem (ele se ativa num `useEffect`). Um efeito do `SeriesDetailScreen`
  — inclusive o do `useScrollFocusedIntoView` e o `useLayoutEffect` tentado
  primeiro — roda antes de a lista existir. Achado pela E2E (o fade inicial
  não aparecia). A consequência deduzida da mesma causa (reabrir o modal com
  a temporada atual abaixo da dobra não rolaria até ela) ganhou asserção
  própria no roteiro, que passa com o callback ref. O `Modal` não foi
  alterado, como o assessment pedia.
- **Receita de foco cortada.** Tornar a lista o contêiner rolável faz ela
  recortar a escala/outline/glow do item focado (a captura da primeira
  tentativa mostrou as laterais cortadas). Resolvido com padding +
  margem negativa `--space-3`; como a margem negativa encolhia o modal, o
  `min-width`/`max-height` somam o padding de volta — dimensões idênticas às
  de antes, confirmado na captura.
- **`scroll-padding-block`**, não previsto: sem ele, `scrollIntoView` com
  `block: 'nearest'` deixava o item focado exatamente embaixo da faixa do
  fade.
- **Arquivo novo** `tv-web/e2e/modal-temporada.mjs`: o assessment pedia a
  verificação em navegador real sem listar o arquivo; ficou no repositório
  como trava de regressão. `lib/focus/scrollEdges.ts` estava previsto como
  "possivelmente um util".
- Falso alarme registrado para não se repetir: a primeira versão do roteiro
  acusava a T1 "fora da vista" na abertura — era a escala de foco (1.06)
  passando 2px da borda. O roteiro usa tolerância de 8px para isso.

## Follow-ups

- Somar `modal-temporada.mjs` à cadeia `npm run test:e2e` (hoje roda à
  parte, como `filmes-series-ds-v14.mjs`).
- Os modais futuros do item 55 (áudio/legenda, qualidade) terão listas
  potencialmente longas pelo mesmo `Modal`: vale extrair este padrão (lista
  rolável + fade + callback ref) para um componente compartilhado quando o
  segundo consumidor aparecer.
- Passada na TV física recomendada (não gate): `mask-image` e
  `scroll-padding` no Chromium 108 da QN50Q60DAGXZD — o `mask-image` já é
  usado pelo `Rail` lá.
