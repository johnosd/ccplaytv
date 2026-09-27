# Implementation Plan: Filmes e Séries no Design System V14 (Onda 4)

**Slug**: `025-filmes-series-ds-v14` | **Date**: 2026-09-27 | **Spec**: `sdd/specs/025-filmes-series-ds-v14/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Filmes e Séries passam ao layout V14 sob a topbar da feature 023, com o mesmo
mecanismo de composição de foco que a Live ganhou na 024:

- side nav com "Sua biblioteca" (★ Favoritos, **↺ Histórico**) e "Catálogo"
  (Todos + categorias da fonte);
- toolbar com "Pesquisar" (a busca da 018, agora como campo) e "Ordenar"
  (modal);
- hero band fixa e não focável com o card focado;
- grade virtualizada de `ContentCard` portrait de geometria fixa;
- memória de foco por entrada na sessão (§41).

As duas telas, hoje quase cópias, viram invólucros finos de um
`VodCatalogScreen` compartilhado. Os detalhes de filme e de série ganham o
hero V14, ações em pill ("Minha Lista", "Trailer" mock), abas (Elenco/
Semelhantes mock), seletor de temporada em modal e episódios em cards 16:9.

Na camada de dados, três exceções limitadas à estratégia "strangler" (D-001):

- **Histórico**: `listPlayed` + `loadHistory`, uma leitura do `lastWatched`
  que já existe, com episódios agregados por série;
- **Ano e inclusão** de filme/série, capturados de campo próprio do
  provedor;
- **Duração e imagem do episódio**, capturadas de `get_series_info` (barra
  de progresso só com duração conhecida).

## Technical Context

**Language/Version**: TypeScript ~6.0, React 19.2 (`tv-web/`).

**Primary Dependencies**: Vite 8 (alvo `chrome108`), `@tanstack/react-query` 5, `@tanstack/react-virtual` 3, Dexie 4. Componentes da feature 022 (`SideCategoryNav`, `ContentCard`, `PosterArt`, `Tabs`, `Modal`, `EmptyState`, `ErrorState`, `Spinner`, `Chip`, `Icon`). Shell da feature 023 (`AppShell`, `TopBar`, `HintBar`) e o padrão `shell?` da 024.

**Storage**: IndexedDB via Dexie (`tv-web/src/lib/catalog/db.ts`). Três campos de valor novos em `CatalogRecord`, sem índice e sem bump de versão (`data-model.md`). Estado do usuário inalterado. Memória de sessão só em módulo JS.

**Testing**: Vitest 5 + Testing Library + jsdom + `fake-indexeddb` (global em `src/setupTests.ts`); Playwright via `tv-web/e2e/*.mjs` e `tv-web/e2e.mjs`.

**Target Platform**: Samsung Tizen 8.0 / Chromium 108 (QN50Q60DAGXZD), palco lógico 1920×1080 (`Stage`).

**Performance Goals**:

- Grade virtualizada: SC-005, 500 itens sem montar mais que a janela visível mais o overscan.
- Glow só no item focado.
- Capas em `loading="lazy"` dentro da janela virtual (015).
- Nenhuma leitura disparada por mover o foco (hero band usa dados já em memória).

**Constraints**:

- Sem `:has()`, `backdrop-filter` ou `will-change` em massa (roteiro §3).
- Só tokens de `index.css`.
- Foco é estado + `.tv-focus` (ADR-009).
- `webapis.avplay` é singleton; nada de preview.
- Contratos travados de 018–024 não podem ser editados. 019 inclui `seriesWatchedSummary.historico.contract.test.ts`, que precisa continuar verde.

**Scale/Scope**: fontes reais com centenas de categorias e dezenas de milhares de filmes. Quatro telas redesenhadas: `MoviesScreen` (736 linhas), `SeriesScreen` (699), `MovieDetailScreen` (214), `SeriesDetailScreen` (390).

## Decisões Invariantes

- **D-001 — Apresentação troca, lógica fica.** Hooks de catálogo, favoritos, busca e prefetch, e o `PlayerLayer`, não mudam de comportamento. A exceção em `lib/` é só esta:
  - `classifier.ts`: `normalizeYear`, `normalizeAddedAt`, `normalizeDurationSeconds` e os 3 campos de `ClassifiedEntry`;
  - `xtreamConnector.ts`: `mapVodEntry`, `mapSeriesEntry` e `fetchSeriesInfo` capturam os campos (`logic/metadados-vod.md`);
  - `categoryLoader.ts`, `importPipeline.ts` e `seriesLoader.ts`: copiam os campos para o registro;
  - `db.ts`: docs dos campos;
  - `userStateRepository.ts`: `listPlayed`, mais a correção **só do comentário** de `markCompleted`;
  - `history.ts`: `loadHistory`, novo.
- **D-002 — Uma tela compartilhada.** `tv-web/src/features/vod/VodCatalogScreen.tsx`, parametrizada por `section`. `MoviesScreen`/`SeriesScreen` continuam existindo com os mesmos nomes e props (mais `shell?`), como invólucros. Os testes de comportamento existentes continuam montando os dois.
- **D-003 — Shell por prop opcional `shell?: VodShellProps`** (stub em `features/vod/vodShell.ts`), mesma composição da 024 (`logic/foco-live-shell.md` §2 e §6):
  - `zone`, `TopBar` com `modal: active`, `currentItem` = seção;
  - saída para a topbar só por ↑ em "★ Favoritos";
  - RETURN na topbar/side nav = `onBack` (Início);
  - `App.tsx` passa `shell` para Filmes/Séries com `onSwitchTop` → `switch-top`, e o `onSwitchTop` da Live continua como está.
- **D-004 — Memória de sessão em módulo** (`features/vod/vodSessionMemory.ts`, stub já funcional):
  - guarda foco por entrada, ordenação por seção e "Histórico já aberto";
  - nunca `localStorage`/IndexedDB (FR-021, FR-032);
  - testes chamam `resetVodSessionMemory()`.
- **D-005 — Histórico = `lastWatched`** (`logic/historico.md`):
  - `markCompleted` não passa a gravar `lastWatched`, o que violaria FR-011;
  - Séries agregam episódios por `seriesId` na ordem mais recente;
  - `unresolved` conta episódios;
  - a contagem só aparece com o Histórico já aberto na sessão, e a consulta fica habilitada daí em diante.
- **D-006 — Grade de geometria fixa**:
  - card 205×302 + título/meta, 6 lanes, altura de linha constante;
  - sem `usePosterColumnWidth`/`ResizeObserver` na nova grade (mesma escolha do `Rail`, R-002 da 022);
  - um só virtualizador com `lanes`, como hoje (D-005 da 009).
- **D-007 — Toolbar substitui o ícone de busca da 018.**
  - `toolbarFocus: 'search' | 'sort' | null` substitui `topFocused`.
  - A mecânica da busca (ativar, foco DOM no input, ↓/Done para resultados, RETURN em camadas, cobertura em "Todos") é a mesma.
  - O `<input>` mantém a classe `search-field`.
  - Com o campo ativo, ←/→ ficam com o IME (não levam a "Ordenar").
- **D-008 — Ordenar** (`logic/foco-vod.md` §5):
  - `vodSort.ts` puro (contrato travado);
  - escolha por seção na sessão; nunca em ★/↺;
  - opção indisponível na entrada aberta exibe "Ordem da fonte" sem apagar a escolha;
  - pipeline: base → busca → ordenação.
- **D-009 — Detalhes** (`logic/detalhe-vod.md`):
  - raiz `.screen.vod-detail`, coberta pela regra do plano de hardware;
  - ação primária no índice 0 e "Reiniciar" mantido logo após "Continuar";
  - "Marcar assistido" sempre por último;
  - `seriesPrimaryAction` pura em `episodeNavigation.ts`;
  - modal de temporada sempre abre, mesmo com uma temporada.
- **D-010 — Progresso só com denominador real.** Barra de episódio só com `duration_seconds`; filme e episódio sem duração mostram o texto "Continuar de mm:ss".
- **D-011 — Mocks no registro único.** `trailer` (32), `cast` (45) e `similar` (45) em `comingSoon.ts`. Botões e abas soft disabled, focáveis, e OK só anuncia "Em breve".
- **D-012 — Seletores fixados pelo contrato.** `.side-category-nav-item`, `.topbar-item` (`aria-current="page"` no atual), `.content-card` / `.content-card-title` (card focado contém `.tv-focus`), `.tv-focus`.
- **D-013 — `SideCategoryNav` ganha cabeçalho de grupo opcional** (`groupLabel?` por entrada, desenhado antes da primeira de cada grupo). A Live não passa nada e fica idêntica.
- **D-014 — Hero band sem leitura própria.** Usa `useWatchedIds`, o novo `useResumePositions(sourceId, kind)` (uma leitura por fonte/tipo, como `useWatchedIds`) e o resumo da 019, todos já carregados pela tela. Não é focável e não tem ações.
- **D-015 — Um arquivo CSS próprio.** `tv-web/src/styles/vod.css`, importado em `main.tsx` depois de `live.css`. Regras antigas de `screens.css` (`.poster-grid*`, `.poster-cell`, `.movie-detail-*`, `.series-detail-*`, `.season-tab*`, `.episode-*`, `.category-content`, `.category-title-row`) só saem depois de uma busca no código provar que nenhuma tela as usa (cuidado da 024, R-009 dela).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Nada de conta; perfil = lista (ADR-011). |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Os dados novos (ano, inclusão, duração, URL de imagem de episódio) vêm da mesma resposta do provedor que já é lida; a URL da imagem segue ADR-010 (nunca em log, erro ou texto, FR-051). A verificação T001 usa a credencial de teste do `.env` sem imprimi-la. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Categorias na ordem declarada; ★/↺/Todos são virtuais. Ordenar reordena **itens** dentro da entrada, nunca categorias, e "Ordem da fonte" é o padrão. |
| IA e Classificação Nunca Inventam Dados | ⚠️ | ✅ | Pré-design, a spec pedia "barra de progresso real" sem denominador guardado e "Ano"/"Recém-adicionados" sem dado no catálogo. Resolvido: captura de campo próprio da fonte (contrato travado recusa título e `last_modified`), barra só com duração, opção ausente sem dado, e o detalhe perde os placeholders que imitavam conteúdo. |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Navegação, ordenação, memória, Histórico e hero band são locais. O Histórico nunca chama `ensureSeriesEpisodes`. |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | ✅ | ✅ | "Trailer" é mock que só anuncia. O Histórico é só leitura (FR-014). |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Favoritar ganha um terceiro caminho ("Minha Lista" no detalhe). Pesquisar, Ordenar e temporada são alcançáveis por setas + OK, e RETURN fecha modal antes de sair. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | ✅ | ✅ | Sem mudança no caminho de reprodução. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Todo estado com ação acionável por SELECT (padrão da 024). ↺ vazio com "Voltar". O modal de temporada abre mesmo com uma temporada. A hero band não é focável, então nunca prende o foco. Focar não dispara leitura (D-014). |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Snapshot da 017 estendido com `history`. Memória por entrada por identidade (contrato travado). Ordenar mantém o mesmo item focado. `focusedIndexHint` é só dica de vizinho. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Histórico lido por `stableId` e resolvido por `resolveFavorites` (id do painel/nome), nunca por URL. Isolado por `sourceId`. |
| Progresso e Capacidades São Reais, Nunca Prometidos | ⚠️ | ✅ | Mesmo ponto do "Nunca Inventam Dados": sem denominador não há barra (D-010). Contagem de ↺ só quando conhecida. Nota honesta de não resolvidos. Notas de cobertura e truncamento mantidas. |
| Documentação do Repositório É Canônica | ✅ | ✅ | O comentário de `markCompleted`, falso desde a 012, é corrigido na mesma feature. `CLAUDE.md`, o roteiro de migração e o backlog são atualizados no converge; spec emendada com as 3 clarificações do plan. |

Sem violação não justificável. Os dois ⚠️ pré-design eram lacunas da spec
contra a constitution, fechadas com o usuário na sessão de planejamento
(spec, Clarifications) antes do design.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/025-filmes-series-ds-v14/
├── spec.md
├── plan.md                 # este arquivo
├── research.md             # R1 campos do painel, R2 sort estável, R3 altura da grade
├── data-model.md
├── logic/
│   ├── historico.md
│   ├── foco-vod.md
│   ├── metadados-vod.md
│   └── detalhe-vod.md
├── quickstart.md
├── contract-tests.lock
└── tasks.md
```

### Source Code (repository root)

Só o que esta feature toca, na estrutura real:

```text
tv-web/
├── e2e/
│   ├── capa-real.mjs                       # atualizar seletores
│   ├── historico-continuar-assistindo.mjs  # atualizar seletores
│   ├── favoritos.mjs                       # atualizar seletores (Filmes/Séries)
│   ├── busca-por-categoria.mjs             # atualizar seletores (Filmes/Séries)
│   ├── paridade-visual.mjs                 # novas telas de referência
│   ├── shell-visual.mjs                    # conferir
│   ├── m3u-sob-demanda.mjs                 # conferir
│   ├── ciclo-vida-player.mjs               # conferir (detalhes)
│   └── filmes-series-ds-v14.mjs            # NOVO
├── src/
│   ├── App.tsx                             # `shell` para Filmes/Séries
│   ├── main.tsx                            # importa styles/vod.css
│   ├── components/
│   │   ├── SideCategoryNav.tsx             # groupLabel opcional (D-013)
│   │   └── iconPaths.ts                    # ícone `history`
│   ├── features/
│   │   ├── catalog/
│   │   │   ├── catalogApi.ts               # campos novos (stub), useHistoryContent, useResumePositions, invalidações
│   │   │   └── categoryScreenSnapshot.ts   # `history`, focusedIndexHint
│   │   ├── vod/                            # NOVO
│   │   │   ├── VodCatalogScreen.tsx
│   │   │   ├── vodShell.ts                 # stub (tipos)
│   │   │   ├── vodSessionMemory.ts         # stub (funcional)
│   │   │   ├── vodSort.ts                  # stub
│   │   │   └── vodSort.filmes-series-ds-v14.contract.test.ts        # TRAVADO
│   │   ├── movies/
│   │   │   ├── MoviesScreen.tsx            # invólucro + `shell` (stub da prop)
│   │   │   ├── MovieDetailScreen.tsx       # layout V14
│   │   │   └── MoviesScreen.filmes-series-ds-v14.contract.test.tsx # TRAVADO
│   │   └── series/
│   │       ├── SeriesScreen.tsx            # invólucro + `shell`
│   │       ├── SeriesDetailScreen.tsx      # layout V14
│   │       └── episodeNavigation.ts        # seriesPrimaryAction, episodeCode
│   ├── lib/
│   │   ├── comingSoon.ts                   # trailer, cast, similar
│   │   └── catalog/
│   │       ├── db.ts                       # year, addedAt, durationSeconds (stub)
│   │       ├── classifier.ts               # campos (stub) + normalize*
│   │       ├── xtreamConnector.ts          # captura
│   │       ├── categoryLoader.ts           # cópia dos campos
│   │       ├── importPipeline.ts           # cópia dos campos (caminho integral legado)
│   │       ├── seriesLoader.ts             # iconUrl/durationSeconds do episódio
│   │       ├── userStateRepository.ts      # listPlayed; comentário de markCompleted
│   │       ├── history.ts                  # stub (loadHistory)
│   │       ├── history.filmes-series-ds-v14.contract.test.ts        # TRAVADO
│   │       └── vodMetadata.filmes-series-ds-v14.contract.test.ts    # TRAVADO
│   ├── styles/vod.css                      # NOVO
│   └── features/screens.css                # remoção das regras antigas sem uso
```

**Structure Decision**:

- Frontend único em `tv-web/`; o `api/` não é tocado (fallback congelado, ADR-008).
- A pasta nova `src/features/vod/` abriga o que Filmes e Séries compartilham. Ela importa de `features/catalog`, `features/favorites` e `features/shell`, como Live/Filmes/Séries já fazem hoje; nunca de `features/movies` ou `features/series`.
- Mesma divisão das features 021 a 024.

## Complexity Tracking

Sem violações a justificar.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```powershell
npx vitest run <arquivo>          # o mais estreito primeiro
npm run test                      # suíte completa (vitest run)
npx tsc -b
npm run lint
npm run build
npm run build:tizen
npm run dev                       # antes dos E2E (recém-iniciado)
npm run test:e2e                  # e2e.mjs
node e2e/<script>.mjs             # scripts por feature (override do Chromium no Windows)
```

- **Paridade de comportamento**: `MoviesScreen.test.tsx`, `SeriesScreen.test.tsx`, `*.favorites.test.tsx`, `MovieDetailScreen.test.tsx` e `SeriesDetailScreen.test.tsx` mudam só seletores e o que o layout novo exige (ex.: ícone → campo "Pesquisar"; índice da ação primária 1 → 0), nunca uma asserção de comportamento. Uma asserção que deixar de fazer sentido é registrada em `Riscos e Decisões` antes de ser mudada.
- **Flake conhecido**: `*.favorites.test.tsx` e `LiveScreen.test.tsx` às vezes falham sob paralelismo da suíte completa e passam isolados. Confirmado de novo neste plano: `SeriesScreen.favorites` + `LiveScreen.favorites` 19/19 e `LiveScreen.test` 67/67 isolados. Uma falha nova nesses arquivos precisa ser rodada isolada antes de ser tratada como regressão.
- **Contratos de outras features que tocam a área**: `seriesWatchedSummary.historico.contract.test.ts` e `userStateRepository.historico.contract.test.ts` (019), `LiveScreen.*.contract.test.tsx` (018/024), `appNav.*.contract.test.ts` (023/024), `ContentCard`/`Modal` (022) continuam verdes sem edição.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:

- `tv-web/src/lib/catalog/history.filmes-series-ds-v14.contract.test.ts`
- `tv-web/src/features/vod/vodSort.filmes-series-ds-v14.contract.test.ts`
- `tv-web/src/lib/catalog/vodMetadata.filmes-series-ds-v14.contract.test.ts`
- `tv-web/src/features/movies/MoviesScreen.filmes-series-ds-v14.contract.test.tsx`

Comando (em `tv-web/`):

```powershell
npx vitest run src/lib/catalog/history.filmes-series-ds-v14.contract.test.ts src/features/vod/vodSort.filmes-series-ds-v14.contract.test.ts src/lib/catalog/vodMetadata.filmes-series-ds-v14.contract.test.ts src/features/movies/MoviesScreen.filmes-series-ds-v14.contract.test.tsx
```

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `loadHistory` — Filmes: reproduzidos da lista ativa, mais recente primeiro, com concluídos; marcado sem reprodução fica fora; sem correspondência conta como não exibível | FR-009, FR-011, FR-012, FR-015, US2/AC1, US2/AC5, US2/AC6, SC-004, Constitution: "Identidade de Reprodução Não Depende da URL" | Fase 2 | `Error: not implemented` |
| `loadHistory` — Séries: uma entrada por série na posição do episódio mais recente; nunca episódio solto; episódio sem série exibível conta como não exibível | FR-010, FR-012, US2/AC2, SC-004, Constitution: "IA e Classificação Nunca Inventam Dados" | Fase 2 | `Error: not implemented` |
| `vodSort` — só oferece opção com dado real; sem dado no fim; empate mantém a ordem da fonte; não muta a entrada | FR-019, FR-020, US4/AC4-AC5, SC-006, Constitution: "Progresso e Capacidades São Reais" | Fase 2 | `Error: not implemented` |
| metadados — ano/inclusão só de campo próprio; ilegível/implausível vira ausência; título e `last_modified` nunca usados | FR-049, FR-050, Constitution: "IA e Classificação Nunca Inventam Dados" | Fase 2 | `AssertionError: expected undefined to be 2019` |
| `MoviesScreen` — sob a topbar, side nav V14 na ordem certa, cada entrada lembra o último card focado | US1/AC1-AC3, US1/AC6, FR-001..FR-003, FR-006, FR-027, FR-030, SC-007, Constitution: "Voltar Restaura Foco e Posição" | Fase 3 | `AssertionError: expected undefined to be defined` (sem `.topbar-item`) |

Vermelho confirmado em 2026-09-27: 5/5 falhando por `not implemented` ou
por asserção, nenhum por import, sintaxe ou tipo. `tsc -b` limpo. A suíte
da área (`src/features/{movies,series,catalog,vod,live}`, `src/lib/catalog`,
`src/navigation`) ficou com 538 testes passando mais os 5 contratos
vermelhos. As outras 3 falhas eram o flake conhecido
(`SeriesScreen.favorites`, `LiveScreen.favorites`, `LiveScreen.test`), que
passou 19/19 e 67/67 isolado.

**Stubs criados pelo plan** (ponto de partida do execute, não travados):

- `tv-web/src/lib/catalog/history.ts`: `loadHistory` lança `not implemented`.
- `tv-web/src/features/vod/vodSort.ts`: `availableSortOptions`/`sortVodItems` lançam; `VOD_SORT_LABELS` pronto.
- `tv-web/src/features/vod/vodSessionMemory.ts`: já funcional (Map em módulo), sem consumidor ainda.
- `tv-web/src/features/vod/vodShell.ts`: tipo `VodShellProps`.
- Prop `shell?: VodShellProps` em `MoviesScreen` (ainda ignorada).
- Campos `year`/`addedAt`/`durationSeconds` em `ClassifiedEntry` e `CatalogRecord` (ainda não preenchidos).
- `year`/`added_at` em `CatalogItemOut` e `icon_url`/`duration_seconds` em `EpisodeOut` (ainda não mapeados).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup) | Concluída, com uma pendência de ambiente: T001 não pôde consultar o painel real (sem `.env`/credencial neste container). T002 (mocks) e T003 (ícone) feitos. |
| Fase 2 (Foundational) | Concluída. 4/4 contratos da fase verdes; dados (ano/inclusão/duração/imagem/histórico), `vodSort`, extensões de `CategoryScreenSnapshot`/`SideCategoryNav` prontos. |
| Fase 3 (US1) | Concluída. 5º contrato da feature (`MoviesScreen`) verde — os 5/5 contratos da feature 025 estão verdes. `VodCatalogScreen.tsx` sob a topbar, side nav V14, toolbar (Pesquisar), hero band, grade `ContentCard`, memória de foco por entrada, `MoviesScreen`/`SeriesScreen` como invólucros finos. |
| Fases 4–9 | Não iniciadas. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Os nomes dos campos de ano, inclusão, duração e imagem de episódio no painel real não foram confirmados neste repositório (`research.md` R1). | "Ano"/"Recém-adicionados"/barra podem nunca aparecer para a fonte real, mesmo com o código certo. | T001 verifica contra o painel real (credencial do `.env`, nunca impressa) antes da Fase 2. Nome adicional encontrado entra sem mexer no contrato. Se o painel não declarar, a ausência é o comportamento correto. **Ainda não verificado**: a sessão de execução em 2026-09-27 rodou num container remoto sem `.env` real (só `.env.example`), sem painel acessível — T001 não pôde ser executado. Implementação seguiu com os nomes de `research.md` R1 (já toleram ausência/nome diferente sem inventar dado). Uma sessão com acesso ao painel real e ao `.env` preenchido deve rodar T001 antes de fechar este risco. |
| R-002 | Altura útil da grade com toolbar + hero band fixa (`research.md` R3). | Menos de 2 linhas de cards visíveis vira uma faixa difícil de navegar. | Título da entrada na toolbar, hero ≈150px; conferir por screenshot no E2E e, se possível, na TV. Reduzir a hero antes do card. |
| R-003 | Unificar `MoviesScreen`/`SeriesScreen` num `VodCatalogScreen` é uma reescrita grande de ~1400 linhas com comportamento acumulado de 009/010/013/014/015/017/018/019. | Regressão silenciosa de um caso de borda (prefetch com a categoria já entrada, `source_missing`, cobertura de "Todos", selo "Em dia"). | Os testes de comportamento existentes das duas telas são a rede. Eles mudam só seletores, e qualquer asserção que mudar é registrada aqui antes. US3 é uma fase própria de verificação. **Fase 3 (T033)**: as mudanças em `MoviesScreen.test.tsx`/`.favorites.test.tsx`/`SeriesScreen.test.tsx`/`.favorites.test.tsx` foram só seletor (`.poster-*`→`.content-card*`/`.vod-grid*`, `.live-column-groups .live-item`→`.side-category-nav-item`, `.search-icon-button`→`.vod-toolbar-search-button`) **mais duas mudanças de conteúdo esperadas pela própria spec, não regressão**: (1) a lista de entradas da side nav ganhou "Histórico" (FR-006, nova nesta feature); (2) "★ Favoritos" passou a mostrar sua contagem real também nos testes que não seedam favorito nenhum, aparecendo como "Favoritos0" no instante síncrono antes da consulta resolver (mesma regra de contagem honesta da Live, FR-007) — nenhuma asserção de comportamento pré-existente foi invalidada, só passou a refletir uma entrada/contagem que a própria US1 introduz. |
| R-004 | Histórico de Séries não resolve episódio cujos episódios não foram obtidos na geração atual (fonte ressincronizada). | A série some do Histórico até ser aberta de novo. | Mesma limitação aceita do "Continuar assistindo" (019); a nota de não exibíveis diz quantos episódios ficaram de fora. Não chamar rede no Histórico (constitution). |
| R-005 | `lastWatched` de um item concluído é o da última gravação de progresso, não o instante da conclusão. | A ordem do Histórico pode ficar alguns minutos defasada para itens concluídos. | Aceito: gravar `lastWatched` em `markCompleted` colocaria no Histórico o que foi marcado à mão (FR-011). Registrado em `logic/historico.md` §1. |
| R-006 | CSS antiga compartilhada entre telas migradas e não migradas (`.live-state*`, `.search-field*`, `.live-truncated-note`, `.poster-*`). | Remover uma regra usada por outra tela quebra o visual dela sem teste pegar. | D-015: só remover depois de busca no código; `paridade-visual.mjs`/`shell-visual.mjs` como rede. |
| R-007 | O comentário de `markCompleted` afirma que ele atualiza `lastWatched`, e o código não faz isso. | Um executor pode "corrigir" o código pelo comentário e quebrar FR-011. | Corrigir só o comentário (T040, Fase 4), com referência a FR-011. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-27 | Fase 1 (Setup) | T002 (mocks `trailer`/`cast`/`similar`) e T003 (ícone `history`) feitos e testados. T001 bloqueado por ambiente (sem `.env`/painel real neste container remoto) — documentado em `research.md`/R-001, não fingido. | T001 pendente de uma sessão com acesso ao painel real. |
| 2026-09-27 | Fase 2 (Foundational) | `normalizeYear`/`normalizeAddedAt`/`normalizeDurationSeconds` (`classifier.ts`); captura em `mapVodEntry`/`mapSeriesEntry`/`fetchSeriesInfo` (`xtreamConnector.ts`); cópia em `categoryLoader.ts`/`importPipeline.ts`/`seriesLoader.ts`; mapeamento em `catalogApi.ts`; `vodSort.ts` completo; `listPlayed` (`userStateRepository.ts`); `loadHistory` (`history.ts`); `useHistoryContent`/`useResumePositions` + invalidações; `CategoryScreenSnapshot`/`SideCategoryNav` estendidos. 4/4 contratos da fase verdes, 517 testes da área verdes, `tsc -b` limpo, travas 018–024 íntegras. | Nenhuma nova. |
| 2026-09-27 | Fase 3 (US1) | `VodCatalogScreen.tsx` novo (shell/topbar↔conteúdo, side nav V14 com ↺ Histórico, toolbar "Pesquisar", hero band, grade `ContentCard` 205×302, memória de foco por entrada via `vodSessionMemory`, estados V14). `MoviesScreen`/`SeriesScreen` viraram invólucros finos. `App.tsx` passa `shell`. `vod.css` novo. 5º contrato da feature (`MoviesScreen`) verde de primeira — **5/5 contratos da feature agora verdes**. Testes pré-existentes (`MoviesScreen`/`SeriesScreen` + `.favorites`) atualizados (seletor + 2 mudanças de conteúdo esperadas pela spec, documentadas em R-003) — 130 testes da área, 1155 da suíte completa, `tsc`/lint/build/`build:tizen` limpos. | Passada visual no navegador real não feita nesta sessão (recomendada antes da TV física, não gate). |

**PRÓXIMO**: Fase 4 (US2, "↺ Histórico") — T037..T042: conteúdo/estado vazio/nota de não exibíveis/contagem na side nav para a entrada já wireada na Fase 3, mais T040 (corrigir só o comentário de `markCompleted`).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/catalog/classifier.ts` — `normalizeYear`/`normalizeAddedAt`/`normalizeDurationSeconds`.
- `tv-web/src/lib/catalog/xtreamConnector.ts` — captura de ano/inclusão/duração/imagem.
- `tv-web/src/lib/catalog/categoryLoader.ts`, `importPipeline.ts`, `seriesLoader.ts` — cópia dos campos.
- `tv-web/src/lib/catalog/history.ts` — `loadHistory`.
- `tv-web/src/lib/catalog/userStateRepository.ts` — `listPlayed`.
- `tv-web/src/features/catalog/catalogApi.ts` — `toItemOut`/`toEpisodeOut`, `useHistoryContent`, `useResumePositions`, invalidações.
- `tv-web/src/features/vod/vodSort.ts` — `availableSortOptions`/`sortVodItems`.
- `tv-web/src/features/catalog/categoryScreenSnapshot.ts` — `{kind:'history'}`, `focusedIndexHint`.
- `tv-web/src/components/SideCategoryNav.tsx` — `groupLabel?`.
- `tv-web/src/features/vod/VodCatalogScreen.tsx` — a tela compartilhada (novo, foco da Fase 3).
- `tv-web/src/features/movies/MoviesScreen.tsx` / `tv-web/src/features/series/SeriesScreen.tsx` — agora invólucros finos.
- `tv-web/src/features/catalog/categoryCount.ts` — reexport de `knownCategoryCount`.
- `tv-web/src/styles/vod.css` — CSS próprio da feature (D-015).
- `tv-web/src/App.tsx` — `shell` para Filmes/Séries.

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Este container de execução remota não tem o `.env` da raiz (só `.env.example`) — T001 (e qualquer verificação futura contra o painel real) não pode ser feito aqui. Precisa de uma sessão com o `.env` preenchido.
- PowerShell (`pwsh`) não vem pré-instalado neste container Linux; foi instalado manualmente em `/opt/microsoft/powershell/7` (tarball oficial) e linkado em `/usr/bin/pwsh` para os scripts de `.planning/scripts/powershell/` funcionarem. Uma sessão nova no mesmo tipo de container pode precisar repetir isso.
- `npm ci` em `tv-web/` precisou ser rodado manualmente (node_modules não vinha instalado neste checkout).
