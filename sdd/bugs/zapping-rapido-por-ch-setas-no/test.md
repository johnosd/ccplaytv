# Bug Verification: Zapping rápido por CH±/↑/↓ para no próximo canal

- **Slug**: zapping-rapido-por-ch-setas-no
- **Testado**: 2026-10-14
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

A reprodução automatizada (jsdom, `<video>` de desenvolvimento) não reproduz mais: rajadas de ↓ só abrem o canal
final, CH± age durante o `preparing` e a falha volta ao canal anterior à rajada. Sem regressão nas suítes. A
reprodução **na TV física** (AVPlay, controle real) não foi executada, por isso `partial`, e não `verified`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix, automatizada) | `npx vitest run src/features/live/LiveScreen.zapping-rapido.test.tsx` | pass | 3/3; os mesmos 3 falhavam antes do fix (patch revertido na fase Fix) |
| Reprodução na TV física | CH±/↑/↓ em rajada no QN50Q60 | not-run | TV não acionada nesta sessão; é a única que valida AVPlay e o tempo de 600 ms |
| Testes da Live e do player | `npx vitest run src/features/live src/components/PlayerLayer` | pass | 55 arquivos / 373 testes |
| Suíte unitária completa | `npm run test` | pass | 590 arquivos / 3362 testes (fase Fix) |
| Contratos travados | `check-contract-tests.ps1` 027 e 046 | pass | travas íntegras, 5 + 5 testes |
| E2E | `node e2e/run.mjs --only zapping-live-tv,live-paridade-v14,memoria-foco-key-repeat` | pass | 3/3 |
| E2E fora da suíte | `node e2e/player-chrome.mjs` | fail (alheio) | para no Cenário 1 (filme), na navegação de Filmes, antes de qualquer troca de canal |
| Lint / type-check / build | `npm run lint`, `npx tsc -b`, `npm run build` | pass | só avisos herdados no lint |

## Output Excerpts

```
✓ três ↓ seguidos: a faixa acompanha e só o canal final é aberto
✓ CH± continua trocando enquanto o canal escolhido ainda prepara
✓ falha no canal final volta ao canal que tocava antes da rajada, nunca a um intermediário
Test Files  55 passed (55) / Tests  373 passed (373)
3/3 scripts passaram (zapping-live-tv, live-paridade-v14, memoria-foco-key-repeat)
```

## Residual Risks

- O intervalo de repetição das teclas do controle Samsung e o tempo do AVPlay não são simulados; 600 ms pode
  precisar de ajuste (`ZAP_SETTLE_MS`).
- Durante a espera, a faixa mostra o canal escolhido sobre o vídeo do canal antigo — comportamento intencional,
  a confirmar com o usuário na TV.
- `e2e/player-chrome.mjs` está desatualizado (Filmes) e não cobre mais o trecho de canal até ser consertado.

## Recommendation

Segurar como `partial` até a passada na TV física: instalar (`tizen-tv`), tocar um canal, apertar CH+ três vezes
rápido e conferir que a faixa avança e só o último canal carrega; repetir com ↓ e com CH± logo após o canal
começar a carregar. Se aprovado, fechar.
