# Bug Verification: gerenciador.spec.ts:95 falha na suíte paralela do portal

- **Slug**: playwright-portal-gerenciadorspects95-falha-na-suite
- **Testado**: 2026-10-23
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

A reprodução original (suíte paralela inteira, `--project=default`) falhava sempre em `gerenciador.spec.ts:95` (5 de 5 antes do fix). Depois do fix o teste não falhou em nenhuma execução medida. O comportamento do produto não foi alterado.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx playwright test --project=default` × 6 (fresco) | pass (6/6) | antes: 5/5 falhavam neste teste |
| Estabilidade do teste | `npx playwright test e2e/gerenciador.spec.ts:95 e2e/licenca.spec.ts --project=default --repeat-each=15 --workers=6` | pass (150/150) | |
| Testes novos/atualizados | os mesmos, mais `--repeat-each=5 --workers=4` e 14 suítes seguidas (14/14) na rodada do fix | pass | |
| Suíte de regressão | `npx playwright test` (4 projetos) → 65 passaram, 4 pulados; `npx vitest run` do portal → 37/37 | pass | |
| Lint / type-check | `npx tsc -b`; `npm run lint` | pass | limpos |

## Output Excerpts

- Antes: `locator.click: ... waiting for element to be visible, enabled and stable — element was detached from the DOM, retrying`, com a página já em "Conectar à TV" (logout por 401 antes do clique).
- Depois: `150 passed (44.0s)`; `default x6: ok ok ok ok ok ok`.

## Residual Risks

- Falhas raras de "primeira carga da página" em testes variados quando os 4 projetos rodam juntos (ver o bug irmão `playwright-portal-licencaspects43-falha-esporadica-renovar`): não são este defeito.
- O auxiliar `portalQuiet.ts` depende de eventos de rede do Playwright; novo teste que mude a resposta do serviço no meio do uso deve chamá-lo antes.

## Recommendation

Fechar — verificado: o sintoma original (100% de falha em paralelo) não reproduz.
