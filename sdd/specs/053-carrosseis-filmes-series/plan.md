# Implementation Plan: Carrosséis de categoria, lista lateral recolhível e slots TMDB na tela hero de Filmes e Séries

**Slug**: `053-carrosseis-filmes-series` | **Date**: 2026-10-03 | **Spec**: `sdd/specs/053-carrosseis-filmes-series/spec.md`

## Summary

A tela hero de Filmes/Séries (`VodShowcaseScreen`, feature 052: lista lateral + hero + 3 fileiras de itens) ganha: (1) **um carrossel por categoria da fonte**, um sob o outro, cada um com "Ver tudo" que abre a grade da 052 (intocada); (2) **lista lateral recolhível** para uma faixa de ícones/iniciais (← na lista alterna, escolha lembrada); (3) **formatos de card por papel** (pôster alto grande, pôster compacto, Top 10 com número, card largo quando houver backdrop real); (4) **4 slots reservados "Em breve"** (Top 10 filmes/séries da semana, Bem avaliados, Porque você assistiu) no formato final, sem dado e sem consulta ao TMDB.

Abordagem: o modelo de fileiras fixas da 052 (4 `useIdFocus`, uma `Rail` por fileira) vira **fileiras dinâmicas** descritas por uma função pura (`buildShowcaseRows`), com **foco por fileira em funções puras** (`vodShowcaseFocus`) e **pilha vertical virtualizada** (centenas de categorias). O conteúdo de cada carrossel de categoria é uma **prévia lida só do aparelho** (`useCategoryPreviews`: bloco da categoria, sem `ensureCategory`/rede) para as fileiras da janela de foco; as ainda não obtidas pedem prioridade à pré-carga 038 (`prioritizeCategory`) e se preenchem quando a categoria chega. Regras do "como": `logic/carrosseis-e-foco.md`.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Vite (build `chrome108` — não remover, CLAUDE.md).

**Primary Dependencies**: as existentes (`@tanstack/react-query` com `useQueries`, `@tanstack/react-virtual` vertical, Dexie). Nenhuma nova.

**Storage**: nenhum dado novo no IndexedDB. Preferência de lista recolhida em `localStorage` (`vodShowcasePrefs.ts`, mesma família de `playerPreferences.ts`/`lastSource.ts`, com try/catch). Leituras novas: bloco de categoria (`getActiveCategoryBlock`/`listChannels` com limite) e, só para `wide`, cache de metadata local (`titleMetadata.backdropUrl`).

**Testing**: Vitest + Testing Library (projetos `dom`/`node`), Playwright E2E (`tv-web/e2e/*.mjs`, dev server na 5173), contratos travados por `check-contract-tests.ps1`.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`), palco 1920×1080 esticável na horizontal (`Stage.tsx`).

**Performance Goals**: abrir a tela hero não pode ficar mais lenta que na 052; só ~5 fileiras de categoria consultam o disco por vez (janela de foco); montagem vertical virtualizada (fileiras fora da janela não existem no DOM); nenhuma consulta de rede nova (a pré-carga 038 já existente é quem busca). Sem `filter: blur`.

**Constraints**: constitution 1.7.0; ADR-007/008/009/011; tokens de `index.css`; focar nunca dispara nada; categorias da fonte nunca substituídas por taxonomia externa; TMDB **não** é chamado nesta feature. A **vitrine/grade** (`VodCategoryScreen`) fica byte a byte como está.

**Scale/Scope**: 2 módulos puros novos, 1 hook novo, 1 tabela de formatos, 1 módulo de preferências, edição de `VodShowcaseScreen` (maior mudança), `SideCategoryNav` (prop opt-in), `ContentCard`/CSS (`vod.css`), `comingSoon.ts` (3–4 entradas), invalidador da pré-carga (1 chave), migração de testes/E2E que fixam a estrutura da 052.

## Referências do Design System

Precedência (ADR-011): constitution > ADRs > **Spec V14** > **Component Lab** > protótipo.

| Elemento | Spec V14 | Component Lab / protótipo | Consequência |
| --- | --- | --- | --- |
| Rails em Filmes/Séries | §17 rails (edge fade, posição, virtualização), §16 cards | Lab `#rails`, protótipo `catalog()` | D-003/D-006: `Rail` existente; formatos novos só mudam medidas |
| Lista lateral recolhida | §13 navegação lateral/categorias; §41 memória de foco | Lab `#categoriesv131` | D-005: faixa com tile/ícone, rótulo no DOM |
| Slots "Em breve" | política de mocks (ADR-011, migração V14 §mock) | `ComingSoon` (feature 022) | D-007: soft-disabled focável, registrado em `comingSoon.ts` |
| Foco | §11.1/§11.2 (linhas sem escala), §33 sem salto diagonal | `#focus` | D-004: foco por fileira e por id |
| Top 10 com número | §16 cards (variação) | imagem 2 do pedido (referência externa) | D-006: número grande como decoração, nunca ranking inventado |
| Estados | §19, §45 | `#feedback` | FR-012: carrossel pendente/vazio sempre com "Ver tudo" focável |

## Decisões Invariantes

- **D-001** Fileiras são **descritores** (`ShowcaseRowSpec`: `key`, `kind` items/slot/category, `title`, `format`, `seeAll`, `slotId`) produzidos por `buildShowcaseRows` (`features/vod/vodShowcaseRows.ts`), na ordem fixa **continue → top10 → favorites → added → rated → because → categorias**. Os 3 slots e as categorias existem sempre; as de itens só com dado. Chave de identidade = `ShowcaseRowKey` (`cat:<groupLabel>`), nunca índice. `VodShowcaseRow` (em `vodTarget.ts`) **alarga** para aceitar essas chaves (`'categories'` continua válido = lista lateral).
- **D-002** A **lista lateral não vira fileira**: segue como `SideCategoryNav` (E-1 da 052). `VodShowcaseFocus = { row, id }` mantém `row: 'categories'` para ela; as demais usam a `ShowcaseRowKey`. A grade (`VodCategoryScreen`), `VodTarget`, `appNav` e `App.tsx` **não mudam de contrato** (só o tipo de `row` alarga).
- **D-003** Pilha vertical **virtualizada** (`useVirtualizer` vertical, altura fixa por formato, sem medição) com `useVirtualFocusSync` na fileira focada; cada fileira usa `Rail` com `itemWidth/itemHeight` de **uma tabela única** (`vodRowFormats.ts`) — o CSS lê as mesmas medidas por variáveis inline. Centenas de categorias não viram centenas de nós.
- **D-004** Foco em funções puras (`vodShowcaseFocus.ts`): memória por fileira (`{id, index}`), ↑↓ no cartão **lembrado** da vizinha (como Home/052; **não** "visualmente mais próximo" por geometria — desvio deliberado do texto de FR-011, registrado em R-005), slots e categorias pendentes participam do percurso, ←→ clamp sem wrap, `null` na borda (← no 1º cartão → lista lateral), `'top'` ↑ da 1ª fileira. Foco inicial = 1ª fileira **elegível** (item real); slot e categoria pendente nunca são a entrada.
- **D-005** Lista recolhível: `SideCategoryNav` ganha `collapsed?: boolean` **opt-in** (Live/Configurações não passam → idênticas); recolhida, rótulo e contagem somem **só por CSS** (texto segue no DOM), tile/ícone ficam. Estado por seção em `vodShowcasePrefs.ts` (try/catch; falha = expandida). **← com o foco na lista alterna** recolher/expandir; o foco permanece na entrada. Painel: classe `is-collapsed` em `.vod-side-panel`.
- **D-006** Formatos (`RowFormat`): `poster-xl` (destaque: Continue assistindo, ou Favoritos sem histórico), `poster` (demais de itens, o de hoje), `poster-compact` (categorias), `top10` (número grande + pôster, só no slot), `wide` (backdrop). `wide` só na fileira `continue` quando **todos** os itens mostrados têm backdrop já no cache de metadata (leitura local, **sem consulta nova**); senão `poster-xl`. `ContentCard` ganha o necessário via `variant`/prop **opt-in**; o Início/Busca/detalhes não mudam.
- **D-007** Slots reservados: entradas novas em `lib/comingSoon.ts` (`vod-top10-movies`, `vod-top10-series`, `vod-rated`, `vod-because`) apontando para itens novos de `## Ideias Futuras` (67, 68, 69; T002 os cria). Renderização: `.vod-slot-card` (único focável, `aria-disabled="true"`, "Em breve") + cartões fantasma decorativos `aria-hidden` no formato final. OK **só anuncia** (`ComingSoon`/`useAnnounce`); nenhum import de TMDB nesta feature.
- **D-008** Prévia por categoria **só do aparelho**: `useCategoryPreviews(sourceId, categories)` (chave `['category-preview', sourceId, id]`) lê o bloco (`getActiveCategoryBlock`; formato antigo: `listChannels` com limite) e devolve até `PREVIEW_LIMIT = 12` itens; **proibidos** `ensureCategory`, `fetch` e escrita. Janela = fileira focada −1…+3. `pending` na janela → `prioritizeCategory` (debounce 300 ms). O invalidador da pré-carga (`createPrefetchInvalidator`) invalida a chave quando a categoria chega. `usePrefetchHint` e `useCategoryFocusPrefetch` (E-5 da 052) **permanecem**.
- **D-009** "Ver tudo" de categoria = cartão final `SEE_ALL_ID` da fileira **e** botão no cabeçalho (mesmo destino `seeAll`, mesmo foco: o cabeçalho **não** é um segundo alvo focável — só o cartão final; o cabeçalho mostra "Ver tudo ›" decorativo). Evita dois destinos de foco por fileira.
- **D-010** Hero igual ao da 052 (item focado → capa/metadados reais; categoria da lista lateral → nome/contagem; "Ver tudo" mantém o último item da fileira; **slot** mantém o último item focado, nunca texto inventado). O hero pode compactar para dar altura às novas fileiras.
- **D-012** (emenda do usuário, 2026-10-03; substitui o recolher manual de D-005) A lista lateral **não tem toggle nem preferência salva** (odShowcasePrefs.ts removido). `← →` com o foco na lista **paginam** (pagedIndex/scrollByPage da 049, página = o que cabe na área); `→` na última entrada entra nos cards. collapsed = !inSide: recolhida só com o foco nas fileiras; `←` no 1º card volta à lista e expande.
- **D-011** Contratos travados da 052 que fixam a estrutura anterior **são substituídos e regravados** (aprovado em FR-016/Assumptions da spec; precedente das travas 025/036/049/050 na 052): `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` (ordem das fileiras, lista de `section.vod-row`, percurso de teclas). A trava da 052 é regravada com o arquivo substituído e anotada como `R-020` no plan da 052. As travas 018, 019, 022, 023, 024, 026, 046, 049 e o contrato da `VodCategoryScreen` **não podem quebrar**.

## Constitution Check

*GATE: passou antes da Fase 0. Reavaliado após o design.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ N/A | ✅ | nada de conta |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | nenhuma chave; TMDB nem é importado; prévia só lê o disco, nenhuma URL em log/DOM além da capa já usada hoje |
| Categorias da Fonte São Preservadas | ✅ | ✅ | um carrossel por categoria declarada, ordem e nome da fonte (exibição tira só o prefixo redundante, como na 052) |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | slots sem dado; "Top 10"/números só layout; nada de ranking/relevância inventados |
| Comandos Locais Independem de Rede | ✅ | ✅ | recolher, navegar, abrir "Ver tudo" são locais; sem rede nova |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | `wide` só lê cache de metadata; nada escrito |
| Toda Ação Essencial Tem Caminho por Controle Remoto | ✅ | ✅ | recolher/expandir por ← na lista (D-005); "Ver tudo" por OK; nada só por toque |
| Lista de Catálogo Nunca é Manifesto de Streaming | ✅ | ✅ | nada novo |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | pendente/vazio/erro/slot/lista recolhida têm ≥ 1 focável (D-004, FR-012) |
| Voltar Restaura Foco e Posição | ✅ | ✅ | `restore {row,id}` por chave de fileira e id; fileira/id que some cai num vizinho (§2 da lógica) |
| Identidade de Reprodução Não Depende da URL | ✅ N/A | ✅ | chaves por nome declarado / id de item |
| Progresso e Capacidades São Reais | ✅ | ✅ | barra de progresso só com progresso real (como hoje); "Em breve" nos slots, não fingidos |
| Documentação do Repositório É Canônica | ✅ | ✅ | backlog (itens 67–69), plan/spec 052 (emenda R-020), `comingSoon.ts` |

Sem violações → `Complexity Tracking` vazio. Único desvio **de spec** (não de constitution): D-004/R-005 (foco vertical por memória da fileira, não por geometria).

## Project Structure

### Documentation (this feature)

```text
sdd/specs/053-carrosseis-filmes-series/
├── spec.md
├── plan.md
├── tasks.md
├── quickstart.md
├── handoff.md
├── contract-tests.lock
└── logic/carrosseis-e-foco.md
```

### Source Code (repository root)

```text
tv-web/src/
├── features/vod/
│   ├── VodShowcaseScreen.tsx          # MUDA (maior): fileiras dinâmicas, virtualização vertical, lista recolhível, slots
│   ├── vodShowcaseRows.ts             # NOVO (stub do plan): buildShowcaseRows + tipos + SEE_ALL_ID/SLOT_ENTRY_ID
│   ├── vodShowcaseFocus.ts            # NOVO (stub do plan): foco puro por fileira
│   ├── vodRowFormats.ts               # NOVO: tabela de medidas por RowFormat (TS = fonte única)
│   ├── vodShowcasePrefs.ts            # NOVO: lista recolhida por seção (localStorage, try/catch)
│   ├── vodTarget.ts                   # ALARGA VodShowcaseRow (chaves novas)
│   └── VodCategoryScreen.tsx          # NÃO MUDA (a vitrine/grade)
├── features/catalog/catalogApi.ts     # useCategoryPreviews (stub do plan → implementar), CategoryPreview
├── features/catalog/prefetchApi.ts    # invalidador: + ['category-preview', sourceId, id]
├── components/SideCategoryNav.tsx     # prop opt-in `collapsed`
├── components/ContentCard.tsx         # + variante/prop do Top 10 e do wide, opt-in
├── lib/comingSoon.ts                  # + vod-top10-movies, vod-top10-series, vod-rated, vod-because
└── styles/vod.css                     # painel recolhido, fileiras por formato, slots, Top 10, wide
tv-web/e2e/                            # lib/vod.mjs + roteiros que fixam a estrutura da 052 (ver tasks)
.planning/backlog.md                   # Ideias Futuras: itens 67, 68, 69 (mão)
```

**Structure Decision**: evolução in-place de `VodShowcaseScreen` (o que a 052 já isola como "tela hero"); toda regra testável sai para módulos puros (`vodShowcaseRows`, `vodShowcaseFocus`) para não crescer o componente (hoje 475 linhas) e para os contratos não dependerem de DOM/virtualização. Nada em `App.tsx`/`appNav.ts` além do tipo alargado.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| — (nenhuma violação da constitution) | — | — |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run src/features/vod src/features/catalog src/components   # área tocada
npx tsc -b
npm run lint
npm run test
npm run build
npm run test:e2e        # com `npm run dev` rodando (5173)
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5 testes): `tv-web/src/features/vod/vodShowcaseRows.carrosseis-filmes-series.contract.test.ts` (1), `tv-web/src/features/vod/vodShowcaseFocus.carrosseis-filmes-series.contract.test.ts` (1), `tv-web/src/features/vod/VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (3).

Comando (de `tv-web/`): `npx vitest run src/features/vod/vodShowcaseRows.carrosseis-filmes-series.contract.test.ts src/features/vod/vodShowcaseFocus.carrosseis-filmes-series.contract.test.ts src/features/vod/VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx`

Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 053-carrosseis-filmes-series`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `buildShowcaseRows` — ordem fixa, formatos, slots/categorias sempre, Top 10 por seção | FR-001, FR-002, FR-006..FR-010 | Fase 2 | `Error: not implemented` (confirmado) |
| foco — memória por fileira, slots, `'top'`, reconciliação e restauração por id | FR-011..FR-013, Constitution: Foco/Voltar | Fase 2 | `Error: not implemented` (confirmado) |
| tela — um carrossel por categoria, "Ver tudo", pendente sem cards, voltar restaura | US1, FR-001..FR-003, FR-007, FR-013 | Fase 3 | asserção da sequência de fileiras (confirmado) |
| tela — slots "Em breve": focáveis, sem navegar, sem rede, sem prender o foco; Top 10 por seção | US4, FR-008, FR-009, FR-011 | Fase 3 | asserção `Top 10 filmes da semana` (confirmado) |
| tela — ← recolhe/expande, entradas focáveis, escolha lembrada | US2, FR-004, FR-005, FR-013 | Fase 4 | asserção `is-collapsed` (confirmado) |

Stubs criados pelo plan (ponto de partida, não travados): `features/vod/vodShowcaseRows.ts`, `features/vod/vodShowcaseFocus.ts`, `useCategoryPreviews`/`CategoryPreview` em `features/catalog/catalogApi.ts`.

Suíte da área rodada com os stubs (`vod`, `catalog`, `components`): 497 passam, só os 5 contratos novos falham; `tsc -b` limpo.

Fora dos contratos (o executor escreve em testes próprios): `useCategoryPreviews` (sem rede; `pending`/`ready`), `vodShowcasePrefs` (storage indisponível), `SideCategoryNav` recolhido, medidas dos formatos, `wide` condicional, invalidação da prévia, E2E.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fases 1–5 | Concluídas (2026-10-03) — módulos puros, tela hero com fileiras dinâmicas/pilha virtualizada/prévias/slots, lista recolhível, formatos de card |
| Fase 6 (Polish) | Concluída — E2E novo + migração de helpers, guia/Spec conferidos, SC-006 por escopo + E2E |
| Contratos | 5/5 verdes; 35 travas do repositório íntegras (052 regravada, R-020 na 052) |
| Gates | `tsc` limpo · lint sem erros · build ok · E2E 32/32 (2 rodadas) · unitários 2326 verdes, 5 vermelhos de contratos da feature 054 (alheios) |
| Aberto | Passada na TV física (recomendação, não feita); flakes do E2E paralelo em Live (R-018) |
## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Centenas de categorias × uma prévia por fileira pode pesar na TV | Médio | Resolvido (confirmado no converge): Janela de ~5 fileiras, `useQueries` só nelas, leitura de um bloco por categoria; virtualização vertical (D-003); medir na TV física (recomendada) |
| R-002 | Ler o bloco inteiro só para mostrar 12 itens | Baixo | Resolvido (confirmado no converge): Bloco já é uma leitura por chave (039); `slice(0, 12)` antes de mapear para `CatalogItemOut` |
| R-003 | Pré-carga 038 pode demorar a preencher categorias distantes | Baixo | Resolvido (confirmado no converge): Carrossel `pending` mostra "Ver tudo" focável + esqueleto; `prioritizeCategory` ao entrar na janela; nada inventado |
| R-004 | `wide` quase nunca ativa (backdrop só existe depois de abrir um detalhe) | Baixo | Regra de fileira inteira (D-006); aceito: o desenho fica pronto e correto sem consulta nova (fora de escopo: backdrop em lote) |
| R-005 | FR-011 pede ↑↓ ao "card visualmente mais próximo"; o plano adota memória por fileira (como Home/052) | Baixo | Resolvido (confirmado no converge): Mantém o precedente já aceito na 052; geometria exigiria medir cada Rail rolado. Reabrir só se o usuário pedir |
| R-006 | Altura: hero + `poster-xl` (440) + título pode deixar < 1 fileira visível em 1080 | Médio | Resolvido (confirmado no converge): Medir no E2E (1920×1080 e 2200×1000); comprimir o hero antes de encolher card; registrar as medidas reais (T033) |
| R-007 | Substituir o contrato 052 da tela hero é edição de teste travado | Médio | Resolvido (confirmado no converge): Aprovado na spec (FR-016); trocar o arquivo inteiro por equivalente, regravar a trava da 052 e anotar `R-020` no plan da 052 (D-011) |
| R-008 | ~15 E2E e `e2e/lib/vod.mjs` assumem as 3 fileiras e a lista lateral fixas | Médio | Resolvido (confirmado no converge): Migrar em lote (T035); rodar `--only` por lote; porta 5173 conferida |
| R-009 | Duas categorias com o mesmo nome declarado gerariam chave duplicada | Baixo | Resolvido (confirmado no converge): `buildShowcaseRows` mantém só a primeira (lógica §1) |
| R-010 | `useQueries` com o conjunto de observadores deslizando a cada tecla estourou "Maximum update depth exceeded" numa descida longa (E2E, 302 categorias) | Alto | Resolvido: `useCategoryPreviews` virou um `useQuery` por janela (`['category-preview', src, 'window', ids]`, `keepPreviousData`) com cache por categoria via `fetchQuery`; o invalidador e `prefetchCategoryContent` invalidam as duas camadas |
| R-011 | Fileira que passava a existir depois (dados chegando) roubava o foco de quem estava na lista lateral | Médio | Resolvido: qualquer tecla na lista fixa o foco nela (`setSideFocused(true)`); teste em `VodShowcaseScreen.carrosseis.test.tsx` |
| R-012 | A pilha virtualizada encolhia à altura visível (filho de coluna flex) e a hero que aparecia/sumia mudava a altura do contêiner sob o foco: o card focado saía da vista | Alto | Resolvido: `.vod-showcase-rows-inner { flex: none }`, hero vazia mantém o lugar, rolagem até a fileira calculada com o `clientHeight` real (`scrollRowIntoView`); E2E mede o card dentro da área |
| R-013 | Filmes e Séries eram a mesma instância de `VodShowcaseScreen` (sem `key`): foco, janela de prévias e lista recolhida vazavam de uma seção para a outra | Médio | Resolvido: `key` por seção em `App.tsx` |
| R-014 | (ver R-018) `navegacao-por-pagina` falhou 1× na rodada paralela completa e passou isolado e depois 5× | Baixo | Aberto: sem causa identificada; reexecutar isolado antes de culpar a 053 |
| R-015 | Contratos da feature 054 (idioma do app) estão vermelhos na suíte completa | Baixo | Alheio à 053 (outra sessão planejou os contratos); não tocados |
| R-016 | Emenda do contrato 053 (recolher manual → paginar ←/→ e recolher só nos cards), pedida pelo usuário depois de ver a tela: o teste 3 do `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` foi reescrito e a trava 053 regravada (5/5) | Baixo | Resolvido: spec "Emendas pós-execução" E-1, D-012; testes extra de paginação em `VodShowcaseScreen.carrosseis.test.tsx`; E2E `carrosseis-filmes-series` reescrito |
| R-017 | O foco inicial derivado da lista lateral era roubado por uma fileira que chegava depois (ex.: "Adicionados recentemente", leitura lenta): em E2E paralelos o foco saía da lista e os roteiros se perdiam | Médio | Resolvido: depois de `INITIAL_FOCUS_SETTLE_MS` (1,2 s) quem está na lista fica nela; antes disso histórico/favoritos ainda decidem o foco (o contrato 050 exige a hero do item de "Adicionados" sozinho, por isso não se tirou "added" da regra); helpers E2E `ensureSideFocus`/`enterRows`/espera por foco |
| R-018 | `navegacao-por-pagina` e `live-paridade-v14` (Live, não alterada) falharam 1× cada em rodadas paralelas completas e passam isolados e em rodadas seguintes | Baixo | Aberto: flake do E2E paralelo (já conhecido da 052); última rodada completa 32/32 |
## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-03 | Emenda | Lista lateral: ←/→ paginam, recolhe só nos cards (D-012/R-016); janela de estabilização do foco inicial (R-017); contrato 3 reescrito e trava 053 regravada; E2E 32/32 | Passada na TV física |
| 2026-10-03 | Fases 5–6 | Formatos (Top 10, wide, xl/compacto), E2E novo, correções R-010..R-013 achadas pelo E2E, docs; E2E 32/32, contratos 5/5 | Passada na TV física (recomendada) |
| 2026-10-03 | Fase 4 | Lista lateral recolhível (collapsed, ← alterna, prefs, CSS); 5/5 contratos verdes | Fase 5 (formatos) |
| 2026-10-03 | Fase 3 | VodShowcaseScreen reescrita (fileiras dinâmicas, foco puro, pilha virtualizada, prévias em janela, slots); contrato 052 substituído e trava regravada; 4/5 contratos verdes | Fase 4 (recolher) |
| 2026-10-03 | Fases 1–2 | Módulos puros (uildShowcaseRows, foco), useCategoryPreviews, prefs, invalidador, comingSoon, backlog 67–69; 2/5 contratos verdes | Reescrever VodShowcaseScreen (Fase 3) |

**PRÓXIMO**: nenhum — feature implementada; rodar `sdd-converge` para confirmar a convergência.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/vod/VodShowcaseScreen.tsx` (tela hero), `vodShowcaseRows.ts`, `vodShowcaseFocus.ts`, `vodRowFormats.ts`, `vodShowcase.ts` (`allHaveBackdrop`)
- `tv-web/src/features/catalog/catalogApi.ts` (`useCategoryPreviews`, `useCachedBackdrops`), `prefetchApi.ts` (invalidação), `components/SideCategoryNav.tsx`, `components/ContentCard.tsx`, `lib/comingSoon.ts`, `styles/vod.css`, `App.tsx` (`key` por seção)
- `tv-web/e2e/carrosseis-filmes-series.mjs`, `e2e/lib/vod.mjs`, `e2e/run.mjs`; backlog itens 67–69

## Cuidados para Retomada

- VodShowcaseScreen.tsx mantém, até a T014, um alias local transitório VodShowcaseRow de 4 fileiras (o tipo público em odTarget.ts já está alargado): remover o alias ao reescrever.
- A árvore tem trabalho **sem commit** de outras features (git status inicial): não reverter nem "consertar".
- `vodShowcaseRows.ts`/`vodShowcaseFocus.ts` e o stub de `useCategoryPreviews` lançam `not implemented` até as tasks T004/T005/T007.
- `npm run build:tizen` regenera `CCPlayTv/` (versionado): reverter com `git checkout -- CCPlayTv` se não for parte da entrega.
- A pilha vertical usa rolagem calculada (`scrollRowIntoView`), não `virtualizer.scrollToIndex`: o virtualizador guardou uma altura de viewport velha. Mantenha a hero sempre presente (mesmo vazia) para a altura do contêiner não mudar sob o foco.
- Na lista lateral `←`/`→` PAGINAM (não recolhem nem entram nos cards até o fim da lista): em E2E use `ensureSideFocus` para ir à lista e `enterRows` para ir aos cards.

## Resultado Final

**Construído (2026-10-03):** a tela hero de Filmes e Séries (`VodShowcaseScreen`) com fileiras descritas por `buildShowcaseRows` (Continue assistindo → Top 10* → ★ Favoritos → Adicionados recentemente → Bem avaliados* → Porque você assistiu* → uma fileira por categoria da fonte; *slots "Em breve" sem dado e sem TMDB), foco em funções puras (`vodShowcaseFocus`), pilha vertical virtualizada, prévia das categorias lida só do disco numa janela ao redor do foco (`useCategoryPreviews`, com prioridade à pré-carga 038 para as pendentes), formatos de card por papel (`vodRowFormats`: poster-xl, poster, compacto, top10 nos fantasmas do slot, wide só com backdrop real em cache) e lista lateral paginada por ←/→ que recolhe só com o foco nos cards. A grade (`VodCategoryScreen`) não foi alterada. Cobertura: 5/5 contratos (2 puros + 3 de tela), testes adicionais de tela/cards/prévias, E2E `carrosseis-filmes-series` (302 categorias) e 32/32 na suíte.

**Desvios em relação ao plano original:**
- Lista lateral: o recolher manual (← alterna, preferência salva em `vodShowcasePrefs`) foi **substituído** a pedido do usuário por paginação com ←/→ e recolhimento automático nos cards (D-012, R-016; spec E-1); contrato 3 reescrito e trava 053 regravada.
- Contrato 052 da tela hero substituído e trava 052 regravada (R-020 no plan da 052).
- `useCategoryPreviews` virou um `useQuery` por janela com cache por categoria (R-010), no lugar de `useQueries`.
- Rolagem vertical calculada por `scrollRowIntoView` (não `virtualizer.scrollToIndex`), hero que mantém o lugar quando vazia e contêiner `flex: none` (R-012); `key` por seção em `App.tsx` (R-013); janela de 1,2 s para o foco inicial (R-017); invalidação da prévia também ao fim da pré-busca por foco.
- FR-011 cumprido por memória de foco por fileira, não por geometria (R-005, precedente da 052/Home).

**Observações da convergência (sem tarefa):** (1) `vod.css` tem `width: 96px` literal da faixa recolhida, como o painel de 340 px da 052 (não há token de largura equivalente); (2) os textos de D-005, da tabela do Constitution Check e o `handoff.md` ainda descrevem o recolher manual — vale D-012/spec E-1; (3) SC-002 (≤ 2 teclas) e SC-005 (desempenho com centenas de categorias) foram verificados só no navegador/E2E, não na TV física; (4) `wide` quase nunca ativa (R-004); (5) R-014/R-018 (flakes do E2E paralelo em Live) e R-015 (contratos da 054, outra feature) seguem abertos.