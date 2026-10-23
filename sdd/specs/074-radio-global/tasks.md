---
description: "Tasks da feature 074 — Rádio global por país"
---

# Tasks: Rádio global por país

**Input**: Documentos de design de `sdd/specs/074-radio-global/`

**Prerequisites**: plan.md, spec.md, data-model.md, logic/diretorio.md, logic/radio-tela.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend da TV em `tv-web/src/` (todo caminho abaixo sem prefixo é relativo a `tv-web/`).
- Rádio: dados/rede em `tv-web/src/lib/radio/`, tela em `tv-web/src/features/radio/`.
- Navegação em `tv-web/src/navigation/`, topbar em `tv-web/src/features/shell/TopBar.tsx`, moldura em
  `tv-web/src/components/` (depois de T001).
- E2E em `tv-web/e2e/` (registrados em `tv-web/e2e/run.mjs`); empacotamento em `CCPlayTv/tizen_web_project.yaml`.
- Comandos a partir de `tv-web/`; scripts `.planning/…` a partir da raiz.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar o terreno sem mudar comportamento.

- [X] T001 Mover `src/features/shell/AppShell.tsx` → `src/components/AppShell.tsx` e `src/features/shell/HintBar.tsx` →
  `src/components/HintBar.tsx` (com `AppShell.test.tsx`, `HintBar.idioma.test.tsx` e o que mais testar só esses dois).
  Atualizar os imports de `HomeScreen.tsx`, `HomeContent.tsx` (comentário), `liveColumns.tsx`, `liveTrail.ts`,
  `SearchScreen.tsx`, `SettingsScreen.tsx`, `VodCategoryScreen.tsx`, `VodShowcaseScreen.tsx` e comentários que citam o
  caminho antigo. Depois, `node scripts/architecture.mjs --prune` (a baseline só encolhe) (D-012).
- [X] T002 [P] Rota lazy da Rádio no empacotamento: `vite.config.ts` ganha `['route-radio', '/src/features/radio/RadioScreen.']`
  na tabela de nomes; `CCPlayTv/tizen_web_project.yaml` ganha `assets/route-radio.js` (R-009).
- [X] T003 [P] Área i18n `src/lib/i18n/messages/radio.ts` (pt/en/es; prefixo `radio.`), registrada em `pt.ts`/`en.ts`/`es.ts`;
  `shell.nav.radio` em `messages/shell.ts`. pt: `radio.nowPlaying` = "Tocando agora" (contrato 1), "Mais ouvidas no
  mundo", "★ Favoritos" (reusar `live.favoritesStar` se fizer sentido), "100 mais ouvidas de {n}", estados (carregando,
  vazio, erro, sem conexão, desatualizado), ações (Parar, Tentar de novo, Próxima estação, Voltar, Tentar carregar
  países), anúncios de favorito, dicas.
- [X] T004 [P] `src/styles/radio.css` (só tokens V14) importado em `src/main.tsx`.
- [X] T005 [P] `src/setupTests.ts` chama `resetRadioSessionMemory()` no `afterEach` (estado de módulo não vaza entre testes).

**Registro da Fase**:

- Status: concluída (2026-10-15).
- Feito:
  - `AppShell`/`HintBar` (e os dois testes) movidos para `src/components/` por `git mv`, com imports ajustados em 7
    telas. `node scripts/architecture.mjs --prune` levou a baseline de 146 para 129 imports herdados, e também tirou
    exceções que já eram obsoletas.
  - `route-radio` no `vite.config.ts` e `assets/route-radio.js` no yaml.
  - Área i18n `radio` (pt/en/es) + `shell.nav.radio`, registrada em `pt/en/es.ts` e no `areas.test.ts`.
  - `styles/radio.css` importado em `main.tsx`.
  - `resetRadioSessionMemory()` no `setupTests.ts`.
- Contrato: sem contrato nesta fase.
- Testes executados:
  - `npx tsc -b` limpo;
  - `npx vitest run src/components/AppShell.test.tsx src/components/HintBar.idioma.test.tsx src/features/shell src/features/home src/features/search src/features/vod/VodCategoryScreen.test.tsx src/features/live/LiveScreen.test.tsx`
    → 21 arquivos, 254/254;
  - `npx vitest run src/lib/i18n` → 18/18, na 2ª iteração: o `areas.test.ts` exige a área nova na lista dele;
  - `npm run lint` → catraca ok (472 arquivos, 129 herdados), só avisos herdados de outras telas.
- Pendências: nenhuma.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Conector, armazenamento e utilitários de que toda story depende.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `consulta só o espelho descoberto com os parâmetros fixos, descarta estação inválida e trata resposta não-JSON como falha`
  — FR-025/026/027, SC-006.
- Comando: `npx vitest run src/lib/radio/radioDirectory.radio-global.contract.test.ts`

### Implementation

- [X] T006 [P] Implementar `createRadioDirectory` em `src/lib/radio/radioDirectory.ts` (descoberta de espelho,
  requisições exatas, validação, categorias, `reportClick`) seguindo `logic/diretorio.md`. Se passar de 300 linhas,
  separar em `radioMirror.ts`/`radioParse.ts` → contrato: `consulta só o espelho descoberto…`
- [X] T007 [P] `src/lib/radio/radioDb.ts` (Dexie `ccplay-radio`, versão 1: `favorites`, `directoryCache`) e
  `src/lib/radio/radioCache.ts` (`readCache`, `writeCache`, frescor 7 d/6 h) — `data-model.md` §1/§3.
- [X] T008 [P] `src/lib/radio/radioFavorites.ts`: `listRadioFavorites`, `isRadioFavorite`, `toggleRadioFavorite`,
  `refreshRadioFavorite` (`data-model.md` §2).
- [X] T009 [P] `src/lib/radio/countryNames.ts` (`countryDisplayName(code, language, directoryName?)`) e
  `src/lib/radio/tvCountry.ts` (`tvCountryCode(languages?)` a partir de `navigator.languages`) — `logic/radio-tela.md`
  §3.2/§8.

### Testes da Fase

- [X] T010 [P] `src/lib/radio/radioDirectory.test.ts`: redescoberta após `offline`, fallback `de1`, 401/429, mundo sem
  `countrycode`, `byuuid` omitindo inexistente, `reportClick` que falha sem lançar, tags/bitrate/hls/URL insegura.
- [X] T011 [P] `src/lib/radio/radioCache.test.ts` (fresco/vencido) e `radioFavorites.test.ts` (alternar, ordem, retrato).
  Se precisarem de DOM/IndexedDB, entram em `TESTES_TS_COM_DOM` do `vite.config.ts`.
- [X] T012 [P] `src/lib/radio/countryNames.test.ts` / `tvCountry.test.ts` (pt/en/es; código desconhecido; sem região).

**Critério de Conclusão**: `npx vitest run src/lib/radio/radioDirectory.radio-global.contract.test.ts` → 1/1 verde, com
`check-contract-tests.ps1 -Slug 074-radio-global` íntegro. Depois: testes da fase verdes, `npx tsc -b` limpo,
`npm run lint` sem violação nova, e nenhum `console.*`/import de `lib/catalog` em `lib/radio/`.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: concluída (2026-10-15).
- Feito:
  - `radioDirectory.ts` implementado; a normalização ficou em `radioParse.ts`, para respeitar o limite de 300 linhas.
  - `radioDb.ts` (banco `ccplay-radio`) e `radioCache.ts` (fresco 7 d/6 h, vencido legível).
  - `radioFavorites.ts`: `list`/`is`/`toggle`/`refresh` mais `favoriteAsStation`.
  - `countryNames.ts` (`Intl.DisplayNames` com `fallback: 'none'`; `ZZ` cai no nome do diretório) e `tvCountry.ts`.
- Contrato: `npx vitest run src/lib/radio/radioDirectory.radio-global.contract.test.ts` → 1/1 verde, trava íntegra.
- Testes executados:
  - `npx vitest run src/lib/radio` → 4 arquivos, 22/22. Precisou de 2 correções:
    - o `Intl` traduzia `ZZ` como "Região desconhecida";
    - o `InsertType` do Dexie não aceita união discriminada, então o cache virou um registro com campos opcionais.
  - `npx tsc -b` limpo, `oxlint src/lib/radio` limpo e catraca ok (477 arquivos, 129 herdados).
  - Nenhum `console.*` nem import de `lib/catalog`/`lib/portal` em `lib/radio/`.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Ouvir uma estação de um país (Priority: P1) 🎯 MVP

**Objetivo**: Rádio na topbar; trilha de países e Mundo; estações do país; OK toca com a barra "Tocando agora"; sair para.

**Independent Test**: com lista ativa e rede, Início → Rádio → Brasil → tocar, trocar, parar, voltar ao Início, só com o
controle.

### Contrato da Fase

- `abre no país da TV com as estações dele e OK toca a estação focada, mostrando-a em "Tocando agora"` — US1-AC2/AC4.
- `mover o foco pela trilha de países não consulta o diretório nem toca nada` — FR-007, SC-003.
- `a resposta atrasada de um país escolhido antes nunca substitui o país escolhido por último` — FR-014.
- Comando: `npx vitest run src/features/radio/RadioScreen.radio-global.contract.test.tsx -t "abre no país|mover o foco|resposta atrasada"`

### Implementation

- [X] T013 [US1] `src/navigation/appNav.ts`: `AppScreen` `{ name: 'radio' }` e `TopbarItem` `'radio'`; `TopDestination`
  intocado (D-002).
- [X] T014 [US1] `src/features/shell/TopBar.tsx`: prop `onOpenRadio?`; item "Rádio" depois de "Séries" só com a prop,
  inclusive na ordem de foco (`FOCUS_ORDER`), e `currentItem` aceita `'radio'` (D-003).
- [X] T015 [US1] `src/navigation/routeModules.ts` (`RadioScreen` lazy) e `src/App.tsx`: `case 'radio'`; `onOpenRadio` no
  Início (`open` com `from: { name: 'home', focus: { zone: 'topbar', item: 'radio' } }`), no `vodShell` (`switch-top`) e
  em Busca/Configurações, no padrão de cada uma (`logic/radio-tela.md` §9). `src/features/home/HomeScreen.tsx` repassa a
  prop à `TopBar`.
- [X] T016 [US1] `src/features/radio/useRadioCatalog.ts`: países (cache 7 d), trilha ordenada, entrada inicial, `enter`
  com geração + `AbortController`, regra de cache 6 h, estados (`logic/radio-tela.md` §3) → contratos: `abre no país…`,
  `mover o foco…`, `resposta atrasada…`
- [X] T017 [US1] `src/features/radio/useRadioPlayback.ts`: máquina `idle/connecting/playing/failed`, token, sessão
  `createPlayerSession(…, 'channel', { createAdapter })`, timeout 15 s, `reportClick` após `playing`, stop ao desmontar
  (`logic/radio-tela.md` §5) → contrato: `abre no país…`
- [X] T018 [US1] `src/features/radio/NowPlayingBar.tsx`: `<section aria-label={t('radio.nowPlaying')}>`, estados, ações
  Parar / Tentar de novo / Próxima estação, anúncios (§5.3) → contrato: `abre no país…`
- [X] T019 [US1] `src/features/radio/useRadioKeyboard.ts` (zonas `bar/trail/list`, um só `useRemoteNav`, paginação,
  MediaStop) e `src/features/radio/radioColumns.tsx` (trilha com `SideCategoryNav`, lista com `ChannelRow`, "100 mais
  ouvidas de N" — D-010, estados focáveis) (§2, §4) → contratos: `mover o foco…`, `resposta atrasada…`
- [X] T020 [US1] `src/features/radio/RadioScreen.tsx` compõe tudo dentro de `components/AppShell` (barra no slot
  `topBar`, `HintBar`), com `<div id="player-surface" hidden />`. `src/features/radio/radioSessionMemory.ts` completo
  (§6) → contratos: os três da fase.

### Testes da Fase

- [X] T021 [P] [US1] `src/navigation/appNav.test.ts` (ou arquivo novo `appNav.radio.test.ts`): abrir Rádio do Início,
  RETURN volta ao Início com foco no item Rádio, `switch-top` a partir de Filmes.
- [X] T022 [P] [US1] `src/features/shell/TopBar.test.tsx`: sem `onOpenRadio` nada muda; com ela, "Rádio" depois de
  Séries, foco e OK. Ajustar os testes não travados que contam setas na topbar e quebrarem (R-004):
  `HomeContent.test.tsx`, `HomeScreen.test.tsx`, `SettingsScreen.test.tsx`, `VodCategoryScreen.test.tsx`,
  `LiveScreen.test.tsx`, `TopBar.conexao.test.tsx`, `App*.test.tsx`.
- [X] T023 [P] [US1] `src/features/radio/RadioScreen.test.tsx`:
  - restauração por id ao remontar (FR-003);
  - estados carregando/vazio/erro focáveis (FR-004);
  - ←/→ pagina (FR-006);
  - nomes de país em en/es (FR-010);
  - Stop e parar ao desmontar (FR-015/016);
  - falha com "Tentar de novo"/"Próxima estação" sem tocar sozinho e timeout de 15 s (FR-017, D-015);
  - clique só depois de `playing` (FR-019);
  - "100 mais ouvidas de N" (D-010);
  - nenhum `video-plane-visible` (R-006).

**Critério de Conclusão**: `npx vitest run src/features/radio/RadioScreen.radio-global.contract.test.tsx -t "abre no país|mover o foco|resposta atrasada"`
→ 3/3 verdes, com `check-contract-tests.ps1` íntegro. Depois: testes da fase verdes, `npm run test` inteiro verde,
`npx tsc -b`, `npm run lint` (sem exceção nova na catraca) e o cenário 1–5 e 7–8 do `quickstart.md` no navegador.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-10-15).
- Feito:
  - Navegação: `AppScreen`/`TopbarItem` `'radio'` e o tipo `TopbarDestination` (= `TopDestination | 'radio'`); `TopDestination`
    ficou intocado.
  - `TopBar.onOpenRadio` (o item só aparece com a prop) ligado em Início, Filmes/Séries (helper `vodTopbarCallbacks`),
    Busca e Configurações.
  - Rota lazy e `renderRadioRoute` em `routeModules.ts`, encadeada no `default` do `App`.
  - Tela: `useRadioCatalog`, `useRadioPlayback`, `useRadioKeyboard`, `NowPlayingBar`, `radioColumns` e a memória de
    sessão completa.
- Por que mexi em arquivos fora da Rádio: `App.tsx`, `SearchScreen.tsx` e `VodShowcaseScreen.tsx` estavam no teto da
  catraca (R-011).
  - `App.tsx`: zero linha nova.
  - Busca: o `AppShell` reexporta o tipo `HintItem`.
  - Filmes/Séries: 5 props viraram o spread `vodTopbarCallbacks`, e o teto baixou de 753 para 749 linhas.
- Contrato:
  `npx vitest run src/features/radio/RadioScreen.radio-global.contract.test.tsx` → 4/4 verdes. O favorito (Fase 4) já
  passa, porque a base de favoritos entrou junto. Trava íntegra.
- Testes executados:
  - `npx vitest run src/features/radio` → 16/16 em 3 rodadas seguidas. Antes da correção do R-010, o contrato 1 falhava
    sempre que rodava junto com `RadioScreen.test.tsx`: os handlers do `useRemoteNav` chegavam atrasados.
  - `RadioScreen.test.tsx` 12/12. Precisou de 1 correção no próprio teste ("Argentina" também está na trilha).
  - `TopBar.radio.test.tsx` 2/2 e `appNav.radio.test.ts` 2/2.
  - `HomeScreen.test.tsx`: 2 contagens de setas ajustadas (R-004), 9/9.
  - `npm run lint` ok (482 arquivos, 129 herdados).
  - `npm run test` → 3411/3412.
- Pendências:
  - **Flake fora da feature**: `scripts/bench/importBench.test.mjs` ("xmltv: mede as etapas…") falhou 1 vez na suíte
    completa e passou 2/2 isolado. Não importa nada da Rádio. Fica como instabilidade aberta da bancada de importação
    sob carga.

---

## Phase 4: User Story 2 - Guardar e reencontrar estações favoritas (Priority: P2)

**Objetivo**: Segurar OK/amarela favorita; `★ Favoritos` lista e toca a versão atual da estação.

**Independent Test**: favoritar duas estações de países diferentes, ver as duas em `★ Favoritos`, tocar uma,
desfavoritar a outra, reabrir o app e conferir.

### Contrato da Fase

- `favorito é guardado pela identidade da estação e, depois de reabrir, toca a versão atual do diretório` — US2-AC1/AC3,
  FR-020/022/023.
- Comando: `npx vitest run src/features/radio/RadioScreen.radio-global.contract.test.tsx -t "favorito"`

### Implementation

- [X] T024 [US2] `useRadioKeyboard.ts`: `onLongSelect` e `onFavoriteKey` na zona `list` → `toggleRadioFavorite`, estrela
  no `ChannelRow`, anúncio, nunca toca (`logic/radio-tela.md` §7) → contrato: `favorito é guardado…`
- [X] T025 [US2] `useRadioCatalog.ts`: entrada `favorites` lê o banco local (sem rede), com o país em cada linha, vazio
  focável e reconciliação do foco ao desfavoritar → contrato: `favorito é guardado…`
- [X] T026 [US2] `useRadioPlayback.ts`: tocar a partir de Favoritos resolve por `stationsByUuid([uuid], signal)`;
  ausente → falha "indisponível"; diretório fora → `lastStreamUrl`; atualiza o retrato (§5.2) → contrato:
  `favorito é guardado…`

### Testes da Fase

- [X] T027 [P] [US2] `src/features/radio/RadioScreen.favorites.test.tsx`:
  - segurar OK (tempo real, como `LiveScreen.favorites.test.tsx`);
  - `★ Favoritos` vazio focável;
  - estação que saiu do diretório → indisponível e desfavoritar;
  - fallback `lastStreamUrl` com o diretório fora;
  - favoritos sobrevivem a trocar/remover lista (não dependem de `sourceId`).

**Critério de Conclusão**: `npx vitest run src/features/radio/RadioScreen.radio-global.contract.test.tsx` → 4/4 verdes
(os três da US1 continuam), com `check-contract-tests.ps1` íntegro. Depois: testes da fase verdes e o cenário 6 do
`quickstart.md`.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-10-15).
- Feito:
  - T024–T026 entraram junto com a base da US1 e foram conferidos contra `logic/radio-tela.md` §7/§5.2:
    - segurar OK e amarela favoritam sem tocar;
    - `★ Favoritos` lê do banco local e mostra o país por linha;
    - o vazio é focável;
    - tocar resolve por `stationsByUuid` e, com o diretório fora, cai na `lastStreamUrl`.
  - Correção encontrada pelos testes: o plural de "{n} favoritas" (`radio.scope.favorites.one/.other` + `t.plural`).
- Contrato:
  `npx vitest run src/features/radio/RadioScreen.radio-global.contract.test.tsx -t "favorito"` → 1/1 verde (4/4 no
  arquivo). Trava íntegra.
- Testes executados: `RadioScreen.favorites.test.tsx` 5/5 (segurar OK com tempo real, vazio, estação que saiu do
  diretório, fallback de URL, país por linha); `npx vitest run src/features/radio src/lib/i18n` → 39/39.
- Pendências: nenhuma.

---

## Phase 5: User Story 3 - Abrir a Rádio sem rede ou com o diretório fora do ar (Priority: P3)

**Objetivo**: Cache visível com aviso; erro focável sem cache; países indisponíveis sem prender o foco.

**Independent Test**: visitar dois países, cortar o diretório, reabrir e ver os dois com aviso e "Tentar de novo".

### Implementation

- [X] T028 [US3] `useRadioCatalog.ts` + `radioColumns.tsx`: aviso "pode estar desatualizado" com "Tentar de novo"
  quando a busca falha sobre cache vencido; `ErrorState` sem cache; trilha com "Tentar carregar países" quando a lista de
  países falha sem cache (`logic/radio-tela.md` §3).
- [X] T029 [US3] `useRadioPlayback.ts`/`NowPlayingBar.tsx`: sem rede → falha "Sem conexão" sem prender o foco
  (US3-AC3).

### Testes da Fase

- [X] T030 [P] [US3] `src/features/radio/RadioScreen.offline.test.tsx`: os três cenários de aceite da US3 e SC-007.

**Critério de Conclusão**: testes da fase verdes, contratos 5/5 verdes, cenário 9 do `quickstart.md` no navegador.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-10-15).
- Feito:
  - Aviso "pode estar desatualizado" com "Tentar de novo" **focável**. Fica acima da 1ª estação: ↑ entra no aviso, ↑ de
    novo vai à barra, ↓ volta à lista.
  - Erro sem cache e "Tentar carregar países" na trilha já vinham da US1.
  - Falha "Sem conexão" quando `navigator.onLine === false`.
- Contrato: sem contrato nesta fase (os 5 continuam verdes; trava íntegra).
- Testes executados:
  - `RadioScreen.offline.test.tsx` 3/3. Precisou de 1 correção no próprio teste: depois do OK no aviso, o foco volta à
    1ª estação.
  - `npx vitest run src/features/radio` → 24/24 em 2 rodadas.
- Pendências: nenhuma.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, auditoria de legibilidade, empacotamento, TV física, docs.

- [X] T031 `e2e/radio-global.mjs` (novo, registrado em `e2e/run.mjs`): `page.route('**/*.api.radio-browser.info/**')`
  com fixture local (servidores, stats, países, estações, byuuid, POST de clique contado); fluxo do `quickstart.md`
  cenários 1–8; confere que focar a trilha não gera `stations/search`.
- [X] T032 `e2e/legibilidade-tv.mjs`: telas "Rádio — lista", "Rádio — tocando", "Rádio — vazio/erro" em pt/en/es, com o
  mesmo mock de diretório. `viaTopbar(page, 6)` vira 7 (Configurações) aqui e em `e2e/idioma-do-app.mjs`, e o
  comentário do índice é atualizado.
- [X] T033 Rodar `npm run test:e2e` inteiro com `npm run dev` no ar. Corrigir os roteiros que quebrarem por índice ou
  ordem da topbar, de preferência trocando por seletor (R-004). Distinguir flake de falha com `npm run test:e2e:serial`.
- [X] T034 `npm run build` + `npm run build:tizen` (guard do `tizen_web_project.yaml`: listar o que faltar, R-009).
- [X] T035 Passada na TV física pela skill `tizen-tv` (quickstart, "Passada na TV física") — **gate** de SC-001/SC-004.
  Resultado registrado em `plan.md` → `Execution Notes`, dizendo quem viu/ouviu e sem URL de stream.
- [X] T036 Docs: backlog pelos scripts (`update-feature-status.ps1`); `plan.md` (`Estado Atual`, `Arquivos
  Principais`). Nenhum parágrafo de status no CLAUDE.md (regra do próprio arquivo).
- [X] T037 (ad-hoc, achado na T032 — bug anterior à feature, corrigido com autorização do usuário em 2026-10-15)
  `e2e/legibilidade-tv.mjs`: o Vite comercial do trecho do portal recebe `NO_COLOR=1`. No Windows o `picocolors`
  colore a URL mesmo num pipe, e a espera por `http://127.0.0.1:5177` nunca casava: o gate tinha 1 achado fixo
  ("vite comercial não subiu") desde a 071 (R-012). Na T033 o mesmo defeito derrubou `portal-configuracao`,
  `licenca-anual` e `compra-licenca-pix` (`fixture_vite_timeout`). Com nova autorização do usuário, a mesma linha foi
  aplicada aos três.

**Registro da Fase (Polish, parcial)**:

- Status: concluída (2026-10-15).
- Feito:
  - `e2e/radio-global.mjs` (no `SUITE`), com o mock compartilhado `e2e/lib/radioDirectoryMock.mjs`.
  - Rádio em `legibilidade-tv.mjs` (lista, barra, favoritos vazio). O índice 6 do `viaTopbar` continua sendo a
    engrenagem; só o comentário mudou.
  - `build:tizen` com 5 chunks compartilhados novos no yaml (R-013).
  - `NO_COLOR` nos 4 roteiros que sobem Vite próprio (T037, R-012).
- Contrato: `npx vitest run src/features/radio/RadioScreen.radio-global.contract.test.tsx src/lib/radio/radioDirectory.radio-global.contract.test.ts`
  → 5/5 verdes também dentro da suíte completa. Trava íntegra.
- Testes executados:
  - `node e2e/run.mjs --only radio-global` 3/3 rodadas (cerca de 8 s).
  - `node e2e/legibilidade-tv.mjs` → 105 telas pt/en/es, 0 achados.
  - `node e2e/run.mjs` → 48/51. As 3 falhas eram o R-012; com `NO_COLOR=1` passaram (3/3) e, corrigidas nos
    roteiros, 3/3 de novo. Resultado: 51/51, sendo os 3 conferidos à parte, não numa nova rodada inteira.
  - `npm run build:tizen` ok (`route-radio.js` de 20 KB em `CCPlayTv/assets/`).
  - `npx tsc -b` limpo e `npm run lint` ok (482 arquivos, 129 herdados).
  - `npm run test` → 3419/3420.
- Pendências:
  - T035 resolvida: na TV física o usuário confirmou 10/10 estações do Brasil com som e cerca de 2 s até o som. O achado
    visual dos logos (pequenos e cortados no foco) foi corrigido em `radio.css` e confirmado pelo usuário na TV.
  - **Flake fora da feature**: `scripts/bench/importBench.test.mjs` ("xmltv…") falhou nas 2 suítes completas, com
    `Hook timed out in 10000ms` no `afterEach` (`cleanupBenchSources`) sob carga paralela, e passou 2/2 isolado. Não
    importa nada da Rádio. Aguarda decisão do usuário: corrigir ou registrar no backlog.

### Checklist de Release

- [X] Fase 1 (Setup) concluída, com baseline da catraca só encolhendo
- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 074-radio-global` íntegro
- [X] Contratos de **outras** features continuam verdes e íntegros (023/024 navegação, 049 paginação, 040 divisão, 068)
- [X] `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen` verdes (exceto o flake conhecido da bancada XMLTV, fora da feature)
- [X] `npm run test:e2e` verde, com `radio-global` e `legibilidade-tv` (0 achados pt/en/es)
- [X] Nenhum `console.*`/URL em erro em `lib/radio/` e `features/radio/`; nenhum import de `lib/catalog`/`lib/portal` em `lib/radio/`
- [X] Passada `tizen-tv` feita (SC-001 ≥ 8/10, SC-004 medido), ou dispensa explícita do usuário registrada em `Riscos e Decisões` — 10/10 com som, cerca de 2 s (usuário, 2026-10-15)
- [X] `quickstart.md` executado com sucesso — cenários 1–8 e 10 pelo E2E (`radio-global`, `legibilidade-tv` pt/en/es); cenário 9 (diretório bloqueado) por `RadioScreen.offline.test.tsx`; passada na TV feita pelo usuário

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências. T001 antes de T020 (a tela usa `components/AppShell`).
- **Foundational (Phase 2)**: depende do Setup (T003 para os rótulos) e BLOQUEIA todas as user stories.
- **US1 (Phase 3)**: depende da Fase 2. T013 → T014 → T015; T016–T019 → T020.
- **US2 (Phase 4)**: depende da US1 (lista, teclado e reprodução existem).
- **US3 (Phase 5)**: depende da US1; independente da US2.
- **Polish**: depende das stories desejadas. T035 (TV) depois de T033 (E2E), pela constitution.

### Parallel Opportunities

- T002–T005 em paralelo; T006–T012 em paralelo (arquivos diferentes).
- Na US1, T021–T023 em paralelo depois das implementações.
- US2 e US3 podem andar em paralelo depois da US1.

---

## Parallel Example: Foundational

```bash
Task: "T006 [P] radioDirectory.ts"
Task: "T007 [P] radioDb.ts + radioCache.ts"
Task: "T008 [P] radioFavorites.ts"
Task: "T009 [P] countryNames.ts + tvCountry.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 1 → Fase 2 → Fase 3.
2. **PARAR E VALIDAR**: contratos 1–3 + `quickstart.md` 1–5/7–8 no navegador.

### Incremental Delivery

1. US1 (MVP: ouvir) → US2 (favoritos) → US3 (offline) → Polish (E2E, legibilidade, TV).

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 7: Convergence

**Purpose**: Lacunas achadas pelo `sdd-converge` em 2026-10-15. Nenhuma é CRITICAL nem HIGH; os contratos 5/5 continuam
verdes e a trava íntegra.

- [X] T038 [US1] (C-001 · MEDIUM · FR-011, Edge Cases "país fora do diretório"/"último país sumiu", `logic/radio-tela.md` — feito em 2026-10-23: `useRadioCatalog.ts` valida a entrada inicial contra a lista de países (país salvo/da TV ausente → país da TV → Brasil → Mundo; só enquanto a pessoa não escolheu nada) com 4 testes em `RadioScreen.test.tsx`
  §3.2) Em `tv-web/src/features/radio/useRadioCatalog.ts`, validar a entrada inicial contra a lista de países quando ela
  chegar (cache ou rede). Se o código salvo não existir, usar o país da TV; se esse também não existir, BR; se nem BR
  existir, `world`. Reentrar só quando a entrada inicial for inválida, nunca por foco. Teste em
  `tv-web/src/features/radio/RadioScreen.test.tsx` cobrindo "último país sumiu" e "país da TV fora do diretório".
- [X] T039 (C-002 · LOW · FR-028) Favicon sem tempo limite: o `PosterArt` mantém as iniciais visíveis até a imagem — decisão (usuário, 2026-10-23): aceito; o `PosterArt` mantém as iniciais até a imagem carregar e no erro, sem tempo limite para imagem lenta (LOW, FR-028)
  carregar e as mostra de novo no `onError`, mas não desiste de uma imagem lenta. Decidir com o usuário entre aceitar
  (registrar em `plan.md` → `Riscos e Decisões`) ou implementar o tempo limite na Rádio sem mudar o `PosterArt` das outras
  telas.
- [X] T040 [US1] (C-003 · LOW · spec US1-AC7/FR-015 × plan D-001) Emendar `spec.md`: a saída da Rádio é só por RETURN — feito em 2026-10-23: nota inline na `spec.md` (saída só por RETURN até o Início; plan D-001)
  até o Início, porque a tela não tem topbar própria (D-001). Mudança só no texto; o código já segue o plano.
- [X] T041 (C-004 · LOW · Analyze A-001/A-003/A-005) Emendar `spec.md`: — feito em 2026-10-23: notas inline na `spec.md` (recorte "100 mais ouvidas de N", país da TV = região do idioma do sistema, termo "Tocando agora")
  - FR do recorte visível "100 mais ouvidas de N" (D-010; constitution "Progresso e Capacidades São Reais");
  - premissa de que o país da TV vem da região do idioma do sistema;
  - termo "barra 'Tocando agora'" no lugar de "mini-barra".
