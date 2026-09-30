# Bug Verification: Modal de temporada — foco some e não há indicador de "mais abaixo"

- **Slug**: modal-temporada-sem-indicador-mais-itens
- **Testado**: 2026-09-29
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma não reproduz mais num Chromium real: com 24 temporadas o foco nunca
sai da área visível (descendo até a T24 e subindo até a T1) e o fade aparece só
na borda que tem mais conteúdo. O fix se manteve. Uma falha apareceu num E2E
vizinho, mas é de uma asserção desatualizada de outra feature.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `node e2e/modal-temporada.mjs` (dev server em `localhost:5173`, painel Xtream fictício com 24 temporadas) | pass | 12/12 asserções, incluindo foco visível ao descer/subir, fade nas três posições, OK escolhe a T10 e reabrir com T20 já rolado |
| Testes novos/atualizados | `npx vitest run src/features/series src/lib/focus` | pass | 11 arquivos, 128/128 |
| E2E vizinho | `node e2e/filmes-series-ds-v14.mjs` | partial | 1 asserção falha: "Trailer soft-disabled anuncia "Em breve"". Desatualizada desde a feature 033 (o Trailer ficou real); não toca o modal de temporada. As demais passaram |
| Suíte de regressão | `npx vitest run` | pass (com ressalva) | 1789/1793; 4 falhas = flakes de paralelismo conhecidos, confirmados isolados (27/27 favoritos; T010 com timeout maior) |
| Lint / type-check | `npx tsc -b`; `npm run lint` | pass | tsc exit 0; lint exit 0; aviso `useVirtualizer` em `SeriesDetailScreen.tsx` já existia |
| Contratos | `check-contract-tests.ps1` (027, 029) | pass | Travas íntegras |
| Chromium 108 da TV | — | not-run | `mask-image`/`scroll-padding` na QN50Q60DAGXZD não testados (recomendado, não gate) |

## Output Excerpts

```
✓ o foco nunca sai da área visível ao descer
✓ foco chegou em "Temporada 24"
✓ reaberto rolado, há fade em cima (temporadas acima)
Todas as verificações passaram.

filmes-series-ds-v14.mjs: ✗ FALHOU: Trailer soft-disabled anuncia "Em breve" sem abrir o player
```

## Residual Risks

- Passada na TV física do `mask-image` e do `scroll-padding` não feita.
- `e2e/filmes-series-ds-v14.mjs` está desatualizado quanto ao Trailer (feature 033) e precisa de ajuste próprio; não foi corrigido aqui (fase Test não edita código).
- `modal-temporada.mjs` ainda não faz parte de `npm run test:e2e` (follow-up do `fix.md`).

## Recommendation

Fechar — a reprodução original foi executada em navegador real e passa. Abrir duas tarefas `sdd-adhoc` separadas: atualizar a asserção do Trailer em `filmes-series-ds-v14.mjs` e incluir `modal-temporada.mjs` no `test:e2e`.
