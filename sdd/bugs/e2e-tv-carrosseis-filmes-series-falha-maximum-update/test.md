# Bug Verification: E2E carrosseis-filmes-series estoura "Maximum update depth" na pilha de 302 categorias

- **Slug**: e2e-tv-carrosseis-filmes-series-falha-maximum-update
- **Testado**: 2026-10-23
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O erro "Maximum update depth exceeded" deixou de ocorrer: aparecia em **3 de 3** execuções do baseline (`E2E_CPU=4`) e em **0 de 8** com a correção. A suíte E2E completa da TV passou 56/56 (antes 55/56, com este script falhando). As duas
falhas do **início** do roteiro sob CPU 4× já existiam sem a correção e não são este bug (ver Residual Risks).

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `E2E_CPU=4 node e2e/carrosseis-filmes-series.mjs` × 8 (3 + 1 + 4, em momentos diferentes) | pass para o erro (0/8 com "Maximum") | baseline (sem a mudança): 3/3 com o erro |
| Testes novos/atualizados | n/a (a reprodução determinística é o teste de regressão) | — | |
| Suíte de regressão E2E | `node e2e/run.mjs` (56 scripts, 6 em paralelo) | pass (56/56, 229 s) | antes 55/56 com `carrosseis-filmes-series` falhando |
| Testes unitários da vitrine | `npx vitest run src/features/vod src/lib/focus` | pass (57 arquivos / 240 testes) | um teste (`VodShowcaseScreen.test.tsx`, "categorias carregando…") falhou uma vez no lote e passou 3/3 com e sem a mudança isolado |
| Lint / type-check | `npx tsc -b`; `npm run lint` (ratchet: `VodShowcaseScreen.tsx` segue em 733 linhas) | pass | |

## Output Excerpts

- Baseline: `Error: Maximum update depth exceeded … at Object.onDirection (VodShowcaseScreen.tsx) … handleKeyDown (useRemoteNav.ts)`; contagem em `E2E_CPU=4`: baseline 1/2/3 com `maximum=2`.
- Com a correção: `run 1: exit=0 ✗=0 maximum=0 ✓=37` e `run 3` igual; `run 2` e `run 4`: `✗=2 maximum=0` (só as duas asserções do início do roteiro).
- Diagnóstico (cópia descartável, removida): 864 commits para 458 teclas antes da correção.

## Residual Risks

- Sob `E2E_CPU=4` (CPU artificialmente reduzida) duas asserções do **início** do roteiro ("só as categorias da fonte" e "foco na 1ª fileira (Curto)") falham de forma intermitente: baseline 2 de 3, com a correção 2 de 4 — a mesma taxa; **pré-existente e não corrigida aqui**
  (parece a rajada de teclas do roteiro chegando antes de a lista lateral entrar nos cards). Na suíte normal não aparecem.
- Sem rodada na TV: a mudança remove um commit e um efeito passivo por tecla da vitrine de Filmes; não foi re-medido o ganho da 088/089.
- O teste unitário citado acima é instável ocasionalmente no lote (1 vez); não reproduziu isolado.

## Recommendation

Fechar — o sintoma original (erro de página na pilha de 302 categorias) não reproduz mais. Se as falhas do início do roteiro sob `E2E_CPU=4` incomodarem, abrir bug próprio a partir deste Residual Risks.
