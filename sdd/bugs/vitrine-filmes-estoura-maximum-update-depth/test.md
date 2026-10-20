# Bug Verification: Vitrine de Filmes estoura "Maximum update depth exceeded" na descida longa sob carga

- **Slug**: vitrine-filmes-estoura-maximum-update-depth
- **Testado**: 2026-10-19
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

A reprodução original (`E2E_CPU=4 node e2e/carrosseis-filmes-series.mjs`) deixou de falhar, e a suíte E2E completa, que
falhava em 2 de 4 rodadas, passou nas duas rodadas seguintes.

## Checks Performed

| Verificação | Antes | Depois |
| --- | --- | --- |
| `E2E_CPU=4 node e2e/carrosseis-filmes-series.mjs` | 3/3 falha (também com o código anterior à 082) | 3/3 passa |
| `npm run test:e2e` | 53/54 (2 de 4 rodadas) | 54/54 e 54/54 |
| `npx vitest run src/lib/focus src/features/live src/features/vod` | — | 457/457 (teste original do hook intacto) |
| `npm run test` | — | 656 arquivos, 3 601 testes |
| `npm run lint` | — | `architecture: ok` |

## Not verified

A TV física: a correção remove a cadeia de atualizações, mas a medida de fluidez da descida longa fica para a T050 da
082 (painel de medição, quadros > 100 ms).
