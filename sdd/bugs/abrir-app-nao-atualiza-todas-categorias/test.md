# Bug Verification: Abrir o app não atualiza todas as categorias (tela principal sem os recém-adicionados)

- **Slug**: abrir-app-nao-atualiza-todas-categorias
- **Testado**: 2026-10-09
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Na TV física, com a lista real, o usuário abriu o app depois da instalação via
`tizen-tv` e confirmou o comportamento esperado ("Sim, agora está certo"). Os
recém-adicionados aparecem sem precisar entrar em cada categoria. O sintoma
relatado (Início/vitrines sem os novos filmes e séries ao abrir o app) não
se reproduz mais.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução original na TV | `deploy-tv.ps1` (build + instalação em 192.168.0.2, lançamento confirmado) → usuário abriu o app e usou o Início/vitrines | pass | Veredito do usuário, observado na tela. |
| Testes novos | `prefetchScheduler.renovacao-urgente.test.ts` (4) + `sectionLoader.test.ts` (caso "só avisa a que mudou") | pass | Os 3 que travam o bug falham sem o fix (conferido na fase Fix). |
| Contrato da 038 | `prefetchScheduler.carga-listas.contract.test.ts` | pass | Sem alteração: carga fria segue cedendo à tecla. |
| Regressão direcionada | pré-carga, `sectionLoader`, `sectionRunner`, catálogo, `categoryLoader` | pass | 34 arquivos, 180 testes. |
| Suíte inteira | `npm run test` | pass com ressalva | 6 falhas, todas da feature 066 em andamento (pré-existentes a este fix). |
| Tipos / lint | `npx tsc -b`; `npm run lint` | pass | `architecture: ok` (`prefetchScheduler.ts` 376 ≤ 377). |
| E2E | `npm run test:e2e` + `--only carga-listas` depois do ajuste do cenário 8 | pass | 42/43 na completa. A única falha era o cenário 8, ajustado e aprovado em 1/1. |

## Residual Risks

- Fluidez durante a renovação: o usuário aprovou o comportamento em geral, mas
  a passada não mediu tempos nem memória. Se aparecer travada durante a
  renovação, o ajuste é o preparo (`STAGE_FLUSH_ITEMS`) ou o espaçamento das
  gravações, não voltar a ceder à tecla.
- Lista M3U por URL não foi observada na TV nesta passada.

## Recommendation

Fechar o bug.
