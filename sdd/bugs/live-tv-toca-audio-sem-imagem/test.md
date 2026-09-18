# Bug Verification: Live TV toca áudio sem imagem na TV física

- **Slug**: live-tv-toca-audio-sem-imagem
- **Testado**: 2026-09-17
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma original não reproduz mais: com o build corrigido instalado na
QN50Q60DAGXZD, o canal passou a exibir imagem além do áudio. A hipótese de
composição se confirmou e a concorrente (codec de vídeo não suportado) fica
descartada para este canal — se fosse codec, liberar o fundo não teria
mudado nada.

**Isto fecha a porta V1 da ADR-006**: reprodução por `webapis.avplay` com
fonte IPTV real, verificada no aparelho de referência. Era a validação que a
ADR-006 listava como "não executada" e que o cabeçalho do `avplayAdapter.ts`
declarava pendente.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | Passos 1-5 do `assessment.md`, no controle da TV | pass | Usuário confirmou: "Sim deu certo" — imagem visível com o áudio |
| Build, empacotamento e instalação | `npm run build:tizen` → `tizen build-web` → `tizen package -s ccplay_samsung_certificate_4` → `tizen install -t QN50Q60DAGXZD` → `tizen run` | pass | `successfully installed` / `successfully launched pid = 11151` |
| Testes novos | `npx vitest run src/features/live/PlayerOverlay.test.tsx` | pass | 13 testes, incluindo os 4 do plano de hardware |
| Suite de regressão | `npm run test` | pass | 10 arquivos / 57 testes (eram 53 antes do fix) |
| Lint / type-check | `npx tsc -b` e `npm run lint` | pass | exit 0; oxlint sem apontamentos |
| Fundo preto durante "Carregando…" | Observação no aparelho | not-run | Não relatado separadamente; coberto em jsdom pela asserção de que "preparando" não libera a área |
| Fundo restaurado ao sair da reprodução | Observação no aparelho | not-run | Não relatado separadamente; coberto em jsdom pelo teste de desmontagem. **Se a classe vazasse, o app ficaria visivelmente transparente na TV** — o usuário seguiu usando o app sem relatar isso, mas isso é indício, não observação dirigida |
| Tela de erro legível sobre fundo preto | Observação no aparelho | not-run | Nenhum canal falhou nesta rodada; coberto em jsdom pelo teste de erro |

## Output Excerpts

```
Tizen application is successfully installed.
... successfully launched pid = 11151 with debug 0

Test Files  10 passed (10)
     Tests  57 passed (57)
```

## Residual Risks

- Três comportamentos de borda (fundo preto durante o carregamento, fundo
  restaurado ao sair, tela de erro legível) estão verificados **em jsdom, não
  no aparelho**. São exatamente os riscos que o assessment levantou; os testes
  travam a lógica, mas a aparência na TV não foi observada caso a caso.
- A verificação cobre **um** canal de **uma** fonte. Não prova compatibilidade
  de contêiner/codec em geral — outro canal ainda pode falhar por mídia, e
  isso seria um bug diferente, não regressão deste.
- Contêiner e codec do canal testado continuam sem registro (pergunta aberta
  do assessment). Como a imagem apareceu, deixou de ser bloqueante, mas
  continua sendo o dado que faltará no dia em que algum canal não tocar.
- A área liberada é a tela inteira (`FULLSCREEN_REGION`). Player em janela
  (PiP, preview) exigirá acompanhar a região do `setDisplayRect`.

## Recommendation

Fechar — verificado no hardware alvo, com a reprodução original reexecutada e
a suite completa verde. As três observações de borda ficam como acompanhamento
na próxima sessão com a TV em mãos, não como motivo para segurar o bug.

Encaminhamento sugerido fora deste ciclo: a feature `003-live-tv-avplay` tem
seu aceite (Cenário C do quickstart / porta V1 da ADR-006) efetivamente
executado agora, e a documentação ainda descreve essa validação como
pendente. Rodar `sdd-converge` na 003 é o passo que sincroniza isso de forma
honesta — este arquivo não altera status de feature nem de ADR.
