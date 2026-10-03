# Implementation Plan: Vitrine de Filmes e Séries e tela de categoria em grade cheia

**Slug**: `052-vitrine-filmes-series` | **Date**: 2026-10-02 | **Spec**: `sdd/specs/052-vitrine-filmes-series/spec.md`

## Summary

Hoje Filmes/Séries são **uma tela** (`VodCatalogScreen`: sidebar + hero + toolbar + grade). Esta feature a divide em duas:

1. **Vitrine** (`VodShowcaseScreen`, destino da topbar): hero do card focado + fileiras horizontais (`Continue assistindo`, `★ Favoritos`, `Adicionados recentemente`, `Categorias`), construída sobre as peças que o **Início** já tem — `Rail`, `useIdFocus`, cartão "Ver todos", foco por id e rolagem vertical por fileira.
2. **Tela de categoria** (`VodCategoryScreen`, empilhada sobre a vitrine): só Pesquisar, Ordenar e a grade em tela cheia (2 × 6 com capa inteira). É o `VodCatalogScreen` **evoluído** (`git mv`) sem trilha, sidebar e hero — toda a lógica de grade (busca inline, ordenação, favoritos, remoção do histórico, memória de foco por entrada, paginação 049, key-repeat 046) é mantida.

A navegação ganha duas telas no `appNav` (`movies-category`, `series-category`), com a vitrine guardando o foco por id. Dados: nada novo é persistido; "Adicionados recentemente" é uma leitura local nova (`useRecentlyAdded`) sobre o índice que "Todos" já lê.

Regras do "como": `logic/vitrine-e-foco.md`.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Vite (build `chrome108` — não remover, CLAUDE.md).

**Primary Dependencies**: as existentes (`@tanstack/react-query`, `@tanstack/react-virtual`, Dexie). Nenhuma nova.

**Storage**: nenhum novo. Leituras: `useHistoryContent`, `useFavoritesContent`, `useCategoryList` (existentes) + `useRecentlyAdded` (novo, sobre `loadSearchIndex`).

**Testing**: Vitest + Testing Library (projetos `dom`/`node`), Playwright E2E (`tv-web/e2e/*.mjs`, dev server na 5173), contratos travados por `check-contract-tests.ps1`.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`), palco 1920×1080 (esticável na horizontal, `Stage.tsx`).

**Performance Goals**: a vitrine não pode ficar mais lenta que o Início para abrir; "Adicionados recentemente" lê o índice de busca (mesma leitura de "Todos") **depois** do primeiro quadro (fileira em `aria-busy` até chegar); selecionar os 12 mais novos é O(n log 12), sem ordenar o catálogo inteiro. Nenhum `filter: blur`; capas só as já pedidas pelos cards/hero.

**Constraints**: constitution 1.7.0; ADR-007/008/009/011; tokens de `index.css`; sem consulta nova ao provedor; focar nunca dispara nada. **Contratos travados** de 025/036/049/050 fixam o modelo atual (ver D-013/R-003); 022 (Rail), 023/024 (`appNav`) e 026 (Início) **não podem** quebrar.

**Scale/Scope**: 2 telas novas (1 delas por `git mv`), 1 módulo puro (`vodShowcase.ts`), 1 hook novo, 1 componente extraído (`SeeAllCard`), 2 telas no `appNav`, fiação em `App.tsx`, CSS em `vod.css`, migração dos E2E que usam a sidebar.

## Referências do Design System

Precedência (ADR-011): constitution > ADRs > **Spec V14** > **Component Lab** > protótipo. Onde divergem, vale a Spec/Lab.

| Elemento | Spec V14 | Component Lab / protótipo | Consequência |
| --- | --- | --- | --- |
| Hero + rails em Filmes/Séries | §32 "Filmes / Séries" (hero/contexto, rails, busca sob demanda, ordenação discreta) | protótipo `catalog()` `.catalog-hero-band` + `.catalog-rows` | D-005, D-006; rails com dado real (o protótipo usa curadoria fictícia — não adotada) |
| Rails | §17 (edge fade, indicador de posição, virtualização viewport+buffer), §16 cards | Lab `#rails` (`.edge-fade`, `.rail-position`) | D-007: `Rail` existente (virtualizado, fade, posição) |
| Categorias | §13.2 (★ Favoritos, ↺ Histórico, Todos fixos no topo; empty states instrutivos) | Lab `#categoriesv131` | D-004: fileira de cartões, mesma ordem |
| Foco | §11.1/§11.2 (linhas sem escala), §33 (vizinho claro, sem salto diagonal), §41 memória de foco por área | `#focus`, `#focuspath` | D-008, D-010 |
| Estados | §19, §45 (vazio com ação, erro com ação) | `#feedback` | FR-013: estados existentes mantidos nas duas telas |
| Tipografia | §6 (mín. 16px; caixa alta só em kicker) | `.kicker` | rótulos de fileira em `--fs-h2`; kicker do hero como na 050 |
| Performance | §30.2/§30.3 | `#performance` | sem blur; imagens no tamanho de uso; só a fileira em foco anima rolagem |

## Decisões Invariantes

- **D-001** Duas telas, dois componentes: `VodShowcaseScreen` (props em `features/vod/VodShowcaseScreen.tsx`) e `VodCategoryScreen` (`features/vod/VodCategoryScreen.tsx`). Os stubs do `sdd-plan` fixam as props. `MoviesScreen`/`SeriesScreen` passam a ser casquinhas **da vitrine**; a tela de categoria é renderizada pelo `App` direto (`section` por prop).
- **D-002** Navegação (`appNav.ts`): `movies`/`series` continuam sendo a vitrine (com `restore?: VodShowcaseFocus` no lugar do `CategoryScreenSnapshot`; `topbarFocus` e a troca de destino de topo `switch-top` **inalterados**); **novos** `{ name: 'movies-category' | 'series-category'; target: VodTarget; restore?: VodCategoryRestore; topbarFocus?: TopbarItem }`. Abrir uma categoria = `open` com `from: { ...vitrine, restore: foco }` (o redutor não muda); voltar = `back`. `openFavorites` (Início → "Filmes (N)"/"Séries (N)") vira `open` direto de `*-category` com `target: { kind: 'favorites' }`, e RETURN volta ao Início. As regras puras do redutor e os contratos 023/024 **não mudam**.
- **D-003** `VodTarget` (`features/vod/vodTarget.ts`): `favorites | history | all (sort?) | category (name)`. Categoria por **nome declarado pela fonte** (resolvido para id em runtime, como o `TrailKey` de hoje); nunca índice nem id volátil.
- **D-004** Fileiras, nesta ordem: `continue` (histórico), `favorites`, `added`, `categories`. Existem se houver itens (exceto `categories`, sempre). Itens: até 12 (`SHOWCASE_LIMIT`) + cartão "Ver tudo" no fim das três fileiras de itens. "Continue assistindo" = `useHistoryContent` (a mesma fonte de ↺ Histórico, para o "Ver tudo" ser coerente); "★ Favoritos" = `useFavoritesContent`; "Adicionados" = `useRecentlyAdded`. Cartões de categoria são **cartões de texto** (nome via `vodGroupDisplay` + contagem quando conhecida) — nunca capa inventada. Ordem das categorias: ★ Favoritos, ↺ Histórico, Todos e as da fonte na ordem dela.
- **D-005** Hero da vitrine = `VodHeroArt` + CSS `.vod-hero-*` da 050 (a regra experimental `display: none` sai). Com o foco numa fileira de itens mostra o card focado (metadados reais e rótulo `CCPLAY CINEMA`/`CCPLAY SÉRIES`, `★ SEUS FAVORITOS`/`↺ VISTOS RECENTEMENTE` conforme a fileira); com o foco na fileira de Categorias mostra o **nome da categoria e a contagem** (rótulo `CATEGORIA`; sem capa → só degradê). Sem botões, `aria-hidden`, nada focável; focar nunca consulta nem reproduz.
- **D-006** Altura da hero na vitrine: a da 050 (176px de referência), medida no E2E para que ≥ 2 fileiras apareçam inteiras sob ela (R-006).
- **D-007** Fileiras com `Rail` + `useIdFocus` (um por fileira, ids estáveis), cartão final `SeeAllCard` **extraído** de `HomeContent.tsx` para `components/SeeAllCard.tsx` com markup/classes idênticos (contrato 026 e testes do Início seguem verdes); a vitrine acrescenta só a classe `vod-see-all-card`. Rolagem vertical por fileira como a Home (`scrollIntoView` do bloco da fileira focada), sem `ResizeObserver` novo.
- **D-008** Foco da vitrine: ↑↓ entre fileiras (↑ da 1ª sai para a topbar quando há `shell`, como a Home), ←→ dentro da fileira (clamp, sem wrap), OK seleciona, RETURN → `onBack`. Cada fileira lembra o seu cartão por id (`useIdFocus`). `VodShowcaseFocus = { row, id }`; id de item = `item.id`, de categoria = `cat:<nome declarado>`, "Ver tudo" = `__see-all__` (constantes internas, o contrato só exige o round-trip). Restaurar: fileira + id; id que sumiu → mesmo índice clampado **na mesma fileira**; fileira que sumiu → fileira anterior existente; sem nada → 1ª fileira com itens ou `categories`.
- **D-009** `useRecentlyAdded(sourceId, kind)`: lê `loadSearchIndex` (a mesma consulta de "Todos"), aplica `recentlyAdded` e devolve ≤ 12; `staleTime` curto, sem rede; invalidado onde o índice é. Fileira em `aria-busy` (esqueleto) até chegar; some se vazia. Nenhum aviso de cobertura (spec).
- **D-010** Tela de categoria: `git mv VodCatalogScreen.tsx VodCategoryScreen.tsx` e remover trilha (`trail`, `TrailKey`, `col`, `categoryIdx`, side nav, `useCategoryFocusPrefetch` de foco de trilha), hero e snapshot de trilha. O alvo (`target`) substitui "entrada aberta" (`entered`): `favorites`/`history`/`all`/`category`. Mantidos sem mudança de regra: toolbar (Pesquisar inline ≥ 3 letras, Ordenar em modal), grade virtualizada, paginação por ← → (049, agora só na grade), `useRemoteNav` e key-repeat (046), favoritar (OK longo/amarela), remoção do histórico, memória por entrada (`vodSessionMemory`), estados vazio/erro/carregando. RETURN: com busca aberta fecha a busca (como hoje); senão `onBack`. `target.sort` ("Ver tudo" de Adicionados) = ordenação inicial `added` **só nesta abertura** (não grava a ordenação da sessão).
- **D-011** Geometria da grade (FR-007): 6 colunas × 2 linhas inteiras em 1920×1080, card ≥ 205px, capa inteira (proporção 205:302, nunca recorte — o experimento 4×2 de 2026-10-02 foi descartado), colunas distribuídas pela largura (CSS `--lane` da 050, que já fica). Sem sidebar/hero a área da grade é `1080 − 2×safe-y − topbar − toolbar`; o E2E **mede** e, se 2 linhas não couberem (margens originais), aplica a compactação decidida na spec: junta o rótulo da categoria e a contagem na linha da toolbar e reduz folgas — **nunca** encolhe o card abaixo de 205px. `ROW_HEIGHT`/`GRID_COLS` e o cálculo de página de 049 não mudam.
- **D-012** Reuso de CSS: `.vod-hero-*`, `.vod-toolbar-*`, `.vod-grid*`, `.vod-scroll-frame` da 050 continuam em `vod.css`; saem `.vod-side-panel`/`.vod-side-head`/`.vod-side-nav*` e a regra `.vod-hero-band { display: none }`. Novas: `.vod-showcase`, `.vod-row`, `.vod-row-title`, `.vod-category-card`, `.vod-see-all-card`. `SideCategoryNav` e `components.css` **não mudam** (Live/Configurações). Só tokens.
- **D-013** Contratos travados (decisão do usuário, 2026-10-02: **substituir e regravar**): são **amendados** — substituídos por testes equivalentes nas telas novas, com a trava regravada e `R-00X` registrado em cada `plan.md` de origem: `025` `MoviesScreen.filmes-series-ds-v14.contract.test.tsx` (ordem da side nav + memória por entrada → vitrine + categoria; a memória por entrada vive em `vodSessionMemory`, que **não muda**), `036` `VodCatalogScreen.limpar-historico.contract.test.tsx` (remoção do histórico → renomeado para `VodCategoryScreen.limpar-historico.contract.test.tsx`, entrando por `target: { kind: 'history' }`), `049` `VodCatalogScreen.navegacao-por-pagina.contract.test.tsx` (paginação da trilha + grade → só grade), `050` `MoviesScreen.paridade-v14.contract.test.tsx` (hero sobre grade + sidebar → hero da vitrine; o teste de cromo da sidebar é removido). **Nunca** editar/regravar sem executar a troca inteira e registrar; as demais travas (022, 023, 024, 026, 032, 033, 035, 046, 018, 019) **não mudam** e seguem íntegras.
- **D-014** Fora do código: margens/palco (`screen-margins.css`, `Stage.tsx`), detalhes, player, Live, Configurações, Busca **não são tocados**. O prefixo "Filmes |"/"Séries |" continua removido só na exibição (`vodGroupDisplay`).

- **D-015** (emenda de 2026-10-03, ver spec "Emendas") "Categorias" = lista lateral da vitrine: `.vod-side-panel` (340px, cabeçalho "Filmes"/"Séries") + `SideCategoryNav` (ids `pinned:favorites|history|all` e `cat:<nome>`), com a moldura de continuação e `useScrollFocusedIntoView`; as fileiras de itens vão à direita sob o hero. Foco: ← no 1º cartão de uma fileira vai à lista; → da lista vai à última fileira de itens; ↑/↓ andam na lista. Substitui a fileira de cartões de categoria de D-004/D-007 (os cartões `vod-category-card` foram removidos).
- **D-016** Moldura: `AppShell` com `hints` **opcional**; Filmes/Séries (vitrine e categoria) mostram a topbar e **não** o rodapé de dicas. Com a moldura sob a topbar, `ROW_HEIGHT` da grade = 402px (2 linhas inteiras em 1920×1080 e 2200×1000).
- **D-017** Grade fluida: 6 colunas coladas (`--space-1`), célula de largura `(100% − 5 vãos) / 6` e altura `ROW_HEIGHT − vão`, pôster `cover` (recorte lateral aceito, substitui "capa inteira" de D-011), título sobre o pôster (degradê `--scrim-media`, sombra `--text-shadow-media`). A moldura da grade é cortada a 2 linhas (`max-height` + `clip-path` meio vão para dentro) e a rolagem é por linha (`scrollToRow`, `scrollTop` múltiplo de `ROW_HEIGHT`, passado ao `useVirtualFocusSync`). Foco: `::before` com borda `--focus-ring-width`+1 e brilho interno `--accent-tint-border`, sem escala (a imagem absoluta cobriria um outline/box-shadow do próprio pôster).
- **D-018** Pré-carga por foco (038) preservada: `useCategoryFocusPrefetch` + `usePrefetchHint` na vitrine (categoria focada na lista lateral) e `usePrefetchHint` na categoria aberta. Substitui a parte de D-010 que mandava remover a pré-carga de trilha.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | — |
| Segredos Fora dos Clientes e dos Logs | OK | OK | Nenhuma URL de stream/credencial em DOM novo, log ou erro; capas vêm de `icon_url` já validada. |
| Categorias da Fonte São Preservadas | OK | OK | Cartões e rótulos só com nomes declarados pela fonte (prefixo só na exibição); nenhuma taxonomia externa nem fileira por gênero. |
| IA e Classificação Nunca Inventam Dados | OK | OK | Fileiras só com histórico, favoritos e `added_at` da fonte; item sem data fica fora (D-009); nenhum conteúdo do protótipo (relevância %, curadoria). |
| Comandos Locais Independem de Rede | OK | OK | Tudo local; `useRecentlyAdded` lê IndexedDB. |
| Trailers e Metadados Não Alteram o Estado | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho por Controle Remoto | OK | OK | Cada fileira, cartão, "Ver tudo", Pesquisar, Ordenar e favoritar têm tecla; RETURN volta um nível. |
| Lista de Catálogo ≠ Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Vitrine sem dados cai em Categorias (sempre existe); estados vazio/erro/carregando com ação focável nas duas telas; hero não focável e focar nunca consulta/toca (FR-010). |
| Voltar Restaura Foco e Posição | OK | OK | `VodShowcaseFocus {row, id}` e `VodCategoryRestore` por id; id sumido → vizinho da mesma fileira/grade (contrato S2). |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | Nada de identidade muda. |
| Progresso e Capacidades São Reais | OK | OK | Progresso só do histórico/retomada reais; nenhum % fictício. |
| Documentação do Repositório É Canônica | OK | OK | Polish atualiza backlog e os `plan.md` de 025/036/049/050 (R-00X de emenda); nenhuma ADR alterada. |

Sem violação; `## Complexity Tracking` fica vazio. (A emenda de contratos é decisão registrada do usuário, não violação.)

## Project Structure

### Documentation (this feature)

```text
sdd/specs/052-vitrine-filmes-series/
├── spec.md
├── plan.md
├── tasks.md
├── quickstart.md
├── handoff.md
├── contract-tests.lock
└── logic/
    └── vitrine-e-foco.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── navigation/appNav.ts                       # + 'movies-category' | 'series-category'; restore da vitrine (tipos)
│   ├── App.tsx                                    # renderiza vitrine e categoria; openFavorites → categoria
│   ├── components/SeeAllCard.tsx                  # NOVO: extraído de home/HomeContent.tsx (markup idêntico)
│   ├── features/
│   │   ├── home/HomeContent.tsx                   # importa SeeAllCard (sem mudança visual)
│   │   ├── catalog/
│   │   │   ├── catalogApi.ts                      # + useRecentlyAdded (stub do plan)
│   │   │   └── categoryScreenSnapshot.ts          # simplificado; FAVORITES_SNAPSHOT sai (vira target)
│   │   ├── movies/MoviesScreen.tsx                # casca da vitrine
│   │   ├── series/SeriesScreen.tsx                # casca da vitrine
│   │   └── vod/
│   │       ├── VodShowcaseScreen.tsx              # NOVO (stub do plan)
│   │       ├── VodCategoryScreen.tsx              # git mv de VodCatalogScreen.tsx (stub do plan até o mv)
│   │       ├── vodShowcase.ts                     # NOVO (stub): recentlyAdded, SHOWCASE_LIMIT
│   │       ├── vodTarget.ts                       # NOVO: VodTarget, VodShowcaseFocus, VodCategoryRestore
│   │       ├── VodHeroArt.tsx                     # existente (050)
│   │       ├── vodSessionMemory.ts                # existente — inalterado
│   │       └── *.vitrine-filmes-series.contract.test.ts(x)   # TRAVADOS (5)
│   └── styles/vod.css                             # vitrine + categoria; sai a sidebar
└── e2e/
    ├── lib/vod.mjs                                # NOVO: helper "abrir categoria X em Filmes/Séries"
    ├── vitrine-filmes-series.mjs                  # NOVO (Polish): capturas, 2×6 inteiras, anel, voltar
    └── (≈12 roteiros migrados para o helper)      # os que usam .side-category-nav-item em Filmes/Séries
```

**Structure Decision**: frontend único em `tv-web/`; telas em `features/vod/` (a vitrine não vai para `features/home/`: o Início continua sendo o destino de topo próprio). Peças compartilhadas viram componente só se já são usadas em 2 lugares (`SeeAllCard`).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx tsc -b
npm run lint
npx vitest run src/features/vod src/features/movies src/features/series src/features/home src/features/catalog src/navigation src/components
npm run test
npm run test:e2e        # com `npm run dev` rodando (confira a porta 5173)
npm run build
```

Integridade das travas (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug <slug>` para `052-vitrine-filmes-series` **e** as que a feature toca: `022-biblioteca-componentes-ds-v14` (Rail), `023-shell-navegacao-entrada-ds-v14` e `024-live-tv-ds-v14` (appNav), `026-home-busca-configuracoes-ds-v14` (Início/`SeeAllCard`), `046-memoria-foco-key-repeat`, `018-busca-por-categoria`, `019-historico-continuar-assistindo`. As quatro **amendadas** (025, 036, 049, 050) só são regravadas pela troca descrita em D-013.

Testes não travados que **vão** precisar de migração (viram testes da tela de categoria/vitrine, sem afrouxar o que protegem): `VodCatalogScreen.test.tsx`, `VodCatalogScreen.paginacao.test.tsx`, `VodCatalogScreen.limpar-historico.test.tsx`, `MoviesScreen.test.tsx`, `MoviesScreen.favorites.test.tsx`, `SeriesScreen.test.tsx`, `SeriesScreen.favorites.test.tsx`, `SeriesScreen.hero-paridade-v14.test.tsx`, `VodCatalogScreen.paridade-v14.test.tsx`, `App.test.tsx`, `appNav.test.ts`, E2E: os que usam `.side-category-nav-item` em Filmes/Séries (`audio-legendas-info`, `busca-por-categoria`, `capa-real`, `carga-listas`, `catalogo-em-blocos`, `ciclo-vida-player`, `favoritos`, `historico-continuar-assistindo`, `limpar-historico`, `metadata-tmdb`, `modal-temporada`, `semelhantes-elenco-ator`, `trailers`, `navegacao-por-pagina`, `home-busca-configuracoes`).

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5 testes):
`tv-web/src/features/vod/vodShowcase.vitrine-filmes-series.contract.test.ts`,
`tv-web/src/features/vod/VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx`,
`tv-web/src/features/vod/VodCategoryScreen.vitrine-filmes-series.contract.test.tsx`

Comando (de `tv-web/`):
`npx vitest run src/features/vod/vodShowcase.vitrine-filmes-series.contract.test.ts src/features/vod/VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx src/features/vod/VodCategoryScreen.vitrine-filmes-series.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `até 12 itens do mais novo ao mais antigo, ignora item sem data e mantém a ordem de entrada nos empates` | FR-003, US2/AC3, Constitution: IA/Classificação não inventam dados | Fase 2 | `Error: not implemented` |
| `categoria: só toolbar + grade (sem sidebar nem hero); OK abre o item com o estado de volta; RETURN volta à vitrine` | US1/AC1+AC3+AC4+AC5, FR-006, FR-008, FR-009 | Fase 3 | `expected null not to be null` |
| `★ Favoritos vazio: estado vazio com ação focável que volta à vitrine, e sem botão Ordenar` | US1/AC6, FR-008, FR-013, Constitution: Foco Visível | Fase 3 | `expected +0 to be 1` |
| `mostra só as fileiras com dado real + lista lateral de categorias (★, ↺, Todos primeiro); sem dado, o foco fica na lista lateral` (emendado em 2026-10-03, E-1) | US2/AC1..AC4+AC7, FR-001, FR-002, FR-005, FR-010, FR-014 | Fase 4 | `expected [] to deeply equal [ 'Continue assistindo', … ]` |
| `OK abre item, categoria e "Ver tudo" com o destino certo; o foco devolvido restaura o mesmo cartão por id` | US1/AC1+AC5, US2/AC6, FR-004, FR-005, FR-009, Constitution: Voltar Restaura Foco | Fase 4 | `expected "vi.fn()" to be called 1 times, but got 0 times` |

Vermelho confirmado em 2026-10-02 (5/5 falhando pelo motivo esperado); suíte da área (vod/movies/series/home/catalog) com os 344 testes anteriores verdes e `npx tsc -b` limpo com os stubs.

Stubs criados pelo plan (ponto de partida, não travados): `features/vod/VodShowcaseScreen.tsx`, `features/vod/VodCategoryScreen.tsx` (retornam `null`; o executor substitui — a tela de categoria vem do `git mv`, apagando o stub), `features/vod/vodShowcase.ts` (`recentlyAdded` → `not implemented`), `features/vod/vodTarget.ts` (tipos, já final), `useRecentlyAdded` em `catalogApi.ts` (`not implemented`; os contratos o mockam).

Fora do contrato (orçamento de 5 usado; o resto não é verificável em jsdom ou é migração): 2×6 inteiras com capa sem recorte e anel de foco inteiro (SC-001), rolagem e continuação das fileiras (FR-012), ≤ 3 setas para chegar a uma grade (SC-003), hero da fileira de Categorias (D-005), `appNav` (D-002, coberto por teste unitário e pelos contratos 023/024 que não mudam), capturas de Live/Configurações/Busca/detalhes idênticas (SC-004) — E2E de capturas + `quickstart.md`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fases 1–5 | Concluídas (2026-10-02/03) |
| Fase 6 (US3 + E2E) | Concluída — 20 roteiros E2E migrados, estados da vitrine cobertos (`VodShowcaseScreen.test.tsx`), E2E 31/31 |
| Fase 7 (Polish) | Concluída — emenda das 4 travas (Fase 5), SC-004 por escopo + E2E, guia Tizen, quickstart revisado |
| Fase 8 (Convergence) | Concluída — decisões pós-spec registradas (D-015..D-018, spec "Emendas"), tokens no CSS, código sem uso removido, E2E 1920×1080 e 2200×1000 |
| Gates | `tsc` limpo · unitários verdes · `npm run lint` sem erros novos · E2E completo verde · 12 travas íntegras |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A vitrine reaproveita `Rail`/`useIdFocus` do Início, mas o Início tem 6 linhas e navegação própria; copiar a lógica de `HomeContent` (≈190 linhas de teclado) duplicaria código | Médio — dois mapas de foco para manter | Resolvido: Reusar as peças pequenas (`Rail`, `useIdFocus`, `SeeAllCard`) e escrever só o mapa de 4 fileiras (`logic/vitrine-e-foco.md` §1); não extrair um "framework de fileiras" agora. |
| R-002 | `useRecentlyAdded` lê o índice de busca inteiro (como "Todos"): em listas enormes custa memória/tempo na TV a cada abertura da vitrine | Médio — abertura lenta | Resolvido: D-009: leitura depois do 1º quadro, esqueleto na fileira, seleção O(n log 12), cache do React Query; medir na TV (recomendação) e, se pesar, limitar ao que o prefetch (038) já preencheu ou adiar a fileira. |
| R-003 | Quatro contratos travados (025, 036, 049, 050) fixam o modelo sidebar+grade e quebram por construção | Alto se contornado — trava sem valor | Resolvido: Decisão do usuário: substituir e regravar (D-013). Cada troca preserva o OBJETIVO do teste antigo (ordem pessoal ★/↺/Todos, remoção do histórico, paginação na grade, hero com/sem capa) nas telas novas. |
| R-004 | Hero na fileira de Categorias: não há capa real de categoria | Baixo — risco de "inventar" imagem | Resolvido: D-005: nome + contagem reais sobre degradê; nenhuma imagem genérica. |
| R-005 | `appNav`/`App.tsx`: "Filmes (N)" e "Séries (N)" do Início passam a abrir a tela de categoria com RETURN voltando ao Início; trocar de destino de topo (`switch-top`) a partir da tela de categoria | Médio — pilha de RETURN errada | Resolvido: D-002: `open` de `*-category` direto do Início; da categoria, a topbar usa `switch-top` como as demais (RETURN no destino novo volta ao Início, não à categoria — D-004 da 024). Teste unitário do redutor e E2E de navegação. |
| R-006 | Altura: com hero + 2 fileiras na vitrine e 2 linhas de capa inteira na categoria, o palco de 1080px é justo (margens originais deixam ~1,8 linha) | Médio | Resolvido: D-006/D-011: medir no E2E; compactar cabeçalho antes de encolher card; margens atuais (38px) cabem. |
| R-007 | ~15 E2E dependem da sidebar de Filmes/Séries (`.side-category-nav-item`) para abrir categorias | Alto — gate vermelho em massa | Resolvido: Helper único `e2e/lib/vod.mjs` (abrir vitrine → fileira Categorias → cartão pelo nome) e migração roteiro a roteiro na Fase 6; rodar `--only` por lote. |
| R-008 | Os E2E têm `http://localhost:5173` fixo; um 2º Vite empurra o seu para 5174 e o gate roda no código errado | Médio | Conferir quem escuta na 5173 antes do gate (`Get-NetTCPConnection -LocalPort 5173 -State Listen`). |
| R-009 | `epg-guia-completo` (E2E) falhou perto da meia-noite e com as margens originais — suspeita de dependência de horário; `LiveScreen.paginacao.test.tsx` já foi visto instável na suíte cheia | Médio — ruído no gate, não da feature | Registrar como instável se aparecer; reexecutar isolado e em outro horário antes de culpar a 052; abrir `sdd-bugfix` separado. |
| R-010 | A árvore tem trabalho sem commit de 048/049/050/051 (Live, margens, `Stage`, detalhe) | Médio — conflitos e commits misturados | Commits só com arquivos desta feature; a feature não toca Live/detalhe/margens. |
| R-011 | `Stage.tsx` agora estica o palco na horizontal em janelas largas; as fileiras (`Rail`) e a grade usam a largura real do contêiner | Baixo | Resolvido: Larguras por fração do contêiner (CSS), nunca por 1920 fixo; E2E em 1920×1080 **e** 2200×1000 (capturas). |

| R-012 | A hero (176px) + a 1ª fileira de itens (370px) ocupam a altura da vitrine: a 2ª fileira aparece cortada embaixo e só entra com o foco (a pilha rola). D-006 ("≥ 2 fileiras inteiras sob a hero") não é atendido | Médio — a vitrine mostra pouco por tela | Aceito para a validação no localhost; opções se incomodar: hero menor, cartões de fileira em formato paisagem (292×164) ou uma fileira por vez com a hero compacta. Decisão do usuário após ver a tela. |
| R-013 | `AppScreen['movies'|'series'].restore` guarda `VodShowcaseFocus | CategoryScreenSnapshot`: o shape antigo fica na união porque o contrato travado 023 (`appNav.shell-navegacao`) o usa como `restore` de `movies` e não pode ser editado | Baixo — tipo mais largo que o necessário | `isShowcaseFocus` filtra no `App`; remover `CategoryScreenSnapshot` da união exige emendar o contrato 023 (feature própria). |
| R-014 | Testes antigos da trilha/hero/sidebar foram **apagados**, não portados (paginação da trilha 049, ordem da side nav 025, hero sobre a grade 050, contagens da trilha, nunca-ler-ao-focar na trilha) | Baixo — coberturas que não existem mais por construção | Objetivos que sobrevivem foram portados (59 testes novos/migrados + 4 contratos amendados); a ordem ★/↺/Todos e o foco por id passaram para o contrato da vitrine. |
| R-015 | Emenda dos contratos 025/036/049/050 (D-013): as travas foram regravadas com os novos arquivos (025: `VodCategoryScreen.filmes-series-ds-v14`; 036: `VodCategoryScreen.limpar-historico`; 049: `VodCategoryScreen.navegacao-por-pagina`; 050: `VodScreens.paridade-v14`) | Registro — decisão do usuário (2026-10-02) | Resolvido: executada na Fase 5; cada plan de origem recebeu um R-00X de emenda. |
| R-016 | Sem a topbar a troca Filmes↔Séries/Busca/Configurações só pelo Início — o usuário pediu a topbar de volta (2026-10-03) | Resolvido: a topbar voltou (D-016), sem o rodapé; ↑ do alto sobe a ela | E2E `vitrine-filmes-series` (↑ até a topbar, → Séries, OK) e `e2e.mjs`. |
| R-017 | Cores literais nos blocos novos de `vod.css` (FR-015) | Resolvido: `--scrim-media`, `--text-shadow-media` (novos em `index.css`) e `--accent-tint-border` | As larguras/alturas fixas de geometria (402/383/260px, 340px) seguem como o padrão dos 205px da 009. |
| R-018 | A grade corta a 2 linhas por `clip-path`; o anel de foco da última linha visível fica por dentro do pôster, então nada é cortado; a tela da TV tem altura útil menor que a do navegador (a 1ª tentativa com 444px cortou o título na TV) | Resolvido: `ROW_HEIGHT` 402px com folga de ~30px, validado na TV física pelo usuário | Ao mudar a moldura (topbar/margens), **medir de novo** e manter ~30px de folga. |


| R-019 | E2E `live-tv-ds-v14` (Live) intermitente na rodada paralela completa: falhou em 2 de 4 rodadas, passou isolado 3/3 e em trio com outros 2 | Médio — ruído no gate, fora da 052 | Aberto: investigar com `sdd-bugfix` (suspeita: o gesto de segurar OK sob carga de CPU); até lá reexecutar isolado e registrar. |
| R-020 | Emenda pela feature 053 (2026-10-03, autorizada em FR-016 da spec 053): o contrato `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` fixava a ordem de 3 fileiras e o percurso de teclas da tela hero; a 053 acrescentou o slot Top 10 e os carrosséis de categoria, então o teste foi trocado por equivalente (mesmos 2 casos; a ordem das fileiras passa a ser lida pelo FOCO ao descer, a pilha é virtualizada; `useCategoryPreviews` mockado) e a trava da 052 foi regravada. | Baixo | Resolvido: trava 052 regravada (5/5), demais arquivos do contrato inalterados. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-02/03 | Fases 1–5 | Dado e peças (recentlyAdded, useRecentlyAdded, SeeAllCard); VodCategoryScreen (evolução do VodCatalogScreen) e VodShowcaseScreen; appNav/App; tela, wrappers e testes antigos apagados e portados; 4 travas amendadas (025/036/049/050) e regravadas com aprovação do usuário; E2E novo `vitrine-filmes-series.mjs` passa, mede 2×6 inteiras (grade 832px) e a vitrine com dados reais. | E2E antigos que usam a sidebar (T028) e capturas finais |
| 2026-10-03 | Fases 6–8 | Lista lateral de categorias, topbar sem rodapé, grade fluida de 6 colunas com 2 linhas inteiras e foco por dentro, cards maiores; pré-carga restaurada; 20 E2E migrados (`e2e/lib/vod.mjs`); tokens no CSS; código sem uso removido; spec/plan emendados (E-1..E-5, D-015..D-018); validado na TV pelo usuário. Pesquisar/Ordenar: experimentados na tela de hero e removidos — ficam nas grades. | — |


**PRÓXIMO**: nenhum — feature implementada; rodar `sdd-converge` para confirmar a convergência.

## Arquivos Principais

- `tv-web/src/features/vod/VodShowcaseScreen.tsx` (hero + fileiras + lista lateral), `VodCategoryScreen.tsx` (grade + Pesquisar/Ordenar), `vodShowcase.ts`, `vodTarget.ts`
- `tv-web/src/features/shell/AppShell.tsx` (`hints` opcional), `tv-web/src/App.tsx` (`vodShell`), `tv-web/src/navigation/appNav.ts`
- `tv-web/src/styles/vod.css`, `tv-web/src/index.css` (`--scrim-media`, `--text-shadow-media`)
- `tv-web/e2e/lib/vod.mjs`, `tv-web/e2e/vitrine-filmes-series.mjs`, `tv-web/e2e/vod-pesquisa-ordenacao.mjs`

## Cuidados para Retomada

- `docs/design/design-system/CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` está **modificado e sem commit** no working tree: re-ler `catalog()` antes de comparar visualmente.
- Margens (`screen-margins.css`) e `Stage.tsx` foram ajustados fora das features; o `font-scale.css` existe com valor 1 (neutro). Não reverter nem "consertar" por conta desta feature.
- O experimento 4×2 de 2026-10-02 (cards recortados) foi **descartado**: capa inteira é requisito (FR-007).
- `innerText` (Playwright) devolve a caixa alta aplicada por CSS; `npm run test:e2e -- --only a,b --jobs 1` não passa pelo PowerShell/npm: use `node e2e/run.mjs --only a,b --jobs 1`.
- Scroll/folga do anel dependem uma da outra (`scroll-padding` × padding/margem negativa × recorte do ancestral): meça o anel contra **todos** os ancestrais que recortam (aprendizado R-009 da 050).
- Terminologia do usuário: **"vitrine" = a grade de cards** (`VodCategoryScreen`) e **"tela de filmes/séries" = hero + fileiras** (`VodShowcaseScreen`) — o oposto dos nomes do código. Confirmar antes de mover UI entre as duas.
- Ao mudar moldura/margens, medir 2 linhas inteiras da grade na TV (folga ~30px, R-018); o E2E mede em 1920×1080 e 2200×1000 (`E2E_W`/`E2E_H`).

## Resultado Final

**Construído (2026-10-02/03, validado no navegador e na TV física pelo usuário):** Filmes e Séries viraram duas telas. A **vitrine** (VodShowcaseScreen, destino da topbar) tem a **lista lateral de categorias** (★ Favoritos, ↺ Histórico, Todos e as da fonte, sem o prefixo "Filmes |"/"Séries |"), o hero do card focado e as fileiras reais Continue assistindo, ★ Favoritos e Adicionados recentemente (≤ 12 itens + "Ver tudo"; cada uma só com dado real). A **tela de categoria** (VodCategoryScreen, evolução do antigo VodCatalogScreen) é a grade em tela cheia com Pesquisar/Ordenar, busca inline, favoritar, remoção do histórico e memória de foco por id. A navegação ganhou movies-category/series-category no ppNav; voltar restaura o foco por id (vitrine: {row, id}; categoria: VodCategoryRestore). "Filmes (N)"/"Séries (N)" do Início abrem a categoria ★ Favoritos.

**Desvios em relação ao plano original** (todos por decisão do usuário e registrados em spec.md → "Emendas pós-execução" e em D-015..D-018):
- "Categorias" é a lista lateral, não uma fileira de cartões (D-015); os cartões de categoria foram removidos.
- A topbar existe em Filmes/Séries, **sem o rodapé de dicas** (AppShell com hints opcional) (D-016).
- A grade tem 6 colunas fluidas e coladas, pôster cover (recorte lateral aceito, ao contrário de D-011), ROW_HEIGHT 402px, 2 linhas inteiras com rolagem por linha e foco por dentro do pôster, sem escala (D-017).
- A pré-carga por foco e a dica de seção da 038 foram **mantidas** (a 052 as havia perdido; o E2E carga-listas detectou) (D-018).
- Pesquisar/Ordenar foram experimentados na tela de hero e **removidos**: ficam nas grades.
- Cores literais dos blocos novos viraram tokens (--scrim-media, --text-shadow-media, --accent-tint-border).

**Contratos:** 5 da 052 verdes e íntegros; as travas de 025, 036, 049 e 050 foram emendadas e regravadas (R-015), e as de 052/049/050 regravadas de novo em 2026-10-03 após as decisões acima. As demais travas vizinhas (018, 019, 022, 023, 024, 026, 046) intactas.

**Gate:** 	sc limpo, 2445 unitários, lint sem erros, uild e uild:tizen ok, E2E 31/31 (1920×1080; a vitrine também em 2200×1000), e2e.mjs verde.

**Em aberto fora da feature:** R-009/R-019 (E2E epg-guia-completo e live-tv-ds-v14 intermitentes sob carga paralela; passam isolados) — abrir sdd-bugfix próprio.