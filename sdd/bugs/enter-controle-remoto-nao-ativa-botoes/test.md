# Bug Verification: Enter do controle remoto não ativa botões em telas de foco DOM nativo

- **Slug**: enter-controle-remoto-nao-ativa-botoes
- **Testado**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma original não reproduz mais: reinstalado o build com o fix na
QN50Q60DAGXZD, o usuário moveu o foco até a aba "Endereço, usuário e senha"
com o D-pad e pressionou OK no controle físico — os campos de
endereço/usuário/senha apareceram normalmente. Suíte de regressão do
frontend permanece verde após o fix (nenhum código mudou entre `fix.md` e
esta fase).

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução original (pós-fix) | Foco na aba "Endereço, usuário e senha" via D-pad + OK, na TV física (QN50Q60DAGXZD), build reinstalado com o fix | pass | Confirmado pelo usuário: campos de endereço/usuário/senha apareceram |
| Testes novos (hook) | `npx vitest run src/lib/useRemoteNav.test.tsx` | pass | 6/6 (4 existentes + 2 novos da fase Fix) |
| Suite de regressão (frontend completa) | `npx vitest run` | pass | 64/64, 10 arquivos — resultado de `fix.md`, código inalterado desde então |
| Type-check | `npx tsc -b` | pass | sem erros — resultado de `fix.md`, código inalterado desde então |
| Lint | `npm run lint` (oxlint) | pass | sem erros — resultado de `fix.md`, código inalterado desde então |

## Output Excerpts

`npx vitest run src/lib/useRemoteNav.test.tsx` (fase Fix):
```
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

`npx vitest run` (fase Fix):
```
 Test Files  10 passed (10)
      Tests  64 passed (64)
```

## Residual Risks

- Não foi verificado na TV física, especificamente, se o próprio botão
  "Adicionar lista" (submit) e os botões de `ImportProgressScreen`
  (Cancelar/Tentar novamente/Voltar) também passaram a responder ao Enter —
  só a troca de aba (sintoma originalmente relatado) foi reproduzida e
  confirmada. Como os três botões dependem exatamente do mesmo mecanismo
  (`useTvKeyNav` + `useRemoteNav({ onBack })` sem `onSelect`) e o fix atua no
  hook compartilhado, a expectativa é que também estejam corrigidos, mas
  isso é inferência, não observação direta.
- Não há teste automatizado em nível de `AddSourceScreen`/
  `ImportProgressScreen` (ver `fix.md`, limitação de infraestrutura de
  teste) — a garantia de regressão para essas telas específicas depende só
  do teste do hook + desta verificação manual pontual na TV.

## Recommendation

Fechar — verificado ponta a ponta: o sintoma relatado não reproduz mais na
TV física, e a suíte automatizada (incluindo os 2 testes novos que travam o
mecanismo exato do bug) permanece verde. Sugiro, numa próxima sessão com a
TV disponível, uma passada rápida confirmando os botões de
`ImportProgressScreen` e o submit de `AddSourceScreen` pelo mesmo caminho
(D-pad + OK), já que o residual risk acima é inferência e não observação.
