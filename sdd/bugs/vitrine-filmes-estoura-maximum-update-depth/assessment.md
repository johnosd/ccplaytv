# Bug Assessment: Vitrine de Filmes estoura "Maximum update depth exceeded" na descida longa sob carga

- **Slug**: vitrine-filmes-estoura-maximum-update-depth
- **Criado**: 2026-10-19
- **Origem**: gate E2E da feature 082 (`npm run test:e2e`), script `carrosseis-filmes-series`, cenário "Pilha virtualizada
  com 302 categorias"
- **Veredito**: valid
- **Severidade**: medium (erro de página na navegação por D-pad; a tela continua, mas o React descarta atualizações e o
  foco pode ficar para trás; na TV, com CPU lenta, é o caso comum, não o raro)

## Report

`53/54` na suíte E2E completa em 2 de 4 rodadas de 2026-10-19: `sem erros de página: Error: Maximum update depth exceeded`.
Isolado (`--jobs 1`) passava 3/3 — por isso parecia instabilidade de paralelismo.

## Symptom

Descendo 308 vezes pela pilha de fileiras da vitrine de Filmes, o React lança "Maximum update depth exceeded" (pilha:
`VodShowcaseScreen` `onDirection` ← `useRemoteNav` `handleKeyDown`) e avisa "setState inside useEffect, but useEffect
either doesn't have a dependency array...".

## Reproduction

1. `npm run dev` em `tv-web/`.
2. `E2E_CPU=4 node e2e/carrosseis-filmes-series.mjs` (CPU reduzida 4× por CDP, como a suíte paralela pesa).
3. Falha sempre (3/3, e também com 6×).

**Não é regressão da 082**: com o código de `tv-web/src` anterior à sessão (via `git stash`), o passo 2 falha igual.

## Root Cause

`useOverflowEdges` (`tv-web/src/lib/focus/useOverflowEdges.ts`) mede a área rolável num efeito **sem lista de
dependências** — a cada render da tela — e chamava `setEdges` com atualizador funcional mesmo sem mudança. Um `setState`
de mesmo valor ainda agenda um render quando o componente acabou de ser atualizado (o React só descarta depois). Na
vitrine, cada tecla re-renderiza a tela inteira (foco, janela de fileiras, prévias); sob CPU lenta as teclas chegam antes
do fim do ciclo e essas atualizações em cadeia passam do limite de atualizações aninhadas.

Descartados: `useFlushSync: false` no virtualizador vertical da vitrine (a correção da Live na 061) — falha igual.

## Recommended Fix

Guardar o valor já entregue num `ref` e só chamar `setEdges` quando algum lado mudou — sem mudar quando o hook mede
(mesmo comportamento para Live, grade de categoria e vitrine).
