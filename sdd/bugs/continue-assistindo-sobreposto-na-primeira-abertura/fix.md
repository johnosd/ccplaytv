# Bug Fix: Continue assistindo sobreposto na 1ª abertura de Filmes e Séries

- **Slug**: `continue-assistindo-sobreposto-na-primeira-abertura`
- **Corrigido**: 2026-10-05
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`Rail` remede os itens quando `itemWidth` muda (`virtualizer.measure()` num efeito); o "Continue assistindo", que vira card largo quando os fundos chegam, deixa de ficar sobreposto.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/components/Rail.tsx` | modified | `useEffect` com `virtualizer.measure()` em `[itemWidth, virtualizer]`. |
| `tv-web/src/components/Rail.item-width.test.tsx` | added | 2 testes: 324→424 e 424→324 reposicionam. |
| `tv-web/src/features/vod/VodShowcaseScreen.carrosseis.test.tsx` | modified | +1 teste: fundos chegando depois viram largos sem sobreposição (0, 424, 848). |

## Tests Added or Updated

- `Rail.item-width.test.tsx` (2) e o teste da tela (1): **falham sem o fix e passam com ele** (verificado revertendo só o efeito).

## Local Verification

- `npx tsc -b` e `npm run lint` exit 0; `npm run test` 419 arquivos / 2726 testes; E2E `top10-dica, carrosseis-filmes-series, vitrine-filmes-series, bem-avaliados, home-busca-configuracoes, historico-continuar-assistindo, favoritos, navegacao-por-pagina, live-paridade-v14` 9/9; travas de todas as features íntegras.

## Deviations from Assessment

Nenhum.

## Follow-ups

- Reinstalar na TV e conferir o "Continue assistindo" na 1ª abertura (histórico em Filmes e em Séries).