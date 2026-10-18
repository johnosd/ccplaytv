# Bug Assessment: EPG guia completo não renderiza a grade

- **Slug**: epg-guia-completo-no-renderiza-grade
- **Criado**: 2026-10-18
- **Origem**: falha observada no `node e2e/run.mjs --only epg-guia-completo`
- **Veredito**: valid
- **Severidade**: medium

## Report

O E2E sincroniza o EPG, abre a tela `.epg-guide`, mas não encontra `.epg-guide-grid` dentro de 6 segundos.

## Symptom

A tela do guia monta apenas a barra (`.epg-guide-bar`) e não renderiza detalhe, corpo ou grade. O esperado é a grade
com o canal de origem e o programa atual.

## Reproduction

1. `npm run dev` em `tv-web/`.
2. `node e2e/run.mjs --only epg-guia-completo --jobs 1`.
3. A importação sincroniza o EPG; abrir Guia completo pelo ícone do primeiro canal.

## Suspected Code Paths

- `tv-web/src/features/live/useLiveGuide.tsx` — compõe a tela e fornece os dados ao guia.
- `tv-web/src/features/live/guide/EpgGuide.tsx:499` — renderização de `.epg-guide-grid`.
- `tv-web/src/lib/epg/epgRepository.ts:listProgramsForChannels` — leitura do EPG comprimido e legado.
- `tv-web/e2e/epg-guia-completo.mjs:173` — reprodução e timeout.

## Root Cause Hypothesis

Confiança média: a tela recebe uma lista vazia ou estado de carregamento permanente depois da troca para `epgChunks`,
embora a sincronização termine. Precisamos reproduzir com diagnóstico numérico no estado do guia antes de decidir se é
leitura, janela temporal ou renderização.

## Proposed Remediation

**Preferida**: capturar o estado de dados da tela no E2E, corrigir a leitura/estado que impede a grade e adicionar uma
regressão que abre o guia após EPG comprimido.

**Files likely to change**:
- `tv-web/src/features/live/useLiveGuide.tsx`
- `tv-web/src/features/live/guide/EpgGuide.tsx`
- `tv-web/src/lib/epg/epgRepository.ts`
- `tv-web/e2e/epg-guia-completo.mjs`

**Tests to add or update**:
- reprodução E2E do guia completo;
- teste do repositório para geração comprimida e janela ativa.

## Risks & Considerations

- Não alterar a janela do EPG nem mascarar ausência de programas.
- A correção deve manter o fallback de linhas legado.

## Open Questions

- Nenhuma; a reprodução automatizada fornece um caso determinístico.
