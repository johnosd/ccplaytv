# Handoff — 074-radio-global (sdd-plan → sdd-execute)

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca`. A árvore tem muita mudança alheia a esta feature (portal/licença,
  `CCPlayTv/assets/*`): não incluir nem reverter.
- Stack: `tv-web/` React 19 + TS + Vite (alvo `chrome108`), Dexie, vitest (`dom`/`node`), Playwright, TV Tizen 9 por
  AVPlay.
- Próximo comando: `/sdd-execute 074-radio-global`. Backlog: **Planejada**, 0/48 (o script conta também o checklist de
  release).
- Origem: assessment `sdd/assessments/radio-global-por-pais/` (go, spike na TV 10/10) e ADR-018 (emenda ADR-008 e
  ADR-011 §3).
- Referência de implementação do spike: `spikes/radio-avplay/index.html`, fora do commit. Só de leitura, não é código do
  app.

## O que a feature entrega

- **P1 (US1)**: item **Rádio** na topbar depois de Séries. A tela tem trilha (★ Favoritos, Mais ouvidas no mundo, país
  da TV, países por quantidade) e lista das 100 mais ouvidas. OK toca; a barra "Tocando agora" fica **no topo**, e a
  pessoa segue navegando. Sair da tela para a rádio.
- **P2 (US2)**: segurar OK / tecla amarela favorita. Os favoritos ficam **só no aparelho**, fora do backup e de qualquer
  lista. Tocar um favorito resolve a versão atual por uuid.
- **P3 (US3)**: sem rede/diretório, abre do cache com aviso, ou mostra erro focável.
- Decisões do usuário que fogem do óbvio:
  - a Rádio **não tem topbar própria** (como a Live) e o único jeito de sair é RETURN;
  - favoritos **fora** do backup;
  - **nada pula sozinho** para a próxima estação;
  - a proteção de tela **pode** ligar com a rádio tocando;
  - sem busca, sem parental, sem segundo plano.

## Leitura obrigatória, em ordem

1. `spec.md`: 29 FR, 7 SC, 14 clarificações.
2. `plan.md`: D-001..D-016 (travadas), Constitution Check, R-001..R-009, Estratégia de Testes.
3. `tasks.md`: 6 fases, T001–T036.
4. `logic/diretorio.md`: endpoints e parâmetros exatos, espelho, validação, categorias de erro.
5. `logic/radio-tela.md`:
   - composição em hooks;
   - desenho;
   - trilha/entrada/cache (§3);
   - zonas e teclas (§4);
   - máquina de reprodução (§5);
   - memória (§6);
   - favoritos (§7);
   - integração no app (§9).
6. `data-model.md`: banco Dexie **separado** `ccplay-radio`, cache, `localStorage`.
7. `quickstart.md`: verificação, E2E com mock, passada na TV (gate).
8. `.planning/memory/constitution.md`: Foco, Voltar, Identidade, Progresso Real, Segredos.

## Testes de contrato

- `tv-web/src/lib/radio/radioDirectory.radio-global.contract.test.ts`: 1 teste, Fase 2.
- `tv-web/src/features/radio/RadioScreen.radio-global.contract.test.tsx`: 4 testes. Três são da Fase 3 (abre no país,
  focar não consulta, resposta atrasada) e um da Fase 4 (favorito).
- Rodar (de `tv-web/`):
  `npx vitest run src/features/radio/RadioScreen.radio-global.contract.test.tsx src/lib/radio/radioDirectory.radio-global.contract.test.ts`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 074-radio-global`
- Vermelho confirmado no plan: 4 × `Unable to find an element with the text: Rádio Alfa BR`, 1 × `Error: not implemented`.
- O que os contratos fixam e você precisa respeitar:
  - foco inicial na **primeira estação**;
  - `Escape` da lista volta à trilha **com foco no país atual**;
  - a ordem da trilha é ★, Mundo, país da TV e depois por `stationCount` decrescente;
  - `listStations` e `stationsByUuid` são chamados **com um `AbortSignal`** como 2º argumento;
  - `<section aria-label="Tocando agora">`;
  - tecla amarela no `keydown` favorita sem tocar;
  - `listRadioFavorites()` devolve ids `radio-browser:<uuid>`;
  - parâmetros de busca exatamente `countrycode, hidebroken, order, reverse, limit=100`;
  - mensagem de erro sem URL.
- Travas de outras features que esta pode quebrar:
  - 023/024 (navegação/shell: `TopDestination` e `HomeFocus` não podem mudar de forma, por isso D-002);
  - 049 (paginação);
  - 040 (divisão player/live);
  - 068 (Live sem topbar);
  - 018 (classes da Live).
  - Rodar todas com `npm run test` ao fim de cada fase.

## Stubs criados

- `lib/radio/radioTypes.ts`: **definitivo** (tipos + `radioStationId`).
- `lib/radio/radioDirectory.ts`: `RadioDirectory`, `StationQuery`, `RadioDirectoryError` e `STATION_LIMIT` estão
  prontos; `createRadioDirectory` lança `not implemented`.
- `lib/radio/radioFavorites.ts`: tipo `RadioFavorite` pronto; `listRadioFavorites` lança. Faltam `isRadioFavorite`,
  `toggleRadioFavorite` e `refreshRadioFavorite`.
- `features/radio/RadioScreen.tsx`: props `onBack`, `directory?` e `createAdapter?` prontas; renderiza `div` vazia.
  Em produção, `directory` padrão = `createRadioDirectory()`.
- `features/radio/radioSessionMemory.ts`: só `resetRadioSessionMemory()` (no-op).

## Armadilhas já mapeadas

- **Catraca `feature-to-feature`**: `features/radio` não pode importar `features/shell/AppShell`. Por isso T001 move
  `AppShell` e `HintBar` para `components/` **antes** da tela, e depois roda `--prune`. Não editar a baseline para criar
  exceção.
- **Plano de hardware**: o AVPlay tem `rendersOnHardwarePlane: true`. Nunca usar `PlayerLayer`/`usePlayerSession`/
  `useVideoPlane` na Rádio, ou `:root.video-plane-visible` esconde a tela inteira (R-006).
- **Proteção de tela**: só o hook do `PlayerLayer` a desliga. A Rádio não chama `disableScreenSaver` (FR-018).
- **`<video>` de dev**: o adaptador monta em `#player-surface` ou no `body`; a tela renderiza
  `<div id="player-surface" hidden />`.
- **Topbar por índice**: `e2e/legibilidade-tv.mjs`/`idioma-do-app.mjs` usam `viaTopbar(page, 6)` para Configurações, que
  vira 7. Vários testes não travados contam setas na topbar (R-004). D-003 (item só com `onOpenRadio`) reduz o estrago,
  mas `App*.test.tsx` e as telas que recebem a prop mudam.
- **Rota lazy**: sem `['route-radio', …]` no `vite.config.ts` e `assets/route-radio.js` no
  `CCPlayTv/tizen_web_project.yaml`, o `npm run build:tizen` para no guard (R-009).
- **Estado de módulo entre testes**: adicionar `resetRadioSessionMemory()` ao `afterEach` de `src/setupTests.ts` (T005).
  O contrato também limpa `localStorage` no `beforeEach`.
- **Cache entre testes do mesmo arquivo**: o IndexedDB falso persiste no arquivo, e o cache do BR do 1º contrato serve os
  seguintes. Os contratos já contam com isso: não "consertar" apagando o banco.
- **`.ts` com DOM/IndexedDB**: um teste `.ts` que precise de `window`/`indexedDB` entra em `TESTES_TS_COM_DOM` no
  `vite.config.ts`.
- **i18n**: helper puro recebe `t`/idioma; nomes de estação, tags e nomes do diretório nunca passam pelo catálogo; o
  nome de país vem do código (`Intl.DisplayNames`).
- **PowerShell**: `npm run x -- --flag` perde o `--`. Para E2E com flags, usar `node e2e/run.mjs --only …`.
- **Não testar contra o serviço real** nos E2E automatizados: usar `page.route` (quickstart).

## Pendências do Analyze

- **A-001 MEDIUM**: a spec não pede indicar o recorte "100 mais ouvidas de N"; a constitution (Progresso Real) exige, e
  o plano cobre com D-010. Recomendação: acrescentar um FR à spec (sem reabrir o design).
- **A-002 MEDIUM**: a spec US1-AC7/FR-015 fala em sair "por outro destino da topbar", mas pela D-001 a Rádio não tem
  topbar. Recomendação: ajustar a redação da spec para "RETURN até o Início (único caminho)".
- **A-003 LOW**: o "país configurado na TV" é aproximado pela região de `navigator.languages` (idioma do sistema), não
  pelo país do aparelho. Recomendação: registrar na seção Assumptions da spec.
- **A-004 LOW**: FR-018 (proteção de tela) e FR-028 (tempo limite do favicon) não têm item explícito em T023.
  Recomendação: incluir no teste da tela (`disableScreenSaver` nunca chamado; `PosterArt`/fallback de iniciais).
- **A-005 LOW**: a spec diz "mini-barra" e o plano a põe no topo como "barra Tocando agora". É a mesma coisa;
  recomendação: alinhar o termo na spec.

## Gate de pronto

- Contratos 5/5 verdes e trava íntegra. Contratos de outras features verdes.
- `npx tsc -b`, `npm run lint` (catraca sem exceção nova), `npm run test`, `npm run build`, `npm run build:tizen`.
- `npm run test:e2e` com `npm run dev`, incluindo o novo `radio-global` e o `legibilidade-tv` (0 achados pt/en/es).
- `quickstart.md`, cenários 1–10 no navegador.
- **TV física é gate** de SC-001/SC-004 (T035, skill `tizen-tv`). Fechar sem ela exige decisão explícita do usuário
  registrada em `Riscos e Decisões`.
- Docs no Polish: só backlog (scripts) e `plan.md`. Nada de status no CLAUDE.md.
