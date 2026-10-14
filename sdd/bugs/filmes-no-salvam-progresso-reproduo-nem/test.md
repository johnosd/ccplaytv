# Bug Verification: Filmes não salvam o progresso nem marcam como assistido

- **Slug**: filmes-no-salvam-progresso-reproduo-nem
- **Testado**: 2026-10-10
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Depois de instalar a correção na TV física, o usuário testou entrando num filme/série e respondeu "parece que deu certo". O sintoma original não foi mais visto. A causa exata na TV segue **não observada**, e o usuário vai reabrir o bug se o problema voltar.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix), na TV | usuário assistiu filme/série na TV (192.168.0.2) após `deploy-tv.ps1` e conferiu a retomada | pass | Visto pelo usuário, com o texto "parece que deu certo"; sem relato de aviso `PRG-W-…`. Não foi anotado quanto tempo assistiu nem se testou a marcação de "assistido" até o fim |
| Testes novos/atualizados | `npx vitest run src/lib/player/progressRecorder src/components/ProgressSaveNotice.test.tsx` | pass | gravação com falha e nova tentativa, saída, conclusão, aviso (9 casos novos + contrato da 019) |
| Suite de regressão | `npm run test` | pass | 3172/3173; a única falha (`App.source-access`) é a instabilidade sob carga já registrada; isolada, 3 de 3 verdes |
| E2E de histórico e player | `npm run test:e2e -- --only historico-continuar-assistindo,ciclo-vida-player,serie-foco-episodios,e2e,favoritos` | pass | 5/5 |
| Lint / type-check | `npm run lint`; `npx tsc -b` | pass | arquitetura ok; sem erros |
| Instalação física | `.\.planning\scripts\powershell\deploy-tv.ps1` | pass | mesmo app e certificado, IndexedDB preservado; confirmado por `applist` |

## Output Excerpts

```text
Test Files  528 passed (529) | Tests  3172 passed (3173)   # a falha é App.source-access (instável sob carga)
5/5 scripts passaram em 20s
app_id[8tZqMtwANL.CCPlayTv] install completed
```

## Residual Risks

- **Causa não confirmada**: a correção torna a falha visível, reintenta e espera a escrita, mas ninguém viu o código de uma falha real; não se sabe qual das três mudanças resolveu, nem se o problema era de armazenamento na TV.
- A validação foi visual e informal ("parece"): não ficou registrado o tempo assistido nem o caso "assistir até o fim e marcar como assistido".
- Se a causa for intermitente (armazenamento da TV cheio ou instável), o problema pode voltar; agora ele deve aparecer com um código `PRG-W-…` na tela por 9 s.
- `App.source-access.test.tsx` continua instável sob carga (anterior a esta correção).

## Recommendation

Fechar. O usuário vai reabrir se o problema reaparecer; nesse caso, anotar o código `PRG-W-…` do aviso (ou a ausência dele) e rodar o Assess de novo com essa evidência.
