---
description: "Tasks da feature 057 — Top 10 da semana e Dica (TMDB) em Filmes, Séries e Início"
---

# Tasks: Top 10 da semana e carrossel "Dica" (TMDB) em Filmes, Séries e Início

**Input**: Documentos de design de `sdd/specs/057-top10-dica-tmdb/`

**Prerequisites**: plan.md, spec.md, `logic/descoberta.md` (obrigatório ler), `contract-tests.lock` (5 contratos já escritos e travados)

**Organization**: Tasks agrupadas por user story. Os 5 contratos já existem e estão travados: o executor só os faz passar, nunca os edita.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1..US4)
- Caminhos relativos à raiz do repositório

## Path Conventions

- Frontend em `tv-web/` (React 19 + TypeScript + Vite); código em `tv-web/src/`, E2E em `tv-web/e2e/`.
- Módulos de dados/regras em `tv-web/src/lib/metadata/`; hooks em `tv-web/src/features/catalog/catalogApi.ts`; telas em `tv-web/src/features/vod/` e `tv-web/src/features/home/`.
- Documentação em português em `sdd/specs/057-top10-dica-tmdb/`. Comandos de teste a partir de `tv-web/` (`npx vitest run …`); no PowerShell use `node e2e/run.mjs --only X --jobs 1` (o npm engole `--only`).
- `src/lib/` nunca importa de `src/features/` (D-014).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Linha de base e confirmação do ponto de partida.

- [X] T001 Registrar a linha de base (suíte da área: só os 5 contratos novos vermelhos; `tsc -b` exit 0; `npm run lint` exit 0 com avisos preexistentes; medição de tempo de abertura fica para T031, comparando com/sem chave TMDB no mesmo código): `npx vitest run src/lib/metadata src/features/vod src/features/catalog src/features/home src/lib/comingSoon.test.ts` (só os 5 contratos novos vermelhos), `npx tsc -b`, `npm run lint`; medir o tempo de abertura do Início e de Filmes na lista real (como `e2e/carga-listas-real.mjs`, ou script no scratchpad) para comparar em SC-008/R-003
- [X] T002 Confirmar o ponto de partida: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` íntegro (5/5) e os 5 contratos vermelhos pelo motivo certo (`not implemented`/asserção)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Camada de dados, regras puras, hooks e textos — tudo que as telas consomem. Nenhuma tela é tocada aqui.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `matchDiscoveryTitles/selectTop10: …` (`discoveryRules.top10-dica-tmdb.contract.test.ts`) — US1/AC2, AC3, AC7, FR-002..FR-004, FR-010, FR-011
- `selectTip: …` (mesmo arquivo) — US2/AC1..AC3, AC6, FR-005..FR-008
- `loadWeeklyTrending: …` (`tmdbDiscovery.top10-dica-tmdb.contract.test.ts`) — US1/AC1, US4/AC1..AC3, FR-002, FR-003, FR-015..FR-017, Constitution: Segredos
- Comando: `npx vitest run src/lib/metadata/discoveryRules.top10-dica-tmdb.contract.test.ts src/lib/metadata/tmdbDiscovery.top10-dica-tmdb.contract.test.ts`

### Implementation

- [X] T003 [P] Em `tv-web/src/lib/catalog/db.ts`: tipo `DiscoveryCacheRecord` (`logic/descoberta.md` §2), `discoveryCache!: EntityTable<DiscoveryCacheRecord, 'id'>` e `this.version(16).stores({ discoveryCache: 'id' })` (sem `.upgrade()`); em `tv-web/src/lib/metadata/tmdbKeyRepository.ts` `removeTmdbKey` passa a limpar `discoveryCache` na mesma transação (FR-017/R-009)
- [X] T004 Implementar `tv-web/src/lib/metadata/tmdbDiscovery.ts` por `logic/descoberta.md` §1–§2: `weekKey` (semana ISO local), mapeamento filme/série, `loadWeeklyTrending` (10 posições, cache por semana), `loadTipPool` (8 páginas em lotes de 4, página 1 obrigatória, cache por dia), idioma na chave, `inFlight`, `markTmdbState` como `tmdbPeople.ts`, zero requisição sem chave/recusada/pausada, nunca lança e nunca loga → contrato: `loadWeeklyTrending: …`
- [X] T005 [P] Implementar `tv-web/src/lib/metadata/discoveryRules.ts` por `logic/descoberta.md` §3–§5: `versionTier`, `matchDiscoveryTitles` (mapa por chave, memo por registro, um registro por título), `selectTop10`, `selectTip` (filtros, mínimo, chave de Efraimidis–Spirakis com `fnv1a32` local) → contrato: `matchDiscoveryTitles/selectTop10: …` e `selectTip: …`
- [X] T006 Implementar `useWeeklyTop10` e `useDailyTip` em `tv-web/src/features/catalog/catalogApi.ts` (substituem os stubs) por `logic/descoberta.md` §6: query do TMDB (`['tmdb-discovery', 'trending'|'pool', kind, language]`, `staleTime` 30 min), índice pela chave compartilhada `['catalog-search-index', sourceId, kind]` só com títulos do TMDB, `select` estável com `now` fixado por montagem, `invalidateQueries(['tmdb-status'])` após o carregador; retorno com `coveredCategories`/`totalCategories`
- [X] T007 [P] i18n em `tv-web/src/lib/i18n/messages/vodShowcase.ts` (pt/en/es, `pt` é a base): `showcase.row.tipMovies`, `showcase.row.tipSeries`, `showcase.source.tmdb`, `showcase.eyebrow.top10`, `showcase.eyebrow.tip` (`logic/descoberta.md` §7)

### Testes da Fase

- [X] T008 [P] Testes de `tmdbDiscovery.ts` em `tv-web/src/lib/metadata/tmdbDiscovery.test.ts`: `weekKey` (virada de ano ISO, segunda/domingo), mapeamento de série, item sem id/título descartado sem renumerar, pool (página 1 falha ⇒ falha geral; páginas 2+ falhando ⇒ guarda as que vieram), chave recusada e pausa por 429 sem requisição (devolve cache), `rate_limited` marca estado, mudança de idioma = outra entrada de cache, `removeTmdbKey` esvazia `discoveryCache`
- [X] T009 [P] Testes de `discoveryRules.ts` em `tv-web/src/lib/metadata/discoveryRules.test.ts`: `versionTier` (tabela de nomes), homônimo de ano diferente, `originalTitle`, "Legendado/Dublado" soltos, empate por nota/data, registro sem ano fora, mesma semente em ordens diferentes, ponderação por popularidade (estatística sobre muitas sementes, com margem larga), `selectTop10` sem mutar
- [X] T010 [P] Testes dos hooks em `tv-web/src/features/catalog/catalogApi.discovery.test.tsx`: sem chave não lê o índice; com títulos cruza com o índice; chegada de categoria (invalidação) atualiza; `now` fixo por montagem; retorno `[]` abaixo do mínimo

**Critério de Conclusão**: `npx vitest run src/lib/metadata/discoveryRules.top10-dica-tmdb.contract.test.ts src/lib/metadata/tmdbDiscovery.top10-dica-tmdb.contract.test.ts` → 3/3 verdes e `check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` íntegro; `npx tsc -b` limpo; testes T008–T010 verdes; nenhuma tela alterada e a suíte da área sem regressão (os 2 contratos de tela seguem vermelhos).

**Checkpoint**: Fundação pronta — as telas já podem consumir os hooks.

**Registro da Fase**:

- Status: Concluída (2026-10-04)
- Feito: `discoveryCache` (Dexie v16) + `removeTmdbKey` limpando; `tmdbDiscovery.ts` (semana ISO, mapeamento, cache semanal/diário, estados, `inFlight`); `discoveryRules.ts` (versão, cruzamento memoizado, Top 10, sorteio ponderado); `useWeeklyTop10`/`useDailyTip` sobre o índice compartilhado; i18n pt/en/es. Desvio da lógica escrita: um título da lista serve a **um** título do TMDB (a chave inteira fica usada), não só o registro — o contrato manda; `logic/descoberta.md` §3 corrigido.
- Contrato: `npx vitest run src/lib/metadata/discoveryRules.top10-dica-tmdb.contract.test.ts src/lib/metadata/tmdbDiscovery.top10-dica-tmdb.contract.test.ts` → 3/3 verdes; `check-contract-tests.ps1` trava íntegra (5/5; os 2 de tela seguem vermelhos, esperado).
- Testes executados: `tmdbDiscovery.test.ts` (8), `discoveryRules.test.ts` (18), `catalogApi.discovery.test.tsx` (7; 1 asserção minha corrigida: a query do índice fica desabilitada, não inexistente); `npx vitest run src/features src/lib src/navigation` sem o contrato de tela → 326 arq. / 2161 testes verdes; `npx tsc -b` exit 0; `npm run lint` exit 0.
- Pendências: nenhuma da fase.

---

## Phase 3: User Story 1 - Top 10 da semana em Filmes e em Séries (Priority: P1) 🎯 MVP

**Objetivo**: A fileira "Top 10 da semana" real (cards com a posição do TMDB) em Filmes e em Séries, no lugar do slot "Em breve", ausente sem dado.

**Independent Test**: Com chave TMDB e lista que contém parte do ranking, abrir Filmes e conferir a fileira, os números e o OK; repetir em Séries; sem chave a fileira não existe e a tela segue navegável.

### Contrato da Fase

- `Top 10 da semana: cards com a posição real…` (`VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`) — US1/AC1, AC2, AC4..AC7, FR-001, FR-003, FR-012..FR-014, FR-020, Constitution: Progresso/Foco
- Comando: `npx vitest run src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx -t "Top 10 da semana"`

### Implementation

- [X] T011 [US1] **Emenda R-001 (aprovada em 2026-10-04) — primeiro passo da fase**: editar **só as linhas do Top 10** nos 5 contratos travados — `tv-web/src/features/vod/vodShowcase.bem-avaliados.contract.test.ts`, `VodShowcaseScreen.bem-avaliados.contract.test.tsx` (056); `vodShowcaseRows.carrosseis-filmes-series.contract.test.ts`, `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (053); `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` (052) — removendo `top10` das chaves/listas/formatos/slots esperados e ajustando as contagens de `ArrowDown`; `vodShowcaseFocus.carrosseis-filmes-series.contract.test.ts` não muda. Registrar em `plan.md` (`R-011`, resolvido) e regravar as travas de `056-bem-avaliados`, `053-carrosseis-filmes-series` e `052-vitrine-filmes-series` com `check-contract-tests.ps1 -Slug <slug> -Write -Paths <todos os arquivos do lock>` (só os hashes mudam)
- [X] T012 [US1] `tv-web/src/features/vod/vodShowcaseRows.ts`: remover o slot `top10`; com `hasTop10` entra `{ key:'top10', kind:'items', format:'top10', seeAll:null, slotId:null }` (título por seção) logo após `continue`; sem `hasTop10`, ausente (`logic/descoberta.md` §7)
- [X] T013 [US1] `tv-web/src/features/vod/VodShowcaseScreen.tsx`: `useWeeklyTop10(sourceId, copy.kind)` (estreitando `FavoritableKind` para `'movie'|'series'`), `hasTop10`, `entriesOf('top10')` com `plainEntries` (sem "Ver tudo"), `rankById` e `rank` no `ContentCard`, `.vod-row-source` ("Fonte: TMDB") e `.vod-row-coverage` no cabeçalho, eyebrow do hero (`showcase.eyebrow.top10`); limpar o que só servia ao slot Top 10 (`SLOT_CARD_COUNT.top10`, ramo `top10` do `renderRowBody`) → contrato: `Top 10 da semana: …`
- [X] T014 [P] [US1] `tv-web/src/styles/vod.css`: `.vod-row-source` (tokens, `--fs-caption`, `--text-annotation`, convivendo com `.vod-row-coverage`); `tv-web/src/components/ContentCard.tsx`: atualizar o comentário de `rank` (posição real do ranking do TMDB, ainda decorativa e `aria-hidden`)
- [X] T015 [P] [US1] Retirar `vod-top10-movies` e `vod-top10-series` de `tv-web/src/lib/comingSoon.ts`, de `tv-web/src/lib/i18n/messages/comingSoon.ts` (3 idiomas) e de `tv-web/src/lib/comingSoon.test.ts` (FR-018); manter `vod-because`
- [X] T016 [US1] Atualizar os testes não travados que citam o slot Top 10: `tv-web/src/features/vod/VodShowcaseScreen.test.tsx`, `VodShowcaseScreen.carrosseis.test.tsx`, `Vod.idioma.test.tsx`, `VodShowcaseScreen.bem-avaliados.test.tsx` e os E2E `tv-web/e2e/carrosseis-filmes-series.mjs`, `tv-web/e2e/lib/vod.mjs` (o Top 10 deixa de existir sem dado)

### Testes da Fase

- [X] T017 [P] [US1] `tv-web/src/features/vod/vodShowcaseRows.discovery.test.ts` (cobre também a Dica, T021): ordem das linhas com/sem `hasTop10`, título por seção, sem slot `vod-top10-*`, `because` segue slot
- [X] T018 [P] [US1] `tv-web/src/features/vod/VodShowcaseScreen.discovery.test.tsx` (cobre também a Dica, T022): card ranqueado com `aria-hidden`, selo de nota do provedor, foco volta ao mesmo card por id após abrir/voltar, a fileira some e o foco cai numa vizinha quando o dado desaparece

**Critério de Conclusão**: `npx vitest run src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx -t "Top 10 da semana"` → verde; os 5 contratos emendados e as travas de 052/053/056 regravadas e íntegras (`check-contract-tests.ps1` de cada); suíte da área verde (`npx vitest run src/features/vod src/lib src/features/home`); `npx tsc -b` e `npm run lint` limpos; Top 10 de Filmes e de Séries funcionando na tela com a posição real.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-10-04)
- Feito: emenda R-001 aplicada só nas linhas do Top 10 dos 5 contratos de 052/053/056 e as 3 travas regravadas (`-Paths` recebe um array); `buildShowcaseRows` com `top10` real (e `tip`, ver Fase 4) e sem o slot; `VodShowcaseScreen` com `useWeeklyTop10`, cards ranqueados (`rank` = posição real), `.vod-row-source`, aviso de cobertura, eyebrow; `vod-top10-*` removidos de `comingSoon` (código, 3 idiomas, teste); CSS `.vod-row-source` e remoção do `.vod-ghost-rank`; testes e E2E que citavam o slot ajustados.
- Contrato: `npx vitest run src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx` → 2/2 verdes (Top 10 e Dica; a Dica ficou pronta junto, no mesmo arquivo de código); `check-contract-tests.ps1` íntegro para 057, 052, 053 e 056 (5/5 cada).
- Testes executados: `vodShowcaseRows.discovery.test.ts` (4) e `VodShowcaseScreen.discovery.test.tsx` (5); testes não travados corrigidos por dependerem do slot (`VodShowcaseScreen.test.tsx`, `.carrosseis.test.tsx`, `Vod.idioma.test.tsx`, `comingSoon.test.ts`); E2E `node e2e/run.mjs --only carrosseis-filmes-series,vitrine-filmes-series,bem-avaliados --jobs 2` → 3/3; `npx vitest run src/features src/lib src/navigation` → 329 arq. / 2172 testes; `tsc -b` e `npm run lint` exit 0.
- Pendências: o screenshot antigo `tv-web/test-results/carrosseis-filmes-series/02-slot-top10.png` ficou órfão (o E2E agora grava `02-slot-porque-voce-assistiu.png`); remover na revisão.

---

## Phase 4: User Story 2 - Dica de filme e Dica de série (Priority: P1)

**Objetivo**: A fileira "Dica de filme"/"Dica de série" sorteada do TMDB cruzado com a lista, estável no dia, ausente sem dado.

**Independent Test**: Abrir Filmes duas vezes no mesmo dia (mesmos cards e ordem), simular a virada do dia (outros cards), conferir nota e ano dentro dos critérios.

### Contrato da Fase

- `Dica: "Dica de filme"/"Dica de série" entre as fileiras…` (`VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`) — US2/AC1, AC5..AC7, FR-005, FR-012..FR-014, FR-020, Constitution: Foco
- Comando: `npx vitest run src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx` → 2/2

### Implementation

- [X] T019 [US2] `tv-web/src/features/vod/vodShowcaseRows.ts`: com `hasTip` entra `{ key:'tip', kind:'items', format:'poster', seeAll:null, slotId:null }` (título por seção) entre `rated` e `because` (`logic/descoberta.md` §7)
- [X] T020 [US2] `tv-web/src/features/vod/VodShowcaseScreen.tsx`: `useDailyTip(sourceId, copy.kind)`, `hasTip`, `entriesOf('tip')` sem "Ver tudo", `.vod-row-source` + aviso de cobertura no cabeçalho, eyebrow `showcase.eyebrow.tip` → contrato: `Dica: …`

### Testes da Fase

- [X] T021 [P] [US2] `tv-web/src/features/vod/vodShowcaseRows.discovery.test.ts` (mesmo arquivo de T017): posição entre `rated` e `because` com todas as combinações de `hasRated`/`hasAdded`, título por seção, ausência
- [X] T022 [P] [US2] `tv-web/src/features/vod/VodShowcaseScreen.discovery.test.tsx` (mesmo arquivo de T018; aviso de cobertura e OK ficam no contrato): o mesmo título pode estar na Dica e em "Adicionados recentemente" sem quebrar a restauração do foco (ids por `rowKey`+id)

**Critério de Conclusão**: `npx vitest run src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx` → 2/2 verdes e `check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` íntegro; todos os contratos 057 desta e das fases anteriores verdes (5/5); `npx tsc -b`/lint limpos; suíte da área verde.

**Checkpoint**: User Stories 1 e 2 funcionam de forma independente na tela hero.

**Registro da Fase**:

- Status: Concluída (2026-10-04)
- Feito: linha `tip` entre `rated` e `because` e a tela com `useDailyTip` (implementadas junto da Fase 3, mesmos arquivos); eyebrow `showcase.eyebrow.tip`; sem "Ver tudo".
- Contrato: `npx vitest run src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx` → 2/2 verdes; trava 057 íntegra (5/5 verdes na suíte completa).
- Testes executados: os de `vodShowcaseRows.discovery.test.ts` e `VodShowcaseScreen.discovery.test.tsx` (posição da Dica com todas as combinações, ausência de número, restauração por `rowKey`+id com o mesmo título em duas fileiras); suíte completa da área verde (ver Fase 3).
- Pendências: nenhuma da fase.

---

## Phase 5: User Story 3 - Top 10 e Dica de filmes e de séries no Início (Priority: P2)

**Objetivo**: Quatro linhas novas no Início (Top 10 filmes, Top 10 séries, Dica de filme, Dica de série), cada uma sumindo sem dado, com foco e volta por id.

**Independent Test**: Abrir o Início com TMDB configurado e conferir as quatro; remover a chave e conferir que sumiram sem buraco; navegar com o controle remoto e voltar de um detalhe.

### Implementation

- [X] T023 [US3] `tv-web/src/navigation/appNav.ts`: acrescentar `'top10-movies' | 'top10-series' | 'tip-movies' | 'tip-series'` à união `HomeFocus.rail` (só acréscimo, R-007); conferir `HomeScreen.tsx`/`App.tsx` por mapas ou `switch` sobre `rail`
- [X] T024 [US3] `tv-web/src/features/home/HomeContent.tsx`: `RowKey`/`ALL_ROWS` com as 4 linhas entre `channels` e `ai`; os 4 hooks (`useWeeklyTop10`/`useDailyTip` × `movie`/`series`), `rowExists`, um `useIdFocus` por linha, setas horizontais/seleção (`onOpenItem(item, { zone:'rail', rail, itemId })`), restauração de foco por `initialFocus`, cabeçalho com `.home-row-source` e `.home-row-coverage`; sem skeleton, sem slot (`logic/descoberta.md` §8)
- [X] T025 [P] [US3] `tv-web/src/styles/home.css`: card ranqueado do Início (espelho de `.vod-screen .content-card--ranked`/`-rank`, tokens, `RANKED_WIDTH`), `.home-row-source`, `.home-row-coverage`; textos reusam as chaves `showcase.*` (sem chave nova se der)

### Testes da Fase

- [X] T026 [P] [US3] `tv-web/src/features/home/HomeContent.top10-dica.test.tsx`: 4 linhas com dado, uma a uma sem dado (as demais seguem, sem buraco), sem nenhuma o foco anda pelas linhas existentes, OK abre o item com `from` correto, voltar restaura o foco por id, sem consulta ao focar
- [X] T027 [P] [US3] Rodar e, se preciso, ajustar sem editar contratos: `HomeContent.test.tsx`, `HomeScreen.test.tsx`, `appNav.test.ts`, `App.test.tsx` e os contratos 023/024/026 de Início

**Critério de Conclusão**: `npx vitest run src/features/home src/navigation src/App.test.tsx` verde (nenhum contrato 023/024/026 editado, `check-contract-tests.ps1` de cada um íntegro); `npx tsc -b`/lint limpos; Início mostra as 4 linhas com TMDB configurado e nenhuma sem ele; contratos 057 seguem 5/5.

**Checkpoint**: User Story 3 funcional; as 3 telas usam as mesmas regras.

**Registro da Fase**:

- Status: Concluída (2026-10-04)
- Feito: `HomeFocus.rail` ganhou `top10-movies|top10-series|tip-movies|tip-series` (só acréscimo); `HomeContent` com as 4 linhas entre "Canais favoritos" e "Curadoria IA" (hooks `useWeeklyTop10`/`useDailyTip` por tipo, um `useIdFocus` por linha, OK com `from` correto, restauração por `initialFocus`, `.home-row-head` com fonte TMDB e aviso de cobertura, sem skeleton nem slot); CSS do Início (`.home-row-head/-source/-coverage`, card ranqueado em grade, `RANKED_WIDTH` 305). Ajuste num teste existente: `HomeContent.test.tsx` ("com chave guardada o ícone mostra conectado") exigia zero `fetch`; agora o Início consulta o TMDB ao abrir por desenho (D-009), então o teste simula a resposta vazia e confere que só `trending`/`discover` são chamados e que o dock não testa a chave.
- Contrato: sem contrato próprio nesta fase (P2; justificado em `plan.md`); os 5 contratos 057 seguem verdes e `check-contract-tests.ps1` está íntegro para **todas** as features com trava (0 problemas).
- Testes executados: `HomeContent.top10-dica.test.tsx` (5: 4 linhas com posição/fonte/cobertura, linha sem dado some e sem nenhuma o foco anda, ↓/←→/OK com origem certa, restauração por id e id sumido, zero rede ao percorrer); `npx vitest run src/features src/lib src/navigation src/App.test.tsx` → 331 arq. / 2181 testes; `tsc -b` e `npm run lint` exit 0; E2E `node e2e/run.mjs --only home-busca-configuracoes,shell-visual,carrosseis-filmes-series --jobs 2` → 2/2 (`shell-visual` não está na SUITE).
- Pendências: o layout do card ranqueado no Início (largura 305 e rolagem com as linhas novas, R-010) só foi verificado por teste de DOM; a conferência visual fica para o E2E `top10-dica` (T030) com screenshot.
---

## Phase 6: User Story 4 - Sem TMDB, sem rede ou sem cobertura: some sem ruído (Priority: P2)

**Objetivo**: Garantir, ponta a ponta, o comportamento de borda: sem chave, sem rede, chave recusada, limite de uso, cobertura parcial, troca de lista/idioma e remoção da chave.

**Independent Test**: Sem chave (fileiras ausentes, telas intactas); chave e rede cortada depois de um uso bem-sucedido (vêm do cache); chave e cache vazio sem rede (ausentes).

### Implementation

- [X] T028 [US4] Cobrir os fluxos de borda sem alterar contratos: remover a chave em Integrações limpa o cache e as 4 fileiras somem; trocar o idioma refaz a consulta; trocar a lista ativa recalcula o cruzamento (o ranking em cache não é reaproveitado como cruzamento); categoria nova chegando atualiza as fileiras sem mover o foco — corrigir o que os testes mostrarem em `tmdbDiscovery.ts`/`catalogApi.ts`/telas

### Testes da Fase

- [X] T029 [P] [US4] `tv-web/src/features/catalog/catalogApi.discovery.estados.test.tsx`: sem chave/recusada/limite/offline com e sem cache, troca de lista, troca de idioma, remoção da chave, chegada de categoria
- [X] T030 [US4] E2E `tv-web/e2e/top10-dica.mjs` (novo, registrar em `tv-web/e2e/run.mjs` `SUITE`) com o TMDB simulado por interceptação de `api.themoviedb.org` e a chave semeada no IndexedDB: Top 10 e Dica em Filmes/Séries/Início com posição real, cobertura parcial, OK/voltar com foco restaurado, sem chave as fileiras ausentes, rede cortada usa o cache; screenshots em `tv-web/test-results/top10-dica-tmdb/`

**Critério de Conclusão**: `npx vitest run src/features/catalog` verde; `node e2e/run.mjs --only top10-dica --jobs 1` verde; nenhuma mensagem de erro, fileira vazia ou "Em breve" do Top 10/Dica em nenhum estado (SC-006); `check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` íntegro.

**Checkpoint**: As 4 user stories funcionam, inclusive nas bordas.

**Registro da Fase**:

- Status: Concluída (2026-10-04)
- Feito: os fluxos de borda foram cobertos e, ao desenhar o E2E, apareceram dois defeitos reais que foram corrigidos na T028: (1) salvar/testar a chave em Integrações não invalidava `['tmdb-discovery']` (o "sem chave" ficaria 30 min em memória; remover a chave agora descarta essas queries) e (2) o `staleTime` de 30 min valia também para `no_key`/`unavailable`/vencido (agora só vale para resultado vigente; senão o próximo uso da tela tenta de novo). O E2E mostrou ainda dois defeitos de CSS do formato Top 10 que a 053 nunca exercitou com cards reais: o pôster encolhia na hero (corrigido: altura do trilho e proporção do pôster, número encostado no pôster, título acompanhando o pôster) e o número ficava cortado no Início (agora alinhado ao pôster).
- Contrato: sem contrato próprio nesta fase; os 5 contratos 057 seguem verdes; `check-contract-tests.ps1` íntegro em todas as features com trava (0 problemas).
- Testes executados: `catalogApi.discovery.estados.test.tsx` (7: chave recusada e pausa por limite, sem rede com e sem cache nas duas fileiras, troca de lista, troca de idioma, salvar a chave, remover a chave; um erro meu de teste corrigido: o idioma gravado no `localStorage` vazava para o teste seguinte); E2E novo `e2e/top10-dica.mjs` (registrado na SUITE; 47 verificações: sem chave nada é pedido; Início, Filmes e Séries com posição real, versão principal, fonte TMDB, cobertura parcial, OK/voltar, zero consulta por foco, uma consulta por período, Dica estável, offline com cache vencido, sem chave de novo, chave fora do DOM e do console; capturas em `test-results/top10-dica-tmdb/`); `node e2e/run.mjs --only top10-dica,carrosseis-filmes-series,vitrine-filmes-series,bem-avaliados,home-busca-configuracoes --jobs 2` → 5/5; `npx vitest run src/features src/lib src/navigation src/components src/App.test.tsx` → 392 arq. / 2548 testes; `tsc -b` e `npm run lint` exit 0.
- Pendências: nenhuma da fase.
---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentação viva, medição e gates finais.

- [X] T031 Medir SC-008/R-003: `matchDiscoveryTitles` em ≈ 43 mil registros (microbench), abertura do Início e de Filmes antes × depois (T001) na lista real; se pesar, adiar o cruzamento do Início para depois do primeiro desenho (idle) sem mudar contratos; registrar números em R-003
- [X] T032 Medir e registrar a cobertura real de casamento na lista do usuário (quantos dos 10 do Top 10 e quantos candidatos da Dica casam) em R-004
- [X] T033 Atualizar a documentação: `.planning/backlog.md` (item 67 entregue; Dica registrada; as colunas de status são do script), `README.md` (Top 10/Dica, tabela `discoveryCache`), nota em `sdd/specs/053-carrosseis-filmes-series/plan.md` e `sdd/specs/056-bem-avaliados/plan.md` apontando a emenda R-001; **não** acrescentar parágrafo de status a `CLAUDE.md`
- [X] T034 Rodar `quickstart.md` ponta a ponta no navegador e registrar o resultado
- [X] T035 Gates finais: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build:tizen` (confere `tizen_web_project.yaml`), `npm run test:e2e` (suíte inteira, com `npm run dev` no ar)

**Registro da Fase**:

- Status: Concluída (2026-10-04)
- Feito: medições na lista real e no TMDB (R-003/R-004); README com as fileiras do TMDB; notas de emenda nos `plan.md` de 053 e 056; `npm run build:tizen` (sem arquivo novo fora de `tizen_web_project.yaml`); gates finais. `CLAUDE.md` não foi tocado (nenhuma regra permanente nova). O item 67 do backlog já constava como "em execução pela 057" (a Dica não tem item próprio; fica a cargo do `sdd-converge`).
- Contrato: `npx vitest run` dos 3 arquivos 057 → 5/5 verdes dentro da suíte completa; `check-contract-tests.ps1` íntegro em todas as features com trava (0 problemas).
- Testes executados: `npm run test` → 401 arq. / 2653 testes verdes; `npx tsc -b` e `npm run lint` exit 0; `npm run build:tizen` exit 0; `npm run test:e2e` → **1ª rodada 35/36** (falhou `navegacao-por-pagina`, "← para no primeiro canal", Live TV; reexecutado isolado em série **3/3 verdes**; motivo plausível: tempo sob carga paralela, nada nesta feature toca a Live TV) e **2ª rodada 36/36**. Medição (scratchpad, desktop, só contagens e tempos; credenciais lidas do `.env` em tempo de execução): lista real com 43.161 filmes (59% com ano) e 9.696 séries (99% com ano); Top 10 de filmes cruza 5 das 10 posições (4, 5, 6, 8, 10) e o de séries 8 de 10; a Dica cruza 132 de 160 candidatos de filmes e 148 de 160 de séries (10 sorteados em ambos); em 1 caso por tipo o título do ranking só existe em versão `[L]`/4K (fallback exercitado); cruzamento de 43 mil filmes: 183 ms a frio e 28 ms memoizado (séries: 26 ms e 5 ms).
- Quickstart: passos 1–8 cobertos pelo E2E `top10-dica` (Início, Filmes e Séries com posição real, versão principal, fonte TMDB, cobertura parcial, OK/voltar, zero consulta por foco, uma consulta por período, Dica estável, offline com cache vencido, sem chave). Não feito à mão: a conferência de "outro dia" mudando o relógio do sistema (coberta por teste unitário de semente) e DevTools offline (simulado pelo `route.abort` do E2E).
- Pendências: (1) tempo de abertura do Início/Filmes antes × depois **não foi medido no navegador** — só o cruzamento isolado; a primeira abertura com chave tem um custo único de ≈0,2 s no desktop (a TV pode ser várias vezes mais lenta), então a passada na TV física segue recomendada; (2) screenshot órfão `tv-web/test-results/carrosseis-filmes-series/02-slot-top10.png`; (3) pendências do Analyze A1–A5 do `handoff.md` (ajustes de texto da spec) ficam para o `sdd-converge`.
### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] Fase 6 (User Story 4) concluída
- [X] Testes de contrato 057 todos verdes na suíte completa (5/5) e `check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` íntegro
- [X] Travas de 052, 053 e 056 regravadas após a emenda R-001 e íntegras
- [X] `tsc -b`, `oxlint`, `npm run test`, `npm run test:e2e` limpos
- [X] `quickstart.md` executado com sucesso no navegador (os passos 1–8 pelo E2E `top10-dica`; ver Registro da Fase 7)
- [X] Constitution pós-design reconferida (foco sem fileira vazia, voltar por id, chave fora de log/UI, nada de "Em breve" para Top 10/Dica)

> **Nota (não é gate, não marcada):** a passada na TV física é **recomendada** (fluidez do Início com dois índices em memória e o cruzamento a frio, ver R-003); sem ela a feature não fica "verificada na TV".

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)**: depende da Phase 2; começa pela emenda T011 (as travas de 052/053/056 precisam estar de acordo antes de religar a tela)
- **US2 (Phase 4)**: depende da Phase 2 e do `vodShowcaseRows.ts`/`VodShowcaseScreen.tsx` da Phase 3 (mesmos arquivos)
- **US3 (Phase 5)**: depende da Phase 2 (hooks); independe das Phases 3/4 no código, mas roda depois para evitar conflito em `vod.css`/i18n
- **US4 (Phase 6)**: depende das Phases 2–5
- **Polish (Phase 7)**: depende de todas

### Parallel Opportunities

- Fase 2: T003 [P], T005 [P], T007 [P] em paralelo; T004 depende de T003; T006 depende de T004 e T005; T008–T010 [P] depois dos respectivos módulos
- Fase 3: T014 [P], T015 [P] em paralelo com T012/T013; T017/T018 [P] ao final
- Fase 5: T025 [P] em paralelo com T024

---

## Implementation Strategy

### MVP First (US1)

1. Fase 1 → Fase 2 (fundação, 3 contratos verdes) → Fase 3 (Top 10 em Filmes e Séries)
2. **PARAR E VALIDAR**: Top 10 de Filmes e Séries na tela, com a posição real e sem rastro de "Em breve"

### Incremental Delivery

1. Fundação → US1 (Top 10) → US2 (Dica) → US3 (Início) → US4 (bordas) → Polish
2. Cada story entrega valor sozinha; nenhuma quebra a anterior

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar após cada task ou grupo lógico coerente
- Os contratos travados só são editados na T011 (R-001), nas linhas do Top 10 e com as travas regravadas

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
## Phase 8: Convergence

**Objetivo**: Fechar as lacunas da auditoria de convergência de 2026-10-04 (nenhuma bloqueia uma story P1; as duas MEDIUM precisam de decisão ou medição).

### Implementation

- [X] T036 [MEDIUM] (aprovado pelo usuário e aplicado em 2026-10-04) Emendar o texto de FR-015 em `sdd/specs/057-top10-dica-tmdb/spec.md` (precisa de aprovação do usuário): "sem rede ou com erro do TMDB" usam o último cache; **sem chave** as fileiras ficam ausentes e nada é pedido (já é o comportamento, contrato e US4/AC1; `removeTmdbKey` limpa o cache). Origem: FR-015 × US4/AC1 (C-01)
- [X] T037 [MEDIUM] (feito no navegador em 2026-10-04: pesa, ver `plan.md` R-003; a TV física segue sem medição) Medir a abertura do Início e de Filmes antes × depois (com e sem chave TMDB, lista real, navegador; idealmente também na TV física pela skill `tizen-tv`) e registrar em `plan.md` R-003; se pesar, adiar o cruzamento do Início para depois do primeiro desenho. Origem: SC-008 / plan: R-003 (C-02)
- [X] T038 [LOW] Alinhar o texto da spec: FR-016 → "uma carga por tipo e período" (a Dica usa 8 páginas) e US4/AC2 → "o último conjunto de candidatos guardado, sorteado com a semente do dia". Origem: FR-016, US4/AC2 (C-03, C-06)
- [X] T039 [LOW] Acrescentar à spec o FR do aviso de cobertura parcial ("Com base em X de Y categorias", como o FR-014 da 056) e uma nota de que invalidação do cache, `staleTime` e CSS do Top 10 são correções internas. Origem: plan: D-012 / Constitution "Progresso e Capacidades São Reais" (C-05, C-07)
- [X] T040 [LOW] Registrar em `plan.md` → Riscos e Decisões o deslocamento de card sob o foco na Dica quando chega categoria nova (aceito, como R-012 da 056) ou, se preferirem, qualificar FR-021 na spec. Origem: FR-021 (C-04)
- [X] T041 [LOW] (feito com `git rm`) Remover o screenshot órfão `tv-web/test-results/carrosseis-filmes-series/02-slot-top10.png`. Origem: higiene (C-08)

### Testes da Fase

- [x] T042 Reexecutar `sdd-converge 057-top10-dica-tmdb` depois das tasks acima até não sobrar achado — feito: convergência sem achados em 2026-10-05 (`plan.md` → `## Resultado Final`); reconferido em 2026-10-09: trava íntegra 5/5, contratos + `catalogApi.discovery.test.tsx` + `discoveryRules.test.ts` 36/36, E2E `top10-dica-tmdb` dentro dos 43/43.

**Critério de Conclusão**: C-01..C-08 resolvidos (spec e plano alinhados ao comportamento entregue; R-003 com medição no navegador registrada) e `sdd-converge` sem achados; `check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` segue íntegro.

**Registro da Fase**:

- Status: Concluída (2026-10-05)
- Feito: T036 (FR-015), T041 (screenshot), T037 (medição no navegador) e, aprovados pelo usuário em 2026-10-05, T038 (FR-016 "uma carga por tipo e período"; US4/AC2 "conjunto de candidatos sorteado com a semente do dia"), T039 (FR-022 do aviso de cobertura e nota das correções internas na spec) e T040 (R-016, risco aceito, com a ressalva no FR-021). Spec: `FR-015`, `FR-016`, `FR-021`, `FR-022`, a US4/AC2, as Assumptions e as Clarifications.
- Contrato: `check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` íntegro; nenhum código nem contrato foi tocado nesta fase.
- Testes executados: nenhum novo (só documentação); a suíte da 057 segue como na Fase 9.
- Pendências: T042 segue aberta até a convergência sem achados.
## Phase 9: Convergence

**Objetivo**: Tratar o achado da 2ª auditoria de convergência (2026-10-04). A Fase 8 segue aberta para T038–T040 (textos da spec e risco aceito, ainda sem aprovação do usuário).

### Implementation

- [X] T043 [HIGH] Tirar o cruzamento do caminho de renderização: hoje `useDiscoveryRow` (`tv-web/src/features/catalog/catalogApi.ts`) roda `matchDiscoveryTitles`/`selectTop10`/`selectTip` dentro do `select` do react-query, durante a renderização, e a lista real mede ≈330 ms de atraso na 1ª fileira de Filmes e uma tarefa longa de ≈200–270 ms no Início. Calcular **depois do primeiro desenho**, fora da renderização e em fatias que cedam a thread (ou agendado em idle), mostrar as fileiras quando o resultado chegar, e compartilhar o cálculo de Top 10 e Dica do mesmo tipo (um cruzamento por índice e título, não dois). Sem mudar contratos nem comportamento visível além do momento em que as fileiras aparecem. Origem: SC-008 / plan: R-003 (C-09)
- [X] T044 [MEDIUM] Reexecutar a medição de abertura com o mesmo roteiro (lista real completa no aparelho, sem chave × com chave, cache frio e quente, 7 repetições) e registrar o antes/depois em `plan.md` R-003; meta: o Início sem tarefa longa adicional acima de ≈50 ms e a 1ª fileira de Filmes sem atraso perceptível em relação a "sem chave". Fazer também a passada na TV física pela skill `tizen-tv`. Origem: SC-008 (C-09)

### Testes da Fase

- [x] T045 Testes dos hooks cobrindo a nova ordem (a fileira aparece depois do primeiro desenho, mesma seleção de antes, sem chave nada é calculado) e reexecução de `sdd-converge 057-top10-dica-tmdb` até não sobrar achado — feito: convergência sem achados em 2026-10-05 (`plan.md` → `## Resultado Final`); reconferido em 2026-10-09: trava íntegra 5/5, contratos + `catalogApi.discovery.test.tsx` + `discoveryRules.test.ts` 36/36, E2E `top10-dica-tmdb` dentro dos 43/43.

**Critério de Conclusão**: contratos 057 5/5 verdes e trava íntegra; a medição de T044 sem o atraso e sem a tarefa longa de C-09; `npm run test` e o E2E `top10-dica` verdes; `sdd-converge` sem achados (junto com a Fase 8).

**Registro da Fase**:

- Status: Concluída em parte (2026-10-04): T043 e T044 feitas; T045 aguarda a nova convergência.
- Feito: `matchDiscoveryTitlesAsync` em `discoveryRules.ts` (índice dos registros em fatias de 2000 que cedem a thread, guardado pela identidade da lista e compartilhado por Top 10 e Dica; a versão síncrona e o contrato ficam como estavam); `useDiscoveryRow` agora calcula num `useEffect` depois do primeiro desenho, sem `select`, e mantém o resultado anterior da mesma lista enquanto recalcula. Re-medição (lista real, 9 repetições, p50): Início — maior tarefa longa 195–201 ms → 62–77 ms. Filmes — o custo restante ao abrir é de código preexistente (`select` de `useRecentlyAdded`/`useTopRated`, ≈370 ms no perfil, `plan.md` R-015); o roteiro "Início → Filmes" continua medindo 1ª fileira em ≈430–480 ms com chave, mas outro fluxo mediu 75–107 ms e os experimentos de isolamento deram diferença de ≈10 ms atribuível à 057: **medição de Filmes inconclusiva**, a TV física não foi medida.
- Contrato: `npx vitest run` dos 3 arquivos 057 → 5/5 verdes na suíte completa; `check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` íntegro.
- Testes executados: novos — 4 em `discoveryRules.test.ts` (async igual ao síncrono, cede a thread por fatia, índice montado uma vez para chamadas concorrentes, sem títulos nada é lido) e 1 em `catalogApi.discovery.test.tsx` (1ª renderização sem dado, a fileira aparece depois, recalcular não a apaga); `npm run test` → 417 arq. / 2714 testes; `tsc -b` e `npm run lint` exit 0; `node e2e/run.mjs --only top10-dica,carrosseis-filmes-series,vitrine-filmes-series,bem-avaliados,home-busca-configuracoes --jobs 2` → 5/5.
- Pendências: T045 (reexecutar a convergência); a diferença entre os dois fluxos de medição de Filmes não foi explicada; TV física sem medição; T038–T040 da Fase 8 seguem abertas (aguardam aprovação do texto da spec).

## Phase 10: Convergence

**Objetivo**: Tratar o que sobrou do desempenho (SC-008) depois da T043. As Fases 8 e 9 seguem abertas para T038–T040 (textos da spec, aguardam aprovação) e T042/T045.

### Implementation

- [X] T046 [MEDIUM] (feito em 2026-10-05: ver Registro da Fase 10; a divergência entre os roteiros ficou sem explicação e perdeu o sentido depois do bug de Filmes) Explicar a divergência da medição da 1ª fileira de Filmes (≈430–480 ms no roteiro "Início → Filmes" × 75–107 ms no fluxo de isolamento, mesmo estado) e fechar o SC-008: repetir a medição num único roteiro que alterne os dois fluxos, registrar o resultado em `plan.md` R-003 e fazer a passada na TV física pela skill `tizen-tv` (Início e Filmes, com e sem chave). Origem: SC-008 / plan: R-003 (C-10)
- [X] T047 [LOW] Decidir (precisa do usuário) se o custo preexistente do 1º desenho de Filmes com o índice em cache (`select` de `useRecentlyAdded`/`useTopRated`, `plan.md` R-015) vira um item `[Bug]` em `.planning/backlog.md` → Ideias Futuras, a ser tratado fora desta feature. Origem: plan: R-015 (C-10)

### Testes da Fase

- [x] T048 Reexecutar `sdd-converge 057-top10-dica-tmdb` até não sobrar achado — feito: convergência sem achados em 2026-10-05 (`plan.md` → `## Resultado Final`); reconferido em 2026-10-09: trava íntegra 5/5, contratos + `catalogApi.discovery.test.tsx` + `discoveryRules.test.ts` 36/36, E2E `top10-dica-tmdb` dentro dos 43/43.

**Critério de Conclusão**: C-10 fechado (medição reproduzível e a TV medida, ou o limite aceito e registrado pelo usuário); junto com a Fase 8 resolvida, `sdd-converge` sem achados e `check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` íntegro.

**Registro da Fase**:

- Status: Concluída em parte (2026-10-05): T046 e T047 feitas; T048 aguarda a convergência.
- Feito: T047 — o custo preexistente de Filmes virou o bug `tela-principal-filmes-lenta-na-tv` (`sdd/bugs/`), investigado e corrigido (índice com `staleTime` de 60 s e invalidação ao entrar em categoria nova e no fim de sincronização, resultados guardados por índice, "Adicionados recentemente" mapeia só as 12). T046 — o app foi reinstalado na TV e o usuário viu: 1ª visita a Filmes com a primeira fileira rápida e sem travar, 2ª visita fluida e navegação na vitrine boa (qualitativo, sem tempos; **sem chave TMDB não foi testado**). A divergência entre os dois roteiros de medição no navegador (430–480 ms × 75–107 ms) não foi explicada; perdeu relevância depois da correção.
- Contrato: sem contrato nesta fase; trava íntegra; 052/053/056 também.
- Testes executados: `npm run test` 418 arq. / 2722 testes; E2E da área 10/10; ver `sdd/bugs/tela-principal-filmes-lenta-na-tv/test.md`. Quem viu a TV: o usuário.
- Pendências: T048 (reexecutar `sdd-converge`).