# Bug Assessment: gerenciador.spec.ts:95 falha na suíte paralela do portal

- **Slug**: playwright-portal-gerenciadorspects95-falha-na-suite
- **Criado**: 2026-10-23
- **Origem**: achado da feature 091 (R-010), reportado pelo usuário como bug a corrigir
- **Veredito**: valid
- **Severidade**: medium (teste instável que impede declarar a suíte do portal verde; não afeta o produto)

## Report

`portal-web/e2e/gerenciador.spec.ts:95` ("sessão encerrada no meio do uso volta à entrada com o ID lembrado e o aviso") falhou em todas as rodadas
(5 de 5, incluindo a deste Assess) da suíte paralela com `--project=default` e passa isolado ou com `--workers=1`. O timeout é no `click` de
"Atualizar estado". `licenca.spec.ts:124` falhou **uma vez**, logo depois de subir o dev server, com "Listas" não aparecendo, e passou em todas as demais
rodadas (inclusive nesta, com o servidor recém-reiniciado).

## Symptom

O teste espera o título "Listas", troca a rota para sempre devolver 401 e clica "Atualizar estado". Nas rodadas paralelas o clique fica preso até o timeout de 30 s.
Esperado: o clique ocorrer e a página voltar a "Conectar à TV" com o ID lembrado e o aviso.

## Reproduction

1. Com o dev server do portal na 5174: `cd portal-web; npx playwright test --project=default` (suíte paralela, 4 workers).
2. `gerenciador.spec.ts:95` falha; `npx playwright test e2e/gerenciador.spec.ts:95 --project=default` passa.

Evidência (`test-results/.../error-context.md` desta rodada): o log da ação diz `locator resolved to <button class="small ghost tv-summary-refresh">` →
`waiting for element to be visible, enabled and stable` → **`element was detached from the DOM, retrying`**; o snapshot da página no fim mostra a tela
**"Conectar à TV"**, com o MAC lembrado (`A0-8C-FD-19-0A-8C`) e a chave vazia. Ou seja, a página **já havia saído** da sessão antes de o clique acontecer.

## Suspected Code Paths

- `portal-web/e2e/gerenciador.spec.ts:95-111` — o teste vira a rota para 401 logo depois de `Listas` aparecer, enquanto as leituras iniciais do painel
  (`TvDataProvider`: `/session/device`, `/configurations`, `/operations`, `/snapshot`) ainda podem estar em voo.
- `portal-web/src/features/shell/TvDataProvider.tsx` e `TvSummary.tsx` — no produto, um 401 em qualquer leitura leva à entrada com o aviso (comportamento correto,
  exatamente o que o teste quer provar).
- `portal-web/playwright.config.ts` — 4 workers contra um único dev server Vite, o que alarga a janela de leituras em voo.

## Root Cause Hypothesis

Condição de corrida **no teste**, não no produto: `Listas` aparece antes de todas as leituras iniciais terminarem. Em paralelo, o app ainda tem leituras em voo
quando a rota é trocada para 401; uma delas recebe 401 e o app já faz o logout esperado, **removendo o botão do DOM antes de o `click` acontecer**. O Playwright
então espera um elemento que não volta. Isolado, as leituras terminam antes da troca e o clique acontece depois. Confiança: **high** (o error-context mostra o botão
desanexado e a página já na entrada; o produto se comporta como especificado). O `licenca.spec.ts:124` não foi reproduzido (1 ocorrência, logo após reiniciar o servidor):
hipótese de partida a frio do Vite sob 4 workers, **confiança baixa**; fica como observação, sem correção especulativa.

## Proposed Remediation

**Preferida**: no teste, só trocar a rota para 401 depois que o app ficar quieto — contar requisições `/portal/v1/` em voo (`request`/`requestfinished`/`requestfailed`) e
esperar que cheguem a zero, além do estado visível já usado ("Editar" da lista). Assim a troca para 401 sempre antecede o clique, e o logout vem do clique (o que o teste quer provar).

**Alternativas**:
- Aceitar que o logout aconteça antes do clique (`click().catch`) — esconde a corrida e deixa o teste provar menos; descartada.
- Subir o timeout ou rodar o arquivo serial — mascara o problema; descartada.

**Files likely to change**:
- `portal-web/e2e/gerenciador.spec.ts`

**Tests to add or update**:
- O próprio teste `:95`, com a espera de quietude; reexecutar a suíte `--project=default` várias vezes (≥ 5) e o arquivo isolado para mostrar estabilidade.

## Risks & Considerations

- Não alterar o produto (`TvDataProvider`, `TvSummary`): o logout por 401 está correto.
- A espera por quietude não pode virar `waitForTimeout`; usar contagem de requisições em voo.
- O `licenca.spec.ts:124` não será "corrigido" sem reprodução; se voltar a falhar, abrir novo assess com o error-context.

## Open Questions

- Nenhuma bloqueante.
