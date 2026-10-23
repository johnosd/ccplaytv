# Bug Assessment: E2E carrosseis-filmes-series estoura "Maximum update depth" na pilha de 302 categorias

- **Slug**: e2e-tv-carrosseis-filmes-series-falha-maximum-update
- **Criado**: 2026-10-23
- **Origem**: gate E2E das features 090/091 (backlog `[Bug]`, 2026-10-23); já visto em `sdd/bugs/e2e-campos-da-listagem-nao-acha-fileira-avaliados` e `sdd/bugs/vitrine-filmes-estoura-maximum-update-depth` (aquele corrigiu `useOverflowEdges`)
- **Veredito**: valid
- **Severidade**: medium (erro de página na navegação por D-pad da vitrine de Filmes sob CPU lenta — na TV real a CPU é lenta; o React descarta atualizações e o foco pode ficar para trás)

## Report

`carrosseis-filmes-series` falha na suíte completa com `Error: Maximum update depth exceeded` no passo "Pilha virtualizada com 302 categorias" (descer 308 vezes pela vitrine) e passa isolado.
**Reprodução determinística**: `E2E_CPU=4 node e2e/carrosseis-filmes-series.mjs` (CPU reduzida 4× por CDP) falha **3 de 3** (receita herdada do bug `vitrine-filmes-estoura-maximum-update-depth`).

## Symptom

O React lança "Maximum update depth exceeded" durante a descida longa; pilha do erro: `dispatchSetState` ← `Object.onDirection` (`VodShowcaseScreen.tsx`) ← `handleKeyDown` (`useRemoteNav.ts`).
Antes dele, o React avisa: "calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render" (limite de atualizações **em efeito passivo**).
Esperado: a descida terminar sem erro de página.

## Reproduction

1. `npm run dev` em `tv-web/`.
2. `E2E_CPU=4 node e2e/carrosseis-filmes-series.mjs` → `✗ FALHOU: sem erros de página: … Maximum update depth exceeded`.

Medição (cópia diagnóstica descartável do roteiro, com gancho `__REACT_DEVTOOLS_GLOBAL_HOOK__`): **864 commits para 458 teclas** (≈ 2 renders por tecla). Os estados que mais mudam, todos em
`VodShowcaseScreen`: hooks #141 (341×), #171 (318×) e #138 (317×); depois `Rail#hook1` (66×) e #146/#147 (54×).

## Suspected Code Paths

- `tv-web/src/features/vod/VodShowcaseScreen.tsx:247` e `:302-304` — `windowAnchor` é um **estado que só espelha `focusRowIndex`**, atualizado por `useEffect(() => { setWindowAnchor(focusRowIndex) }, [focusRowIndex])`.
  Cada tecla que muda de fileira faz um render (`setFocusState`), um efeito passivo e **um segundo render** (`setWindowAnchor`); sob CPU lenta e teclas em rajada, a cadeia tecla → render → efeito → render alimenta o contador de
  atualizações aninhadas do React.
- `tv-web/src/lib/useRemoteNav.ts:175` — o manipulador de teclado é o ponto onde o `setState` é lançado (apenas onde o contador estoura, não a origem).
- `tv-web/src/features/vod/useCategoryPreviewWindow.ts` (089) — já espera 400 ms de quietude; não é a origem (o bug anterior o descartou).

## Root Cause Hypothesis

O espelhamento `windowAnchor ← focusRowIndex` por efeito dobra o número de renders por tecla da vitrine (o valor é derivável durante o render) e, com a CPU lenta, as rajadas de tecla encadeiam renders
sem trégua até o React lançar o erro de atualizações aninhadas. Confiança: **medium** — a evidência é indireta (≈ 2 commits por tecla; o estado espelho e `focusState` entre os que mais mudam; o aviso é de `setState` em efeito
passivo). Será confirmado ou refutado pela própria reprodução determinística: se tirar o espelho não zerar as 3 falhas, a hipótese está errada e o Assess volta.

## Proposed Remediation

**Preferida**: derivar `windowAnchor` do render (`const windowAnchor = focusRowIndex`) e remover o estado, o `setWindowAnchor` e o `useEffect`. A janela de prévias passa a seguir a fileira focada no mesmo render (a decisão
de buscar continua adiada pelos 400 ms de quietude de `useCategoryPreviewWindow`), e a vitrine perde um render por tecla.

**Alternativas**:
- `useFlushSync: false` no virtualizador — descartada pelo bug anterior (falha igual).
- Reduzir a rajada do roteiro do E2E (esperar entre teclas) — esconde o que a TV real vive com a CPU lenta; descartada.
- Adiar o espelho com `startTransition`/`requestIdleCallback` — o bug `e2e-campos-da-listagem…` mostrou que re-renders adiados **pioram** o erro; descartada.

**Files likely to change**:
- `tv-web/src/features/vod/VodShowcaseScreen.tsx`

**Tests to add or update**:
- Reprodução: `E2E_CPU=4 node e2e/carrosseis-filmes-series.mjs` (3/3 verdes após o fix) e a suíte `npx vitest run src/features/vod`.
- Se existir teste da vitrine que dependa do render extra, ajustá-lo sem afrouxar.

## Risks & Considerations

- A 089 mediu o caminho de navegação das vitrines (thread presa, fps): **sem rodada na TV** nesta sessão; a mudança **remove** trabalho (um render por tecla), não adiciona.
- As prévias não podem passar a buscar durante a descida: manter a espera de quietude e a regra "stale e invalidado contam como faltando" (`previewWindow.ts`).
- Não confundir com `useOverflowEdges` (já corrigido).

## Open Questions

- Nenhuma bloqueante. Se a hipótese falhar, registrar a evidência em `fix.md` → Deviations e rodar o Assess de novo.
