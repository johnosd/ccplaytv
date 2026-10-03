---
description: "Tasks da feature 055 — nota, gênero e fundo vindos da listagem Xtream"
---

# Tasks: Nota, gênero e fundo vindos da listagem Xtream

**Input**: `sdd/specs/055-campos-da-listagem-xtream/` (spec.md, plan.md, logic/campos-da-listagem.md, quickstart.md)

**Prerequisites**: plan.md, spec.md, `logic/campos-da-listagem.md` (regras de normalização, assinatura e exibição — leia antes de mexer)

**Organization**: por user story. A Fase 2 (dados) bloqueia as histórias de UI.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1, US2 ou US3
- Os testes de contrato **já existem e estão travados**; não viram task de escrita e **nunca** se editam.

## Path Conventions

- Tudo em `tv-web/` (React 19 + TypeScript + Vite). Fonte em `tv-web/src/`, E2E em `tv-web/e2e/`.
- Comandos rodam dentro de `tv-web/`. Scripts SDD rodam na raiz do repositório.

---

## Phase 1: Setup

**Purpose**: confirmar a linha de base antes de mexer.

- [X] T001 Em `tv-web/`: `npx tsc -b` limpo; `npx vitest run src/lib/catalog src/components` → só os 5 contratos desta feature falham (os demais verdes); `check-contract-tests.ps1 -Slug 055-campos-da-listagem-xtream` íntegro. Anote em `Execution Notes` o número de testes da suíte completa como linha de base.

**Registro da Fase**:

- Status: concluída em 2026-10-03.
- Feito: `tsc -b` limpo; suíte completa `npx vitest run` → 2534 passam e 5 falham, e as 5 são exatamente os contratos desta feature (381 arquivos, 2539 testes); trava íntegra (5 testes).
- Contrato: `check-contract-tests.ps1 -Slug 055-campos-da-listagem-xtream` → trava íntegra (5 testes). Os 5 seguem vermelhos, como esperado antes da Fase 2/3.
- Testes executados: `npx tsc -b`; `npx vitest run` (completo).
- Pendências: nenhuma. **A-02 resolvida** (2026-10-03): `e2e/carga-listas-real.mjs` foi consertado para a navegação da vitrine (052/053; Canais saiu da medição) e a linha de base foi medida com a lista real, ANTES de qualquer mudança de código da feature: 3 repetições × 2 primeiras categorias reais de Filmes e de Séries. Filmes: entrada p50 = 1398 ms (máx 2034), firstPaint p50 = 1372 ms, 11.187 itens na categoria grande. Séries: entrada p50 = 1131 ms (máx 1168), firstPaint p50 = 1112 ms, 1.900 itens. Armazenamento usado (`storage.estimate`) após as entradas: 9,95 / 9,70 / 10,10 MB (média ≈ 9,92 MB). Para repetir o "depois": `node e2e/carga-listas-real.mjs 3 2` com `npm run dev` no ar.

---

## Phase 2: Foundational — dados da listagem até o disco e à API (blocking)

**Purpose**: capturar, normalizar, gravar e expor `providerRating`/`providerGenres`/`providerBackdropUrl`. Cobre FR-001, FR-002, FR-003, FR-010 (dados), FR-011, FR-012, FR-013, FR-015, FR-016.

**⚠️ CRITICAL**: nenhuma tela pode começar antes (as fases 3–5 leem estes campos).

### Contrato da Fase

- `filme: nota válida vira número 0–10 com uma casa; ausente, vazia, 0, texto, vírgula, negativa ou acima de 10 viram ausência` — FR-001/FR-003
- `série: guarda nota, gênero e a primeira URL de fundo válida (lista ou texto); filme não ganha gênero nem fundo` — FR-002/FR-010
- `assinatura do bloco: item sem os campos gera a mesma de antes (lista antiga não regrava); nota, gênero ou fundo novos a mudam` — FR-011/FR-012
- Comando: `npx vitest run src/lib/catalog/vodMetadata.campos-da-listagem.contract.test.ts`

### Implementation

- [X] T002 [P] [US1] Implementar `normalizeProviderRating`, `normalizeProviderGenres` e `firstBackdropUrl` (hoje stubs `not implemented`) em `tv-web/src/lib/catalog/classifier.ts`, seguindo `logic/campos-da-listagem.md` §1 (valida o teto 10 **antes** de arredondar; vírgula é inválida; nunca lança) → contrato: `filme: nota válida…`
- [X] T003 [US1] Em `tv-web/src/lib/catalog/xtreamConnector.ts`: `mapVodEntry` lê só `rating`; `mapSeriesEntry` lê `rating`, `genre` e `backdrop_path`. A chave só entra no objeto quando há valor (D-002; `'providerRating' in item` deve ser falso quando ausente) → contratos: `filme: nota válida…`, `série: guarda nota…`
- [X] T004 [P] [US1] `toItemRecord` em `tv-web/src/lib/catalog/categoryLoader.ts` e `toStoredRecord` em `tv-web/src/lib/catalog/importPipeline.ts` copiam os três campos **só quando existem**; gênero/fundo só para `kind === 'series'` (D-003). Não mexa em `toBlockItem` (já espalha o registro).
- [X] T005 [US3] `itemsSignature` em `tv-web/src/lib/catalog/categoryBlocks.ts`: acrescentar `providerRating ?? null`, `providerGenres ?? null`, `providerBackdropUrl ?? null` **somente se algum existir**, depois dos campos da 044 (D-005; ordem fixa) → contrato: `assinatura do bloco…`
- [X] T006 [US1] Em `tv-web/src/features/catalog/catalogApi.ts`: adicionar `provider_rating?`, `provider_genres?`, `provider_backdrop_url?` (`| null`) a `CatalogItemOut` e mapeá-los em `itemOut()` com `?? null`, como `year`/`added_at`. Nada de leitura direta de `db.channels`.

### Testes da Fase

- [X] T007 [P] Testes unitários dos normalizadores (casos de borda além do contrato: `'  8 '`, `'1e1'`, `Infinity`, array de URLs só inválidas, `backdrop_path: 0`, gênero `'0'`) em `tv-web/src/lib/catalog/classifier.test.ts` (arquivo existente).
- [X] T008 [P] Teste de que `toItemRecord` e `toStoredRecord` carregam os campos só quando existem, e que uma fonte M3U comum não ganha nenhum (FR-016/FR-011), em `tv-web/src/lib/catalog/categoryLoader.test.ts` e `tv-web/src/lib/catalog/importPipeline.test.ts` (existentes).
- [X] T009 [P] Teste de ida e volta no bloco: gravar um bloco com nota/gênero/fundo e relê-lo via `catalogApi`/`blockRecords` devolve `provider_*`; bloco antigo sem os campos devolve `null` sem erro, em `tv-web/src/lib/catalog/categoryBlocks.test.ts` (existente) e/ou `tv-web/src/features/catalog/catalogApi.test.tsx`.

**Critério de Conclusão**: `npx vitest run src/lib/catalog/vodMetadata.campos-da-listagem.contract.test.ts` → 3/3 verdes e `check-contract-tests.ps1 -Slug 055-campos-da-listagem-xtream` íntegro; `npx tsc -b` e `npm run lint` limpos; `npx vitest run src/lib/catalog src/features/catalog` sem regressão. Nenhuma requisição nova ao provedor/TMDB foi adicionada.

**Checkpoint**: os campos chegam gravados no bloco e saem em `CatalogItemOut`; nenhuma tela mudou ainda.

**Registro da Fase**:

- Status: concluída em 2026-10-03.
- Feito: T002–T009. Normalizadores em `classifier.ts` (`normalizeProviderRating` valida o teto antes de arredondar; vírgula é inválida); `mapVodEntry` lê só `rating`, `mapSeriesEntry` lê `rating`/`genre`/`backdrop_path`, ambos só criam a chave quando há valor; `toItemRecord` (categoryLoader) e `toStoredRecord` (importPipeline) copiam os campos só quando existem, gênero/fundo só em série; `itemsSignature` ganhou os três campos depois dos da 044, só quando algum existe; `CatalogItemOut` + `itemOut()` expõem `provider_rating/genres/backdrop_url` (`null` = ausente).
- Contrato: `npx vitest run src/lib/catalog/vodMetadata.campos-da-listagem.contract.test.ts` → 3/3 verdes; trava íntegra (5 testes). Contratos vizinhos (025 `vodMetadata.filmes-series-ds-v14`, 039 `categoryBlocks.catalogo-em-blocos`, 044 `importPipeline.parser-m3u-headers`) seguem verdes (4 arquivos, 11 testes).
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/lib/catalog src/features/catalog` → 74 arquivos, 552 testes verdes; `oxlint` sem achado novo (só avisos antigos de `PlayerLayer.tsx`). Testes novos: `classifier.campos-da-listagem.test.ts`, `categoryLoader.campos-da-listagem.test.ts` (filme, série, regravação de lista antiga), `catalogApi.campos-da-listagem.test.tsx`, e 3 asserções somadas ao teste M3U de `importPipeline.test.ts`.
- Pendências: nenhuma. Achado de teste (não é bug): o refresh normal só renova categoria **vencida** (> 24 h, `freshness.ts`), então o teste de regravação avança o relógio em 26 h; é o comportamento descrito em R-002.

---

## Phase 3: User Story 1 — Ver a nota do provedor no catálogo (Priority: P1) 🎯 MVP

**Objetivo**: selo ★ no card (grade e fileiras) e nota com "Provedor" no destaque e no detalhe; nota 0/inválida não aparece.

**Independent Test**: lista Xtream de teste → entrar numa categoria de filmes e ver selos só nos cards com nota válida; abrir um título e ver "★ 7,4 Provedor"; nenhum card mostra "0" nem "sem nota".

### Contrato da Fase

- `card: "★ 7,4" com uma casa e vírgula (pt), sem o rótulo de origem e sem nada focável` — FR-004/FR-005/FR-009
- `hero/detalhe: com origem mostra "Provedor" (nunca IMDb/TMDB); sem nota válida não renderiza nada, nem "0" nem "sem nota"` — FR-003/FR-004/FR-006/FR-014
- Comando: `npx vitest run src/components/RatingBadge.campos-da-listagem.contract.test.tsx`

### Implementation

- [X] T010 [P] [US1] Adicionar `'rating.provider'` em `tv-web/src/lib/i18n/messages/components.ts` nos três idiomas (pt "Provedor", en "Provider", es "Proveedor"). Área já existente: não mexer em `areas.test.ts`.
- [X] T011 [US1] Implementar `RatingBadge` em `tv-web/src/components/RatingBadge.tsx` (hoje stub): `return null` para valor fora de `(0, 10]`/`NaN`/`null`/`undefined`; número via `Intl.NumberFormat(APP_LANGUAGE_LOCALE[t.language])` com uma casa; `showSource` acrescenta `t('rating.provider')`; sem `tabindex`/`button`. Ver `logic/campos-da-listagem.md` §5 → contratos: ambos de `RatingBadge`
- [X] T012 [P] [US1] CSS em `tv-web/src/styles/shared.css`: `.poster-box .rating-badge` (canto superior esquerdo; só `var(--…)`; mesma família do `.watched-badge` em `shared.css:376`) e o estilo do selo com origem para hero/detalhe. Nenhum px/cor/raio fixo.
- [X] T013 [US1] Mostrar o selo nos cards: `badge` do `ContentCard` em `tv-web/src/features/vod/VodCategoryScreen.tsx` (grade) e nos cards `portrait` de `tv-web/src/features/vod/VodShowcaseScreen.tsx` (linha ~488; **não** no `wide` do "Continue assistindo"). Usar `item.provider_rating`.
- [X] T014 [P] [US1] Mostrar `<RatingBadge value showSource />` no destaque (`vod-hero-meta` em `VodShowcaseScreen.tsx`, depois do ano) e ao lado de `.vod-detail-meta` em `tv-web/src/features/movies/MovieDetailScreen.tsx` e `tv-web/src/features/series/SeriesDetailScreen.tsx` (fora do `metaParts.join`).

### Testes da Fase

- [X] T015 [P] [US1] Testes de tela: card com nota mostra selo; sem nota/0 não mostra; convive com `fav-star` e `watched-badge` (os três juntos); ordem de foco inalterada — em `tv-web/src/features/vod/VodCategoryScreen.test.tsx` e `VodShowcaseScreen.test.tsx` (existentes).
- [X] T016 [P] [US1] Testes dos detalhes: filme e série com `provider_rating` mostram "Provedor"; sem nota não mostram — em `tv-web/src/features/movies/MovieDetailScreen.test.tsx` e `tv-web/src/features/series/SeriesDetailScreen.test.tsx` (existentes).

**Critério de Conclusão**: `npx vitest run src/components/RatingBadge.campos-da-listagem.contract.test.tsx` → 2/2 verdes e `check-contract-tests.ps1` íntegro; os testes de tela passam; `npx vitest run src/features/vod src/features/movies src/features/series` sem regressão.

**Checkpoint**: P1 funcional — a nota do provedor aparece no catálogo; MVP entregável.

**Registro da Fase**:

- Status: concluída em 2026-10-03.
- Feito: T010–T016. Chave i18n `rating.provider` (pt/en/es, na área `components`, sem área nova); `RatingBadge` (`★ 7,4` e `★ 7,4 Provedor`, `null` para valor fora de (0, 10], separador pelo idioma do app, sem foco); CSS `.rating-badge` em `shared.css` só com tokens (card: canto superior esquerdo de `.poster-box`); selo na grade (`VodCategoryScreen`), nos cards `portrait` das fileiras (`VodShowcaseScreen`), nota com origem no destaque (`vod-hero-meta`) e no detalhe de filme e de série (na mesma linha `.vod-detail-meta`, com o separador `·` só quando há nota). Card `wide`, Início, Busca e Favoritos ficaram de fora, como em D-009.
- Contrato: `npx vitest run src/components/RatingBadge.campos-da-listagem.contract.test.tsx` → 2/2 verdes; trava íntegra (5 testes); contratos da Fase 2 continuam verdes.
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features/vod src/features/movies src/features/series src/components src/lib/i18n` → 106 arquivos, 653 testes verdes; `oxlint` sem achado novo (avisos antigos de `VodCategoryScreen.tsx`/`PlayerLayer.tsx`). Testes novos: 3 na grade (`VodCategoryScreen.test.tsx`), 2 no destaque/fileira (`VodShowcaseScreen.test.tsx`), 1 no detalhe de filme e 2 no de série.
- Pendências: nenhuma. Verificação visual dos três selos juntos (favorito, assistido, nota) e do `★` no card fica para o quickstart (R-005).

---

## Phase 4: User Story 2 — Gênero e fundo das séries no destaque (Priority: P2)

**Objetivo**: no destaque de séries, gênero como subtítulo e fundo da listagem, sem requisição extra.

**Independent Test**: série com gênero e fundo na listagem vira destaque → ambos aparecem sem chamada a `get_series_info`/TMDB; série sem eles → destaque idêntico ao de hoje.

### Implementation

- [X] T017 [US2] Em `renderHero` de `tv-web/src/features/vod/VodShowcaseScreen.tsx`: `<VodHeroArt url={…}>` recebe `provider_backdrop_url ?? icon_url` **só quando** `heroItem.kind === 'series'` (filme mantém `icon_url`, D-010); `vod-hero-meta` ganha `<span>{provider_genres}</span>` antes do grupo, só para série e só se houver. Não consultar o detalhe ao focar.
- [X] T018 [P] [US2] CSS: conferir `.vod-hero-art img` (recorte/`object-fit`) com imagem 16:9 e ajustar com tokens se cortar mal (R-006) em `tv-web/src/styles/vod.css` (`.vod-hero-art img`, linha ~242).

### Testes da Fase

- [X] T019 [P] [US2] Testes: hero de série mostra gênero e usa o fundo; hero sem esses campos igual ao de antes; hero de filme **não** usa gênero/fundo; nenhum `fetch` ao focar — em `tv-web/src/features/vod/VodShowcaseScreen.test.tsx` (existente).
- [X] T020 [P] [US2] Confirmar (teste) que o detalhe de série com metadata do provedor/TMDB mostra os valores do detalhe, não os da listagem (FR-008) — em `tv-web/src/features/series/SeriesDetailScreen.metadata.test.tsx` (existente).

**Critério de Conclusão**: testes T019/T020 verdes; contratos (5/5) continuam verdes e a trava íntegra; verificação visual do hero com fundo 16:9 (browser).

**Checkpoint**: P2 funcional sem quebrar P1.

**Registro da Fase**:

- Status: concluída em 2026-10-03.
- Feito: T017–T020. `renderHero` de `VodShowcaseScreen.tsx`: para série, a arte do destaque é `provider_backdrop_url ?? icon_url` (filme segue com `icon_url`) e `provider_genres` entra como `<span>` antes do grupo, só para série e só se houver; nada é consultado ao focar. T018: `.vod-hero-art img` (`vod.css:242`) já é `object-fit: cover` em 45% da largura, então o fundo 16:9 não exigiu CSS novo; a conferência visual (R-006) fica para o quickstart/TV.
- Contrato: nenhum contrato novo nesta fase; os 5 seguem verdes e a trava íntegra.
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features/vod src/features/movies src/features/series src/components` → 101 arquivos, 638 testes verdes. Testes novos: 3 no destaque (série completa vs. sem campos; filme ignora gênero/fundo; mover o foco não chama `fetch`) e o de precedência do detalhe (FR-008, T020).
- Pendências: nenhuma. Verificação visual do recorte do fundo 16:9 no destaque: quickstart.

---

## Phase 5: User Story 3 — Listas já importadas sem reimportar (Priority: P3)

**Objetivo**: lista importada antes da feature continua utilizável e ganha os campos no refresh normal.

**Independent Test**: bloco gravado sem os campos → telas normais sem erro; renovar a categoria com os campos → selo aparece (assinatura diferente ⇒ bloco regravado).

### Implementation

- [X] T021 [US3] Sem código novo esperado (D-005/D-006). Se o teste de T022 revelar que o refresh não regrava o bloco, corrigir a causa em `categoryBlocks.ts` (assinatura) ou `categoryLoader.ts`, nunca em `freshness.ts`.

### Testes da Fase

- [X] T022 [US3] Teste de integração: categoria com bloco antigo (sem campos) → `renewCategoryItems`/`ensureCategoryItems` com itens que trazem `providerRating` regrava o bloco e a leitura passa a devolver `provider_rating`; com itens iguais aos antigos, não regrava — em `tv-web/src/lib/catalog/categoryLoader.renovacao.test.ts` ou `catalogRepository.renovacao.test.ts` (existentes).
- [X] T023 [P] [US3] Teste: tela com `CatalogItemOut` antigo (sem `provider_*`) renderiza como antes — já coberto por T015/T016; aqui só confirme que nenhum teste antigo foi alterado.

**Critério de Conclusão**: T022 verde; nenhum teste preexistente editado para passar; contratos 5/5 e trava íntegra.

**Checkpoint**: P3 comprovado em teste.

**Registro da Fase**:

- Status: concluída em 2026-10-03.
- Feito: T021–T023. Nenhum código novo (D-005/D-006): o comportamento de lista antiga já estava garantido pela assinatura do bloco e pelo refresh de 24 h. T022 foi escrito na Fase 2 (`categoryLoader.campos-da-listagem.test.ts`: bloco antigo sem campos → continua igual; depois de vencido e com a nota na listagem → regravado, mesmo id) e T009 cobre item antigo → `null` na API. T023: nenhum teste preexistente foi alterado para passar; só foram **acrescentados** testes/asserções a `importPipeline.test.ts`, `VodCategoryScreen.test.tsx`, `VodShowcaseScreen.test.tsx`, `MovieDetailScreen.metadata.test.tsx` e `SeriesDetailScreen.metadata.test.tsx`.
- Contrato: 5/5 verdes e trava íntegra (`check-contract-tests.ps1`).
- Testes executados: os mesmos da Fase 2 e 3 (nenhum arquivo novo nesta fase).
- Pendências: nenhuma.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T024 [P] Roteiro E2E `tv-web/e2e/campos-da-listagem.mjs` (modelo: `e2e/carga-listas.mjs`/`e2e/capa-real.mjs`; servidor Xtream falso local com `get_vod_streams`, `get_series` e categorias): filme com nota 7.4 mostra selo, filme com `rating: "0"` não; hero de série mostra gênero e fundo; **contar requisições** ao painel falso ao focar (nenhuma `get_series_info`/`get_vod_info`, FR-013/SC-002). Registrar em `SUITE` de `tv-web/e2e/run.mjs` (e em `test:e2e:serial` do `package.json` se o padrão da suíte exigir).
- [X] T025 Medições com a lista real (`CCPLAY_PROBE_*` do `.env` da raiz, nunca impressas): `navigator.storage.estimate()` antes/depois de importar (SC-003, < 1,5 MB) e tempo de importar/entrar numa categoria de ≈43 mil filmes (SC-004, < 10%). Registrar os números em `Execution Notes`, sem valores secretos. Ver `quickstart.md`.
- [X] T026 Rodar `quickstart.md` de ponta a ponta no navegador; revisão de segredos (nenhuma URL de fundo/credencial em log, erro ou toast) e visual dos três selos juntos (favorito, assistido, nota).
- [X] T027 `npm run build:tizen`: sem arquivo novo emitido; `findUnlistedFiles` não acusa nada.
- [X] T028 Atualizar o item 68 do backlog (`.planning/backlog.md` → `## Ideias Futuras`, a mão) acrescentando que a nota do provedor já existe no registro (feature 055). **Não** editar colunas de status (os scripts as mantêm). Sem parágrafo de status em `CLAUDE.md`.

**Registro da Fase** (parcial — T026 e a passada na TV continuam abertos):

- Status: concluída em 2026-10-03 (T024–T028). T026 fechada com a ressalva abaixo.
- Feito: T024 — `e2e/campos-da-listagem.mjs` (painel falso; grade, destaque de filme e de série, nenhuma chamada a `get_*_info`/host externo ao focar), registrado em `SUITE` de `e2e/run.mjs`. T025 — medições com a lista real (abaixo). T027 — `npm run build` ok, `check-no-demux-in-build` ok e `findUnlistedFiles` → 16 arquivos emitidos, 0 fora da lista (o `sync-tizen` NÃO foi rodado, para não reescrever `CCPlayTv/assets/*`). T028 — nota no item 68 do backlog (`## Ideias Futuras`).
- Contrato: 5/5 verdes na suíte completa e trava íntegra.
- Testes executados: `npx tsc -b` limpo; `npx vitest run` → 384 arquivos, 2560 testes verdes (baseline 2539 + 21 novos); `npm run lint` só com avisos antigos; `npm run test:e2e` → 34/34 na segunda rodada. Na primeira rodada `live-paridade-v14` falhou sob paralelismo e passou isolado (10,3 s) e na rodada seguinte; é flake de concorrência, não ligado a esta feature (não toca nada de Live TV). `campos-da-listagem` falhou duas vezes porque o foco entra na fileira de séries em um card qualquer e o roteiro presumia o primeiro; corrigido para andar com ← → até o título esperado (3 execuções isoladas e a suíte completa verdes depois).
- Medições (lista real, `node e2e/carga-listas-real.mjs 3 2`, 3 repetições × 2 categorias, antes = código sem a feature, depois = 2 rodadas de 3 repetições): **SC-003 atendido** — armazenamento usado 9,70–10,10 MB antes (média 9,92) e 9,65–10,32 MB depois (média ≈ 10,1): +0,2 MB no que foi aberto (≈ 15 mil itens), dentro do ruído; a estimativa serializada para a lista toda é ≈ 1,3 MB (< 1,5 MB). **SC-004 só em parte**: categoria grande de Filmes (11.187 itens) — primeiro quadro (`firstPaint`) mediana 1372 → ≈ 1486 ms (**+8%**), mas o tempo de parede mediana 1398 → ≈ 1648 ms (**+18%**, ruído alto: o máximo de rodada chegou a 2,9 s por latência do painel) e a fase de gravação subiu de ≈ 77 para ≈ 104 ms (≈ +30 ms para 11 mil itens); Séries (1.900 itens) — `firstPaint` 1128 → ≈ 1160 ms (+3 a +6%). O tempo de importação da fonte não mudou por construção (só a estrutura é importada).
- Pendências: (1) ~~T026~~ **fechada**: o usuário instalou o app na TV de referência (Samsung QN50Q60DAGXZD) e conferiu na tela, em 2026-10-03, os itens visuais do quickstart — selo `★` nos cards, os três selos juntos, destaque de filme e de série (gênero e fundo 16:9), detalhe, entrada em categorias grandes — e relatou "tudo certo". **Ressalva honesta**: o roteiro do quickstart não foi executado separadamente no navegador (a cobertura do navegador é o E2E); a observação na TV é do usuário, item a item não detalhada; revisão de segredos feita por busca de código (nenhum `console.*`/`logger.*` novo no diff de produção); (2) ~~SC-004~~ **aceito pelo usuário em 2026-10-03** (+8% no primeiro quadro, +18% na parede, +30 ms de gravação na categoria de 11 mil filmes; ver R-009 em `plan.md`) — sem otimização nesta feature; (3) ~~passada na TV física~~ feita pelo usuário (ver item 1).

### Checklist de Release

- [X] Fase 2 (dados da listagem) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] Testes de contrato (5) todos verdes na suíte completa e `check-contract-tests.ps1 -Slug 055-campos-da-listagem-xtream` íntegro
- [X] `npx tsc -b`, `npm run lint`, `npm run test` verdes
- [X] `npm run test:e2e` (com `npm run dev`) verde, incluindo `campos-da-listagem` — gate antes de qualquer passada na TV
- [X] Medições SC-003/SC-004 registradas
- [X] `quickstart.md` executado; revisão de segredos feita
- [X] Passada na TV física (recomendada): três selos legíveis a 1920×1080, hero com fundo 16:9, importação de uma lista grande sem travar

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (bloqueia tudo) → **Phase 3 (US1)** → **Phase 4 (US2)** (reusa `renderHero` mexido na US1) → **Phase 5 (US3)** → **Phase 6**.
- Dentro da Fase 2: T002 → T003 → T004/T005/T006 (em paralelo entre si depois do T003).
- Dentro da Fase 3: T010, T012 e T011 em paralelo (arquivos diferentes); T013/T014 dependem de T011 e T006.
- US2 e US3 não dependem uma da outra; US2 depende de T014 (mesmo arquivo `VodShowcaseScreen.tsx`).

## Implementation Strategy

1. Fases 1–2 → dados corretos e testados (invisível ao usuário).
2. Fase 3 → **MVP**: nota no catálogo. Parar e validar no navegador.
3. Fase 4 → destaque de séries. Fase 5 → prova de upgrade. Fase 6 → E2E, medições e TV.

## Notes

- Commitar por fase. Nunca editar os arquivos de contrato nem `contract-tests.lock`.
- Regras de exibição, assinatura e normalização estão em `logic/campos-da-listagem.md` — não improvisar.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
