# Handoff — 077-redesenho-portal-web

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca` (muitas mudanças não commitadas de outras features — **não reverter nada fora desta**; `portal-web/src/lib/i18n/index.ts` já tem edições da 076).
- Stack: `portal-web/` React 19 + Vite 8 (sem router, sem UI kit, sem jsdom), `api/` FastAPI + Firestore, `tv-web/` React + Vitest; foco próprio na TV.
- Próximo comando: `/sdd-execute 077-redesenho-portal-web`. Backlog: **Planejada**, 0/58 (48 tarefas + 10 itens do checklist de release).
- Continua a linha 075/076 (Portal & licença na TV); aqui é o **site** (`portal-web`). O `README.md` e a constitution foram editados fora das sessões de código; releia `.planning/memory/constitution.md` (1.14.1) antes da Fase 6.

## O que a feature entrega

- **US1 (P1)**: entrada que **lembra o último ID** (nunca a chave) + casca com **3 destinos** (Listas, Licença, Ajustes), barra inferior `< 960 px` e menu lateral `≥ 960 px`, **resumo fixo da TV**; Revendedores e Recarregar saem; Ajustes agrupa Backup, Código de recuperação, Recuperar acesso, Ajuda e Sair.
- **US2 (P1)**: Listas em cartões com selo (**Na TV / Aguardando a TV / Erro**); **Reenviar só com Erro, Cancelar envio só com pendente**, Editar/Excluir sempre; Adicionar sempre visível; formulário em coluna única; excluir com **Sim, excluir**; mensagem "Enviado — na TV, aperte Atualizar".
- **US3 (P2)**: Licença em **um cartão e um botão**; o aceite é a frase **"A licença será ativada na TV {ID}."** (sem caixa a marcar — o ID na frase substitui a conferência que a caixa fazia, R-003).
- **US4 (P3)**: **chave TMDB pelo portal** (única capacidade nova): portal → serviço (cifrada, uma pendente por TV) → TV (no Atualizar de listas, `saveTmdbKey`) → resultado (`applied|rejected|retry`). O portal **nunca** mostra a chave; estados: não configurada, configurada na TV, aguardando, aplicada, recusada. Exige **ADR-020 + constitution 1.15.0 antes de qualquer código**.
- **US5 (P4)**: Backup (ver resumo e excluir com confirmação) e demais itens de Ajustes com descrição.

## Leitura obrigatória, em ordem

1. `spec.md` — stories, FR-001..020, SC-001..008, Clarifications.
2. `plan.md` — D-001..D-014, Constitution Check, R-001..R-010, estratégia de testes.
3. `logic/shell-responsivo.md` — breakpoints, navegação por estado + `history`, resumo da TV, tabela de estados de integração, `SETTINGS_ITEMS`, login, licença, textos novos.
4. `logic/tmdb-estado.md` — tabela de prioridade do estado da chave e formato v3/v4.
5. `data-model.md` e `contracts/portal-api-tmdb.md` — documento `integrations/tmdb`, campo `integrations` no snapshot e as rotas (navegador e TV).
6. `tasks.md` — T001..T048 por fase.
7. `quickstart.md` — comandos e cenário.
8. `.planning/memory/constitution.md` — "Segredos…" (itens (a)–(i)); `sdd/adr/ADR-013/016/017` e `docs/portal/operacao.md`.

## Testes de contrato (5, todos TS — o script de trava só conta `it(`/`test(`)

| Arquivo | Fase |
| --- | --- |
| `portal-web/src/features/session/lastDevice.redesenho-portal-web.contract.test.ts` | 3 |
| `portal-web/e2e/shell.redesenho-portal-web.contract.spec.ts` | 3 |
| `portal-web/e2e/listas.redesenho-portal-web.contract.spec.ts` | 4 |
| `portal-web/src/features/settings/tmdbStatus.redesenho-portal-web.contract.test.ts` | 6 |
| `tv-web/src/lib/portal/tmdbRemote.chave-tmdb-pelo-portal.contract.test.ts` | 6 |

- Rodar: `cd portal-web; npx vitest run src/features/session src/features/settings`; (com `npm run dev`) `npx playwright test e2e/shell.redesenho-portal-web.contract.spec.ts e2e/listas.redesenho-portal-web.contract.spec.ts`; `cd tv-web; npx vitest run src/lib/portal/tmdbRemote.chave-tmdb-pelo-portal.contract.test.ts`.
- Trava (da raiz): `powershell -NoProfile -ExecutionPolicy Bypass -File .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 077-redesenho-portal-web`.
- **Outras travas que esta feature NÃO pode quebrar**: nenhuma contrato de `tv-web` das features 069–076 é tocado; o passo novo do agente (`portalAgent.ts`) e `portalSync.ts` têm testes/contratos existentes — rode `npx vitest run src/lib/portal` antes e depois de T030. As specs antigas do portal (`bootstrap`, `configuracao`, `gerenciador`, `licenca`, `recuperacao`) **não são contrato** e devem ser reescritas por fase (T011, T018, T023).

## Stubs criados

- `portal-web/src/features/session/lastDevice.ts`: três funções `throw new Error('not implemented')` (T006 implementa).
- `portal-web/src/features/settings/tmdbStatus.ts`: tipos finais + `resolveTmdbView` não implementada (T031).
- `tv-web/src/lib/portal/tmdbRemote.ts`: tipos finais (`RemoteTmdbInstruction/Ack/Ports`) + `applyRemoteTmdb` não implementada (T029); a fábrica de portas HTTP entra aqui na mesma task.

## Armadilhas já mapeadas

- **Contratos de UI são Playwright com `page.route`**: precisam do servidor no ar (`cd portal-web; npm run dev`, 5174, como a suíte atual) e fixam **nomes acessíveis e papéis**: `nav` "Principal" com 3 itens `a, button` (`Listas`, `Licença`, `Ajustes`), região "Resumo da TV", lista "Ajustes" com itens que **começam** com `Backup`, `Código de recuperação`, `Recuperar acesso`, `Ajuda`, `Sair`, `article` com o nome da lista, botões `Adicionar lista`/`Editar`/`Excluir`/`Reenviar`/`Cancelar envio`/`Sim, excluir`, `Usar outra TV`, selos de texto `Na TV`/`Aguardando a TV`/`Erro`, status contendo `na TV, aperte Atualizar`. Mantenha os rótulos atuais do login e do formulário (`Endereço MAC da TV`, `Chave do dispositivo`, `Conectar`, `Nome da lista`, grupo `Tipo de lista`/`M3U por URL`, `URL da lista M3U`, `Enviar para a TV`).
- **Geometria fixada**: a 360 px a barra encosta no rodapé (±2 px) e cada item tem ≥ 44 px; a 1280 px o menu fica à esquerda (`x ≤ 1`), `< 320 px` de largura e `≥ 400 px` de altura; sem rolagem horizontal. Use um **único** `<nav>`.
- **`portal-web` não tem jsdom**: não adicione dependência; lógica em módulos puros (Vitest `node`) e UI por Playwright (D-013).
- **Script de trava só conta `it(`/`test(`**: testes Python do serviço não podem ser travados — T034 os escreve como testes comuns (emulador Firestore).
- **URL não muda** na navegação (`history.pushState` com estado, sem caminho novo): o servidor só serve `/`. `main.tsx` consome o fragmento do QR **antes** de renderizar e trata `?checkout=return`.
- **`rememberDevice` só depois de sessão obtida** (manual **e** QR, `takeEntry(kind:'device')`); nunca com a chave; Sair mantém o ID.
- **`useDashboard`/`useTvSummary` substituem os timers** de `SourceManager`/`LicensePage`; não deixe dois pollers.
- **Excluir lista reaproveita o `operationId` em falha de rede** (padrão de `SourceManager.remove`); mantenha.
- **Chave TMDB**: o `key` só existe no `PUT`, na cifra, no `GET` da TV e em `saveKey`; nenhum ack/log/erro/DOM/`localStorage`. `ack` com `retry` **não** apaga o envelope. Operação de época diferente ou vencida é inexistente. A TV só aplica no **Atualizar de listas**, entre `pull` e `snapshot`.
- **Snapshot**: `integrations` é opcional (TV antiga = "desconhecido"); o `SnapshotInput`/`SnapshotDocument` são `extra=forbid`, então o campo precisa ser declarado nos dois.
- **CSS legado**: `styles.css` (≈ 37 KB) convive até o Polish; migre por tela e remova as regras mortas; só tokens, `min-width`, sem literais de cor/raio.
- **Emulador Firestore**: `api/tests/portal/conftest.py` pula tudo sem `PORTAL_TEST_FIRESTORE=1`; `portalStack.mjs` do `tv-web/e2e` usa as portas 8085/3001/5174/5176 — não rode a pilha local e os testes do emulador juntos.
- **Flakes conhecidos**: `carrosseis-filmes-series` e `blockMemo.test.ts` (tv-web) já falharam isolados em suíte cheia; reexecute isolado antes de culpar esta feature.

## Pendências do Analyze

- A1 (MEDIUM) — Lembrar o ID também na entrada **pelo QR** (US1-AC3) não tem contrato nem tarefa de teste própria. Recomendação: em T011 acrescentar ao `bootstrap.spec.ts` o caso "entra por `#id=…&key=…`, sai, volta e o ID está preenchido".
- A2 (MEDIUM) — SC-001/SC-003/SC-004/SC-005 medem "toques", mas nenhum teste os conta. Recomendação: em T042 (`layout.spec.ts`) contar interações (cliques/foco) nos fluxos de adicionar lista, comprar, TMDB e excluir backup.
- A3 (MEDIUM) — R-001 é o item de maior risco (exceção nova de segredos). Recomendação: o usuário revisar o texto da ADR-020 e da emenda (T024/T025) **antes** de o executor seguir para T026.
- A4 (LOW) — FR-017 (estados de carregamento/vazio/erro com ação) e FR-018 (códigos de erro não secretos) não têm task própria. Recomendação: cobrir no `layout.spec.ts` (T042) e na revisão de segredos (T047).
- A5 (LOW) — A spec cita "último contato"; o plano o define como `snapshot.capturedAt` (a hora que a TV informou), não a última requisição. Aceito (`logic/shell-responsivo.md` §3); não vira task.

## Gate de pronto

- Contratos 5/5 verdes + trava íntegra; cada fase fecha com `check-contract-tests.ps1`.
- Portal: `npx vitest run`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npx playwright test` (com `npm run dev`; nas 4 larguras via `layout.spec.ts`).
- Serviço: `uv run pytest tests/portal -q` (emulador) e `uv run ruff check .`.
- TV: `npm run lint`, `npx tsc -b`, `npm run test`, `npm run build`, `node e2e/run.mjs`.
- `quickstart.md` executado; revisão de segredos (T047); docs no Polish: `docs/portal/operacao.md`, `portal-web/README.md`, `CLAUDE.md` (ADR-020), backlog por script.
- TV física: **fora do gate** (a TV não ganha tela nova).
