# Bug Fix: E2E carrosseis-filmes-series estoura "Maximum update depth" na pilha de 302 categorias

- **Slug**: e2e-tv-carrosseis-filmes-series-falha-maximum-update
- **Corrigido**: 2026-10-23
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`windowAnchor` (a âncora da janela de prévias) era um estado que espelhava `focusRowIndex` por `useEffect`, o que custava um commit e um efeito passivo a mais por tecla da vitrine de Filmes; sob CPU lenta e teclas em rajada isso encadeava
atualizações até o React lançar "Maximum update depth exceeded". O espelho agora é ajustado **durante o render** (`if (windowAnchor !== focusRowIndex) setWindowAnchor(focusRowIndex)`), sem o efeito.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/features/vod/VodShowcaseScreen.tsx` | modified | o `useEffect(() => { setWindowAnchor(focusRowIndex) }, [focusRowIndex])` virou o ajuste condicional durante o render, com comentário de 2 linhas; o arquivo continua em 733 linhas (teto do ratchet) |

## Tests Added or Updated

- Nenhum teste novo: a reprodução determinística do próprio roteiro E2E (`E2E_CPU=4 node e2e/carrosseis-filmes-series.mjs`) é o teste de regressão. A suíte `npx vitest run src/features/vod` cobre o comportamento da vitrine.

## Local Verification

- Antes: `E2E_CPU=4 node e2e/carrosseis-filmes-series.mjs` → falhava 3 de 3 (e na cópia diagnóstica, 1 de 1; no baseline repetido para comparação, 1 de 1) com `Maximum update depth exceeded`.
- Depois: ver `test.md`.
- `npx tsc -b` e `npm run lint` (com o ratchet) → limpos.

## Deviations from Assessment

- A remediação preferida era **derivar** `windowAnchor` do render (`const windowAnchor = focusRowIndex`). Não dá: as entradas das fileiras (`entriesOf`) dependem de `previews`, que dependem da janela, e o foco efetivo (`focusRowIndex`) depende das entradas — derivar criaria um **ciclo**.
  Por isso o espelho continua sendo estado, ajustado durante o render (padrão recomendado do React para estado derivado), o que elimina o commit e o efeito passivo extra sem mudar a semântica.
- As três primeiras execuções com a mudança falharam em asserções do **início** do roteiro ("só as categorias da fonte", "foco na 1ª fileira (Curto)") logo depois de editar o arquivo (dev server recompilando a tela); a execução seguinte, sem edição no meio, passou limpa. Registrado como ruído de recompilação, não como efeito da mudança (o baseline sem a mudança não mostra essas falhas).

## Follow-ups

- Sem rodada na TV (pedido do usuário em outras sessões): a mudança remove um render por tecla da vitrine, então por construção só reduz trabalho no caminho que a 088/089 mediu; não foi re-medido.
