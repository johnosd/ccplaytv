# Bug Verification: Continue assistindo sobreposto na 1ª abertura de Filmes e Séries

- **Slug**: `continue-assistindo-sobreposto-na-primeira-abertura`
- **Testado**: 2026-10-05
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma foi reproduzido em teste de componente e de tela e deixa de reproduzir com o fix, sem regressão nos testes e E2E da área. **Verificado na TV física pelo usuário (2026-10-05)** depois de reinstalar o app: o "Continue assistindo" não fica mais sobreposto na 1ª abertura ("Verificado e agora corrigido"). Observação qualitativa do usuário; eu não vi a tela.

## Checks Performed

| Checagem | Resultado |
| --- | --- |
| `Rail.item-width.test.tsx` e teste de tela novo | falham sem o fix, passam com ele |
| `npx tsc -b` / `npm run lint` | pass |
| `npm run test` | pass — 419 arquivos / 2726 testes |
| E2E da área (9 scripts) | pass — 9/9 |
| `check-contract-tests.ps1` de todas as features | íntegros (0 problemas) |
| TV física (histórico em Filmes e Séries, 1ª abertura) | pass — confirmado pelo usuário após reinstalar |

## Regressions

Nenhuma encontrada.

## Verdict Rationale

A reprodução original acontece na TV física e foi reexecutada lá pelo usuário depois do fix: o sintoma sumiu. Soma-se a reprodução e a ausência de reprodução em teste de componente e de tela, sem regressão nos testes, nos E2E da área e nas travas de contrato. Ressalva: a confirmação na TV é qualitativa.

## Recommendation

Fechar o bug.