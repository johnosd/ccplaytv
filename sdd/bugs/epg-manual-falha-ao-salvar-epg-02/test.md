# Bug Verification: EPG manual falha com EPG-02 embora o navegador baixe o XML

- **Slug**: epg-manual-falha-ao-salvar-epg-02
- **Testado**: 2026-10-05
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

O texto novo de `network` está travado por teste e o type-check passa. A reprodução original (fetch cross-origin contra o servidor real do EPG, que depende de rede e de credencial) não foi reexecutada, e o app não consegue eliminar a causa (CORS no 302 do servidor). Por isso o resultado é `partial`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | fetch real em Chromium contra o servidor do EPG | not-run | Exige rede e credencial reais. Além disso, o fix não altera o comportamento do fetch. |
| Confirmação na TV física | instalar e sincronizar com o endereço final | not-run | Fora do escopo (sem deploy). |
| Testes novos/atualizados | `npx vitest run src/lib/epg src/features/settings/EpgSettingsScreen.test.tsx src/features/sources src/lib/i18n` | pass | 26 arquivos, 148 testes |
| Lint / type-check | `npx tsc -b` | pass | exit 0 |
| Suite de regressão completa / E2E | — | skipped | Restrição desta sessão; só testes estreitos. |

## Output Excerpts

```
Test Files  26 passed (26)
Tests  148 passed (148)
tsc exit 0
```

## Residual Risks

- O erro continua ocorrendo se o usuário informar um endereço que redireciona sem CORS. Só a mensagem orienta melhor.
- Comportamento na TV (origem `file://`) não confirmado.
- Texto novo sugere "endereço final" de forma genérica; não distingue CORS de falta de conexão.

## Recommendation

Segurar. Fechar após confirmar na TV física que o endereço final, ou o campo manual vazio (via `xmltv.php` do painel), sincroniza. Se o usuário preferir não alterar o texto, a mudança é reversível em `sources.ts`.

## Encerramento

**Fechado em 2026-10-05 por decisão do usuário**, com o escopo reduzido a melhorar a mensagem de erro (a causa é do servidor do EPG, e o app não a elimina). Isto responde ao segundo `[NEEDS CLARIFICATION]` do assessment: a melhoria de texto é a correção desejada. O veredito continua `partial`, de propósito: o sintoma original (EPG-02 com um endereço que redireciona sem CORS) segue ocorrendo, e só a mensagem orienta melhor; a confirmação na TV física (primeiro `[NEEDS CLARIFICATION]`) não foi feita e não será gate. A recomendação "Segurar" acima fica superada por esta decisão.