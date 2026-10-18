# Bug Verification: Fixture antiga do catálogo em blocos acessa `block.items`

- **Slug**: fixture-antiga-catlogo-blocos-acessa-blockitems
- **Testado**: 2026-10-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O cenário de downgrade agora lê blocos comprimidos pelo caminho oficial, converte-os para o formato legado e conclui todas as verificações de catálogo, favoritos, progresso e detalhe.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `node e2e/run.mjs --only catalogo-em-blocos --jobs 1` | pass | 1/1 cenário passou; o downgrade não acessa `block.items` ausente |
| Testes novos/atualizados | `npm.cmd run test -- --run src/lib/catalog/blockChunks.test.ts src/lib/catalog/categoryBlocks.formato2.test.ts src/lib/catalog/categoryBlocks.conversao-leitores.test.ts` | pass | 3 arquivos, 3 testes passaram |
| Suite de regressão | `node e2e/run.mjs --only catalogo-em-blocos --jobs 1` | pass | cenário completo repetido após o fix |
| Lint / type-check | `npm.cmd run lint` | pass | avisos existentes; arquitetura concluiu `ok` |

## Output Excerpts

- `✓ catalogo-em-blocos — 22.3s`
- `1/1 scripts passaram em 22s`
- `Test Files 3 passed (3)` / `Tests 3 passed (3)`
- `architecture: ok`

## Residual Risks

- O cenário de estresse opcional de 300 mil itens não foi executado nesta verificação; ele é independente do downgrade.

## Recommendation

Fechar — a reprodução e os leitores de formato 2 passaram; manter o E2E do catálogo no gate da feature.
