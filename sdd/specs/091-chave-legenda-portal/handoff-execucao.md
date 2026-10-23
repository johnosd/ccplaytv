# Handoff de execução — feature 091 (Chave de legenda pelo portal)

## Atualização — fim da Fase 5 (2026-10-23)

Este checkpoint prevalece sobre o retrato da Fase 3 abaixo. `tasks.md` e `plan.md` continuam sendo a documentação viva.

- O usuário autorizou "modo contínuo até concluir fase 5". Fases 4 e 5 concluídas; backlog **35/49 tarefas**,
  **Em Execução**. Parar aqui; Fase 6/T031–T036 precisa de novo pedido. Nada commitado, nenhuma instalação na TV.
- T024/T028 conferidas sem reescrita: completados "Remoção pendente" e a explicação sem chave, em pt/en/es.
- T025: motivos do ack por fornecedor na seção Legendas, via `subtitleKeyFeedback.ts` (só em memória por banco,
  sem chave/operação/persistência). Nova tentativa e correção local limpam avisos antigos; recusa/retry não aparecem
  junto de um resumo genérico de sucesso/sem novidades. A chave anterior permanece intacta.
- T026/T027: substituição enquanto pendente, idempotência/ack atrasado, retry sem trocar envelope nem renovar os
  sete dias; TV antiga e transições offline → pendente → aplicada; operationId novo só quando a chave muda.
- T029/T030: remoção por fornecedor nas rotas locais reais (pedido → pull → ack → snapshot), IndexedDB e seção da TV;
  sem `saveSubtitleKey` nem chamada ao fornecedor; chave do outro fornecedor preservada; confirmação no portal e
  nenhuma operação sem chave.
- Verificação: TV **3858/3858** (716 arquivos); após último ajuste do resumo, 18/18 testes afetados. Serviço **204/204**
  com emulador + ruff limpo. Portal **37/37** unitários, **11/11** E2E de legendas. TV E2E
  `node e2e/run.mjs --only 'legendas-externas,legibilidade-tv,teste-conexao-tv'` → **3/3**. Tipos/lint/build TV e portal
  exit 0 (avisos de lint/chunk da TV continuam); guarda Tizen vazia nos dois sentidos; travas 029/041/042/077/090/091 íntegras.
- **Achado fora do escopo / R-010:** portal completo `npx playwright test` → **64 passaram, 4 pulados, 1 timeout** em
  `gerenciador.spec.ts:95` (sessão encerrada, botão sai do DOM durante o clique). Passa isolado (1/1), continua sendo
  flake aberto e **não** baseline aceito. Arquivo preservado; decisão solicitada ao usuário para registrar depois ou
  corrigir como desvio, ainda pendente. Não declarar o Playwright completo verde.
- T031 (E2E integrado de legendas), T032 (novos estados na legibilidade), T033/T034/T035 e **G-2/T036** continuam abertos.
  Não confundir os testes por camada da remoção com a pilha integrada única que a T031 exige.

## Retrato anterior — fim da Fase 3 (contexto histórico)

Escrito em 2026-10-23, ao fim da **Fase 3**. Substitui, para quem vai *executar*, a leitura do `handoff.md` (que é o
retrato do fim do planejamento e continua válido para contexto). Em conflito, valem `tasks.md` e `plan.md`.

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca`. **Nada foi commitado** (≈65 arquivos alterados/novos). Não commite sem o
  usuário pedir; mensagens de commit terminam com a linha de coautoria do ambiente.
- Stack: TV = React 19 + Vite (Tizen 9, Chromium 120, `file://`); portal = `portal-web/` (React 19 + Vite) + serviço
  FastAPI em `api/app/portal/` (Firestore).
- Backlog: 091 "Em Execução", **23/49 tarefas**. Fases 1, 2 e 3 concluídas (Registro da Fase preenchido em `tasks.md`).
- **Próximo passo:** Fase 4 (US2), T024 em diante. O usuário pediu "modo contínuo **até a fase 3**": a Fase 3 acabou e o
  assistente parou para perguntar. **Pergunte se segue para a Fase 4 e em que modo** (pausado ou contínuo) antes de começar.
- Comando: `/sdd-execute sdd\specs\091-chave-legenda-portal\tasks.md` (ler `plan.md` → `## Estado Atual` e `PRÓXIMO:`).

## O que a feature entrega

Chave BYOK de legenda (OpenSubtitles e SubDL) colada no portal (Ajustes → Chaves de legenda), cifrada no serviço (uma
pendente por TV e por fornecedor, 7 dias), buscada pela TV **só no Atualizar**, testada no fornecedor antes de gravar
(`saveSubtitleKey`, `chosen=true`), ack mínimo `applied|rejected|retry`. Decisões do usuário que contrariam o óbvio:
**sem "cancelar envio"** e **sem "Usar o padrão" pelo portal**; **sem confirmação na TV**; envio **não exige licença**; o
Atualizar do card TMDB aplica TMDB + legendas, a seção Legendas tem Atualizar próprio só de legendas; TV antiga → "Estado
desconhecido". Mesma sessão e mesmo molde da chave TMDB (feature 077, ADR-020).

## Leitura obrigatória, em ordem

1. `tasks.md` (Registro das Fases 1–3 e Fases 4–6) e `plan.md` (Estado Atual, Execution Notes, Riscos R-001..R-008, Cuidados).
2. `logic/chave-legenda-portal.md` §1–§7 (serviço, rotas, snapshot, aplicação na TV, agente, portal §6/§6.1 rótulos, desempenho).
3. `contracts/portal-api-legendas.md`, `data-model.md`, `quickstart.md` (A, B1–B13, C1–C4).
4. `.planning/memory/constitution.md` 1.17.0 (exceção (m)) e `sdd/adr/ADR-022-chave-legenda-pelo-portal.md`.
5. Molde: `tv-web/src/lib/portal/tmdbRemote.ts`, `portal-web/src/features/settings/TmdbPage.tsx`.

## Testes de contrato (5 casos travados — **proibido editar**)

| Arquivo | Casos |
| --- | --- |
| `api/tests/portal/test_subtitle_keys_contract.py` | 1 (conta 0 no script; exige emulador, senão **pula**) |
| `tv-web/src/lib/portal/subtitleKeysRemote.chave-legenda-portal.contract.test.ts` | 2 |
| `tv-web/src/lib/portal/portalAgent.chave-legenda-portal.contract.test.ts` | 1 |
| `portal-web/src/features/settings/subtitleKeyStatus.chave-legenda-portal.contract.test.ts` | 1 |

Todos **verdes hoje**. Integridade: `powershell -File .planning\scripts\powershell\check-contract-tests.ps1 -Slug 091-chave-legenda-portal`
(exit 0). Travas de outras features que esta pode quebrar (todas íntegras agora): 029, 041, 042, 077, 090.

## O que já existe (e muda o tamanho das Fases 4 e 5)

A página do portal da Fase 3 já cobre **boa parte** de T024 e T028; não reescreva, só verifique e teste o que falta:

- `portal-web/src/features/settings/SubtitleKeysPage.tsx`: estados `pending` (com `needsRetry`), `rejected` (`refused` /
  `invalid_format`), `limited`, `unknown`; Substituir reaproveita o `operationId` após falha de rede; Remover com
  `DeleteDialog` por fornecedor; "Remoção enviada…"; **sem** cancelar envio.
- `portal-web/e2e/subtitulos.spec.ts` (9 testes) já cobre: ordem em Ajustes, 3 toques (SC-001), envio nos dois fornecedores,
  estados da TV, "Estado desconhecido", nova tentativa, formato inválido, remover com confirmação, falha de rede.
- Serviço: 5 testes em `api/tests/portal/test_subtitle_keys_routes.py` (retry/recusa por fornecedor, expiração/época, cifra por
  fornecedor, rotas/limites/caplog, snapshot com TV antiga).
- TV: `subtitleKeysRemote.ts` (aplica/remove), `portalAgent.ts` (escopo `subtitles`), `integrationSteps.ts`,
  `snapshotPublisher.ts` (`integrations.subtitles`, recuo do 422), `useRefreshAction.ts`, linha "Atualizar" via
  `integrationRows(hasPortal)` em `features/settings/integrationsModel.ts`.

Portanto: T024/T028 = conferir lacunas contra `logic §6.1` e marcar; T026/T027/T030 = **testes adicionais** que ainda faltam
(serviço: substituir enquanto pendente, `retry` mantém envelope; portal: vitest do que não está no Playwright; TV: `remove` só do
fornecedor pedido com `saveKey` nunca chamado — o `subtitleKeysRemote.http.test.ts` já tem um caso de remover, estenda se faltar);
T025 = mostrar na seção Legendas da TV o motivo do ack (`retry` offline/limite → "tentar de novo depois"; `rejected` com motivo,
sem a chave) em `messages/subtitles.ts` + `SubtitleKeysSection.tsx` — **isto não foi feito**.

## Armadilhas já mapeadas

- **Ratchet de linhas (300)**: `tv-web/src/lib/i18n/messages/portal.ts` está no teto (297); texto novo da TV vai em
  `messages/subtitles.ts`. `catalogApi.ts` também está no teto.
- **Linhas da aba Integrações**: nunca use contagem fixa de ↓ em teste/E2E; ande até o foco chegar no alvo. A linha "Atualizar"
  das legendas só existe com `portalSurfacesVisible()` (build base sem portal a esconde, FR-011).
- **Pacote Tizen**: depois de qualquer mudança de import, rode a guarda (`findUnlistedFiles` **e** `findStaleDeclared` de
  `tv-web/scripts/tizenFiles.mjs` contra `tv-web/dist` e `CCPlayTv/tizen_web_project.yaml`). Já removi `assets/subtitleCredentials.js`
  do yaml porque o build deixou de emiti-lo. `npm run build:tizen` reescreve arquivos rastreados de `CCPlayTv/`: prefira `npm run build`
  + a guarda.
- **E2E da pilha real** (`tv-web/e2e/chave-tmdb-pelo-portal.mjs`) **não está no `SUITE`** de `e2e/run.mjs`: rode direto, com as portas
  8085/5174/3001/5176 livres (mate meu dev server do portal na 5174 antes) e
  `CCPLAY_EMULATOR_JAVA_HOME="C:/Program Files/Eclipse Adoptium/jre-21.0.12.101-hotspot"`. Java padrão do sistema segue 17 (Tizen Studio).
- **Serviço**: testes com `PORTAL_TEST_FIRESTORE=1 uv run pytest tests/portal --basetemp=<scratchpad>`; emulador com Java 21 só no
  processo. Pare o emulador (porta 8085) ao terminar. `ruff check .` deve ficar limpo.
- **Playwright do portal** exige o dev server na 5174 já de pé (`npm run dev` em `portal-web/`).
- **Heredocs com aspas/acentos no shell quebram**: escreva scripts `.py` com a ferramenta Write e execute-os.
- **Segredos**: nunca imprimir `.env`, `docs/m3u/dados.md` ou `staging.env.yaml` (nem "listar nomes" dele — imprime o PEM). Chaves de teste
  são fictícias e jamais devem aparecer em ack, log, erro, DOM, URL ou storage.
- **Perguntar antes de instalar qualquer coisa na TV** (`deploy-tv`/`tizen-tv`/sonda). O usuário **recusou abrir nova janela de TV agora**.
- `TmdbPage.tsx`/`tmdb_integration.py`/`tmdbRemote.ts` estão em produção: não os altere além do estritamente necessário.

## Pendências

**Da 091**
- Fase 4: T024–T027. Fase 5: T028–T030. Fase 6: T031–T036.
- T031 (E2E da TV `chave-legenda-portal.mjs`, Vite comercial próprio, portal simulado por `context.route`, fornecedores simulados;
  incluir no `SUITE`) cobre a lacuna "sem E2E de pilha real para legendas" (B5/B6) — o fornecedor falso precisa contornar o preflight
  de rede da TV.
- T034 revisão de segredos (inclui `tv-web/dist`, `CCPlayTv/`, `portal-web/dist`, caplog).
- T036 **G-2 (passada na TV física)** — sem janela agora; **a feature não fecha enquanto não for feita**. Registrar em `evidencias/`.
- G-3 (aceitação do BYOK pelos fornecedores) é só pendência de oferta.
- O Checklist de Release no fim de `tasks.md` ainda tem as Fases 1–3 desmarcadas: marcar quando coerente.
- Achados do Analyze ainda abertos: A1 (FR-013/SC-007 sem tarefa; cobrir pela suíte da 090 verde e por construção), A4 (texto do botão — ok pela leitura por fornecedor).
- Notas de implantação: implantar o **serviço antes** da TV (TV nova + serviço antigo é tolerado pelo recuo do snapshot, mas o ideal é nessa ordem).

**Da 090 (fora desta feature, não fazer sem pedido)**
- T042 parcial: faltam C2/C5/C6/C7 na TV e atribuir R-024 (sem janela de TV). `sdd-converge` da 090 pendente.
- Flake pré-existente "Maximum update depth" em `carrosseis-filmes-series` (E2E): sugerido bug próprio, não aberto.

## Gate de pronto (resumo)

1. Contratos 5/5 verdes + `check-contract-tests.ps1` íntegro (091, 077, 090 e as demais).
2. TV (`tv-web/`): `npx tsc -b`, `npm run lint` (sem subir `architecture-baseline.json`), `npm run test`, `npm run build`, guarda do Tizen vazia,
   `npm run test:e2e` completo (dev server na 5173).
3. Portal (`portal-web/`): `npx tsc -b`, `npm run lint`, `npx vitest run`, `npm run build`, `npx playwright test` (dev server 5174).
4. Serviço (`api/`): `PORTAL_TEST_FIRESTORE=1 uv run pytest tests/portal`, `uv run ruff check .`.
5. Documentos: `tasks.md` (Registro de cada fase + checklist), `plan.md` (Estado Atual, Execution Notes, PRÓXIMO, Arquivos Principais),
   `update-feature-status.ps1 -Slug 091-chave-legenda-portal`; docs do Polish (T033: `docs/portal/operacao.md`, regra curta no `CLAUDE.md`, `portal-web/README.md`).
6. A passada na TV física (T036) é **gate de fechamento**; sem ela, status final é "implementada em código, G-2 aberto" e nunca "entregue".
