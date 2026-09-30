# Bug Verification: Mensagem genérica de erro de reprodução sempre diz "canal"

- **Slug**: mensagem-generica-erro-reproducao-sempre-diz
- **Testado**: 2026-09-29
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma não reproduz mais: uma falha genérica do motor chega ao `PlayerLayer`
só com o `code`, e a mensagem vem de quem apresenta (Live: "…este canal.";
filme/episódio/Home: "Não foi possível reproduzir isto."). O fix se manteve e
nenhuma regressão nova apareceu.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `PlayerLayer.test.tsx` — "falha do motor sem mensagem, sem prop, cai no texto neutro — nunca "canal" num filme" e "…usa a genericErrorMessage da tela" | pass | Reprodução automatizada do sintoma, executada nesta rodada. Não foi exercitada num navegador/TV reais. |
| Testes novos/atualizados | `npx vitest run src/lib/player src/components/PlayerLayer.test.tsx` | pass | 13 arquivos, 186/186 |
| Suíte de regressão | `npx vitest run` | pass (com ressalva) | 1789/1793; as 4 falhas são o padrão de flake sob paralelismo já documentado (`*.favorites.test.tsx` ×3, `LiveScreen` T010). Isoladas: favoritos 27/27; T010 passa com `--testTimeout=30000` |
| Contratos | `check-contract-tests.ps1` (027, 029, que cobrem `PlayerLayer`) | pass | Travas íntegras (5 testes cada) |
| Lint / type-check | `npx tsc -b`; `npm run lint` | pass | tsc exit 0; lint exit 0 (só avisos pré-existentes) |

## Output Excerpts

```
Test Files  13 passed (13)   Tests  186 passed (186)
Test Files  4 failed | 192 passed (196)   Tests  4 failed | 1789 passed (1793)   (suíte cheia, flakes)
Test Files  3 passed (3)   Tests  27 passed (27)   (favoritos, isolados)
```

## Residual Risks

- O texto por tela ("…este filme."/"…este episódio.") não faz parte deste bug; segue no item 19 do backlog.
- Nenhuma verificação em hardware real: o sintoma é de texto de UI, coberto por teste de componente.

## Recommendation

Fechar — reprodução automatizada executada e verde, tipos e lint limpos, flakes confirmados isolados.
