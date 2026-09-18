# Bug Verification: Tecla Voltar (RETURN) não funciona na TV física

- **Slug**: tecla-voltar-return-nao-funciona-na
- **Testado**: 2026-09-17
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma original não reproduz mais: com o build corrigido instalado na
QN50Q60DAGXZD, a tecla Voltar do controle voltou a navegar. A verificação foi
feita no aparelho, com o controle físico — não em emulador nem em navegador,
que é onde o bug nunca aparecia.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | Passos 1-4 do `assessment.md`, no controle da TV | pass | Usuário confirmou: "funcionou testei". Depois do Voltar, seguiu navegando e abriu Live TV, que carregou as categorias da fonte |
| Build e instalação no aparelho | `npm run build:tizen` → `tizen build-web` → `tizen package -s ccplay_samsung_certificate_4` → `tizen install -t QN50Q60DAGXZD` | pass | `Tizen application is successfully installed` / `successfully launched pid = 5337` |
| Testes novos | `npx vitest run src/lib/useRemoteNav.test.tsx` | pass | 4 casos, incluindo o do `keyCode` 10009 |
| Testes de tela que usam a tecla Voltar | `npx vitest run src/components/ConfirmDialog.test.tsx src/features/home/HomeScreen.test.tsx src/features/live/LiveScreen.test.tsx src/features/live/PlayerOverlay.test.tsx` | pass | 5 arquivos / 32 testes no conjunto, sem alteração nos existentes |
| Suite de regressão | `npm run test` | pass | 10 arquivos / 53 testes |
| Lint / type-check | `npx tsc -b` e `npm run lint` | pass | `tsc` exit 0; oxlint sem apontamentos |
| App não fecha junto com o Voltar | Observação indireta | pass | O usuário continuou usando o app depois de voltar (entrou no Live TV e reproduziu um canal), o que só é possível se o `preventDefault` segurou a plataforma |
| Confirmação de saída na Home (efeito colateral novo) | Passo 5 proposto na verificação | not-run | Não relatado pelo usuário nesta rodada; fica como pendência de observação, não como falha |

## Output Excerpts

```
app_id[8tZqMtwANL.CCPlayTv] install completed
Installed the package: Id(8tZqMtwANL.CCPlayTv)
... successfully launched pid = 5337 with debug 0

Test Files  10 passed (10)
     Tests  53 passed (53)
```

## Residual Risks

- A pergunta aberta do assessment continua sem medição: não sabemos qual
  `event.key` a TV entrega junto do `keyCode` 10009. A tentativa de abrir o
  Web Inspector no aparelho falhou (`sdb shell 0 debug` sem retorno, porta
  7011 fechada), então a condição segue tratando os dois caminhos por
  precaução. Isso não afeta o comportamento observado.
- `event.keyCode` é deprecado no padrão DOM; a cobertura por
  `event.key === 'XF86Back'` existe justamente para o dia em que um engine
  removê-lo, mas esse caminho alternativo **não foi exercitado em hardware**
  (a TV entra pelo `keyCode`).
- A confirmação de saída na Home passa a ser alcançável pelo controle pela
  primeira vez. Comportamento pretendido, ainda não observado no aparelho.

## Recommendation

Fechar — verificado no hardware alvo, com a reprodução original reexecutada
e a suite completa verde. A observação pendente da confirmação de saída na
Home é acompanhamento leve, não motivo para segurar o bug: ela usa o mesmo
`onBack` que acabou de ser validado em outras telas.

Durante esta verificação apareceu um **sintoma novo e independente**: ao
reproduzir um canal no Live TV, o áudio toca mas não há imagem. Não é
regressão deste fix (o caminho de reprodução não foi tocado) e não pertence
a este bug — deve ser tratado no seu próprio ciclo.
