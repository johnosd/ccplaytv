# Implementation Plan: Busca por categoria com ícone de entrada e categoria virtual "Todos"

**Slug**: `018-busca-por-categoria` | **Date**: 2026-09-25 | **Spec**: `sdd/specs/018-busca-por-categoria/spec.md`

## Summary

Redesenha a busca local (feature 017) de "uma entrada 🔍 fixa no topo da
trilha, pesquisando o tipo inteiro" para "um ícone de busca dentro de cada
entrada da trilha (categoria real, ★ Favoritos, e a nova categoria virtual
Todos), pesquisando só o que está exibido ali". Escopo restrito por padrão
(categoria/Favoritos filtram só os próprios itens, já carregados, client-
side); "Todos" — nova entrada fixa logo após "★ Favoritos" — agrega tudo
que já foi lido no aparelho e é o único lugar que mostra o aviso de
cobertura parcial. Três telas tocadas (`LiveScreen.tsx`, `MoviesScreen.tsx`,
`SeriesScreen.tsx`), mesmo padrão espelhado entre elas (D-007 da 017,
continua valendo). Reaproveita quase toda a infraestrutura da 017
(normalização, ordenação, cobertura, guarda de alvo editável do
`useRemoteNav`, mecanismo de snapshot ao voltar do detalhe) — só a FSM de
"onde a busca vive" e "o que ela filtra" muda.

## Technical Context

**Language/Version**: TypeScript 5 / React 19, mesmo stack de `tv-web/` (sem mudança)

**Primary Dependencies**: `@tanstack/react-query` (índice agregado), `@tanstack/react-virtual` (lista/grade, sem mudança), Dexie (leitura local, sem mudança)

**Storage**: IndexedDB via Dexie — só leitura, nenhum schema novo (mesma tabela `channels`/`categories` já usada pela 017)

**Testing**: Vitest + Testing Library (componente), Playwright (E2E)

**Target Platform**: mesmo alvo do projeto (Tizen 8.0 / Chromium 108, `tv-web/`)

**Performance Goals**: filtro client-side sobre array já em memória (sem nova leitura de rede/banco por tecla); "Todos" apoia-se na virtualização já existente (feature 009) para volumes grandes — sem meta numérica nova

**Constraints**: nunca enviar o termo a serviço externo (FR-019); busca nunca cruza categorias fora de "Todos" (FR-006); ícone só aparece com itens carregados (D-006)

**Scale/Scope**: três telas (`LiveScreen`, `MoviesScreen`, `SeriesScreen`), 1 tipo novo de entrada de trilha ("Todos"), nenhuma entidade de dado nova

## Decisões Invariantes

- **D-001**: "Todos" é uma entrada de trilha fixa, sempre presente, logo após "★ Favoritos", em cada seção (Live TV, Filmes, Séries) — inclusive dentro do zapping do Live TV (D-009) — independentemente de haver categorias reais. `VIRTUAL_TRAIL_COUNT` passa a ser a constante `2` em toda situação (não depende mais de `zapOpen`, já que "🔍 Buscar" deixou de ser uma entrada).
- **D-002**: A busca deixa de ser uma "entrada" própria (`entered.kind === 'search'`) e vira um sub-estado (`searchActive: boolean`) de qualquer entrada já entrada (categoria real, Favoritos, Todos) — reseta para `false` (e `searchTerm` para `''`) sempre que `entered` mudar (FR-008).
- **D-003**: Um booleano `topFocused` generaliza o antigo `searchFieldFocused` da 017: indica que o foco visual, dentro da coluna de conteúdo, está no elemento do topo (ícone de busca quando `!searchActive`, campo de texto quando `searchActive`) em vez de num item/resultado — mesma mecânica vertical de antes (↑ na primeira linha/1ª linha da grade → topo; ↓ do topo → primeiro item), agora presente em toda entrada com itens, não só em modo busca. Ver `logic/busca-por-categoria.md` §3 para a tabela completa.
- **D-004**: Buscar dentro de uma categoria real ou "★ Favoritos" é um filtro client-side puro sobre o array de itens JÁ carregado (`content.data.items`/`favoritesContent.data.items`) — nenhuma nova leitura de dados, **sem debounce** (diferente da 017: aqui é um `.filter()`/`.sort()` síncrono sobre dados já em memória, roda a cada tecla; `useDebouncedValue` não é mais usado pela busca). Novo helper genérico `searchWithinItems<T>(items, term, nameOf)` em `catalogSearch.ts` reaproveita `normalizeForSearch` e a regra de ordenação (prefixo primeiro, resto depois, alfabético — FR-012) sobre qualquer tipo com nome extraível, em vez de só `CatalogRecord`.
- **D-005**: Dentro de "Todos", a leitura agregada (todos os itens do tipo + cobertura) reaproveita o MESMO mecanismo de índice da feature 017 (`loadSearchIndex`/`catalogRepository.listAllOfKind`), mas passa a ser lida sempre que "Todos" está entrada — não só quando a busca está ativa — via um novo hook `useAggregatedItems`. O filtro por termo, quando a busca está ativa, é aplicado depois, client-side, com o mesmo helper de D-004.
- **D-006**: O ícone de busca só aparece (e só é focável) quando a entrada atual (categoria real, Favoritos ou Todos) tem ao menos 1 item já carregado — categoria vazia/carregando/com erro nunca mostra o ícone (constitution, "Foco Visível e Sem Becos Sem Saída" continua satisfeita pelo botão próprio desses estados, inalterado).
- **D-007**: `CategoryScreenSnapshot` (feature 017, `tv-web/src/features/catalog/categoryScreenSnapshot.ts`) ganha `{ kind: 'all' }` em `SnapshotTrailKey`/`SnapshotEntered` e um novo campo `searchActive: boolean`; `{ kind: 'search' }` foi mantido temporariamente durante a Fase 2/3 (para não quebrar o build enquanto só Live TV estava migrada) e REMOVIDO ao final da Fase 4, assim que `MoviesScreen.tsx`/`SeriesScreen.tsx` também migraram — como as duas migraram na mesma leva de trabalho (não em fases separadas), não houve necessidade de esperar até o Polish. O mecanismo de gravação/restauração em `App.tsx` não muda.
- **D-008**: A guarda de alvo editável do `useRemoteNav` (ADR-009, emenda da feature 017) é reaproveitada sem nenhuma mudança de código — o campo de busca continua sendo um `<input>` real, só mudou de lugar na árvore de estados da tela (de "entrada de trilha" para "sub-estado de uma entrada já aberta").
- **D-009**: "Todos" aparece na trilha do zapping do Live TV (feature 016) como categoria navegável comum — trocar de canal por ela funciona igual a qualquer categoria. O ÍCONE de busca nunca aparece dentro do zapping (FR-018) — mesma decisão que a feature 017 já tinha sobre a busca em si (antiga D-009 daquela feature), agora expressa em termos do ícone em vez de uma entrada de trilha.
- **D-010**: `searchIndex(index, term)` (feature 017) é MANTIDA com a mesma assinatura pública — reescrita por baixo como um wrapper fino sobre `searchWithinItems` (D-004), para não duplicar a regra de ordenação; `loadSearchIndex`/`buildSearchIndex`/`SearchIndex`/`normalizeForSearch` não mudam. Só `useCatalogSearch` (o hook React específico da 017, com `term`/debounce embutidos) vira código morto de verdade — removido na fase de Polish, depois que as três telas já migraram para `useAggregatedItems`. Evita quebrar `tsc -b` durante a implementação incremental (uma tela por vez) e evita reescrever o teste de contrato antigo da 017 que já cobre `searchIndex`/`loadSearchIndex` sem tocar neles.
- **D-011**: Só os arquivos de contrato/teste da feature 017 que testam a UI/trilha antiga (a entrada "🔍 Buscar" e o modo `entered.kind === 'search'`) são removidos/reescritos por esta feature: `LiveScreen.busca.contract.test.tsx` e `MoviesScreen.busca.contract.test.tsx`. `useRemoteNav.busca.contract.test.tsx` (testa a guarda de alvo editável, D-008, que não muda) e `catalogSearch.contract.test.ts` (testa `buildSearchIndex`/`searchIndex`/`loadSearchIndex`, que continuam com a mesma API pública, D-010) **não são tocados** — continuam passando como estão. A trava da 017 (`sdd/specs/017-busca-local-catalogo/contract-tests.lock`) fica desatualizada só quanto aos 2 arquivos removidos — esperado e já documentado no `R-006` daquela feature (decisão explícita do usuário de fechá-la como está e tratar o redesenho como feature nova), não um erro a corrigir.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | não tocado |
| Segredos Fora dos Clientes e dos Logs | PASS | PASS | busca é local (FR-019); nenhuma credencial exibida/logada |
| Categorias da Fonte São Preservadas | PASS | PASS | "Todos" agrega para exibição, nunca grava nem substitui a estrutura declarada pela fonte |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | não tocado |
| Comandos Locais Independem de Rede/Backend/IA | PASS | PASS | filtro client-side sobre dados já em memória (D-004/D-005), zero chamada de rede por tecla |
| Trailers e Metadados Não Alteram Estado | N/A | N/A | não tocado |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | PASS | PASS | ícone navegável por seta+SELECT (D-003), campo usa teclado do sistema, RETURN sai em camadas (FR-017) |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | não tocado |
| Foco Visível e Sem Becos Sem Saída | PASS | PASS | D-006 garante ícone só com itens; estado vazio de busca mantém o campo com foco DOM real, sem botão redundante (mesma decisão R-005 da 017, replicada) |
| Voltar Restaura Foco e Posição | PASS | PASS | `CategoryScreenSnapshot` reaproveitado (D-007), mecanismo intacto |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | não tocado (busca não mexe em resume/favoritos) |
| Progresso e Capacidades São Reais | PASS | PASS | aviso de cobertura parcial exclusivo de "Todos" (FR-010/FR-011), nunca inventado |
| Documentação do Repositório É Canônica | PASS | PASS | Polish emenda a spec/plan da 017 e o CLAUDE.md para não descrever o design antigo como vigente (ver Riscos e Decisões) |

Nenhuma violação não-justificada. `## Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/018-busca-por-categoria/
├── spec.md
├── plan.md               # este arquivo
├── logic/
│   └── busca-por-categoria.md
├── quickstart.md
├── tasks.md
└── contract-tests.lock   # criado no passo 7.5
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── lib/
│   │   ├── catalog/
│   │   │   ├── catalogSearch.ts          # + searchWithinItems (D-004)
│   │   │   ├── catalogSearch.test.ts     # existente (017/T028) — sem mudança de comportamento coberto
│   │   │   └── catalogRepository.ts      # sem mudança (listAllOfKind já existe)
│   │   └── useRemoteNav.ts               # sem mudança (guarda de alvo editável já cobre o novo uso, D-008)
│   ├── features/
│   │   ├── catalog/
│   │   │   ├── catalogApi.ts             # + useAggregatedItems (D-005); useCatalogSearch fica até o Polish (D-010)
│   │   │   └── categoryScreenSnapshot.ts # + {kind:'all'}, + searchActive (D-007)
│   │   ├── live/
│   │   │   └── LiveScreen.tsx            # reescreve trilha/busca (D-001–D-006, D-009)
│   │   ├── movies/
│   │   │   └── MoviesScreen.tsx          # espelha LiveScreen.tsx
│   │   ├── series/
│   │   │   └── SeriesScreen.tsx          # espelha LiveScreen.tsx
│   │   └── screens.css                   # + estilos do ícone/linha de título; remove .live-item-search (Polish)
├── e2e/
│   └── busca-por-categoria.mjs           # novo roteiro E2E
```

**Structure Decision**: mesma estrutura já usada pela feature 017 — sem
diretório novo. Três telas de categoria (`features/{live,movies,series}`)
compartilham o padrão de trilha/busca via espelhamento manual (não um
componente compartilhado — decisão já tomada e mantida desde a 013/017),
dados/infra em `lib/catalog/` e `features/catalog/`.

## Complexity Tracking

*(vazio — nenhuma violação a justificar)*

## Estratégia de Testes

Prioridade: unitário → contrato/componente → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```powershell
npx tsc -b
npx vitest run
npm run lint
npm run build
```

### Testes de Contrato

Orçamento de 5 casos usados integralmente, concentrados em `LiveScreen`
(lista 1D — mais barato de montar em teste que a grade virtualizada de
Filmes/Séries) e 1 em `catalogSearch.ts` (unidade pura, sem DOM). Filmes e
Séries reusam o MESMO padrão (D-007 herdado da 017: espelhamento manual) e
recebem testes adicionais NÃO travados na Fase de execução correspondente,
em vez de um contrato próprio — mesma escolha que a 017 já fez para Séries.

Arquivos travados em `contract-tests.lock`:
`tv-web/src/features/live/LiveScreen.busca-categoria.contract.test.tsx`,
`tv-web/src/lib/catalog/catalogSearch.busca-categoria.contract.test.ts`

Comando (rodar de dentro de `tv-web/`): `npx vitest run src/features/live/LiveScreen.busca-categoria.contract.test.tsx src/lib/catalog/catalogSearch.busca-categoria.contract.test.ts`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| "buscar dentro de uma categoria real acha só itens dela, nunca de outra categoria" | US1 AC1-3, FR-006 | Fase 3 (Live TV) | `not implemented` (ícone/campo não existem ainda) ou asserção de contagem de resultados |
| "'Todos' lista itens de mais de uma categoria sem buscar, mostra cobertura parcial, e busca dentro dela acha item de categoria específica coberta" | US2 AC1-4, FR-003/007/010 | Fase 3 (Live TV) | asserção: entrada "Todos" ausente da trilha renderizada |
| "RETURN em camadas (resultado → campo → ícone → trilha) e trocar de categoria reseta a busca" | FR-008/FR-017, caso traiçoeiro de estado | Fase 3 (Live TV) | asserção: campo/ícone não fecham como esperado |
| "ícone de busca só aparece com itens carregados; categoria vazia/carregando continua com saída focável" | D-006, Constitution: Foco Visível e Sem Becos Sem Saída | Fase 3 (Live TV) | asserção: ícone ausente/presente no estado errado |
| "searchWithinItems filtra e ordena (prefixo primeiro) sobre um tipo genérico, não só CatalogRecord" | FR-005/007/012 | Fase 2 (Foundational) | `not implemented` (`searchWithinItems` ainda não existe) |

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/catalog/catalogSearch.ts` (assinatura de `searchWithinItems`
com corpo `throw new Error('not implemented')`),
`tv-web/src/features/catalog/catalogApi.ts` (assinatura de
`useAggregatedItems` idem),
`tv-web/src/features/catalog/categoryScreenSnapshot.ts` (tipos já
atualizados com `all`/`searchActive`, sem stub de função — é só tipo).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup | Fase 1 concluída — baseline confirmado (8 erros de tipo esperados em Movies/Series, 5 contratos vermelhos pelo motivo certo, trava íntegra) |
| Foundational | Fase 2 concluída — `searchWithinItems` (catalogSearch.ts), `useAggregatedItems` (catalogApi.ts), `searchIndex` reescrita como wrapper sem mudar API pública, CSS do ícone/`.live-item-all` |
| US1+US2+US3 — Live TV | Fase 3 concluída — trilha `[Favoritos, Todos, ...categorias]` fixa (inclusive no zapping); ícone de busca dentro de qualquer entrada com itens; busca escopada por padrão, agregada em "Todos"; RETURN em camadas; zapping sem ícone (FR-018) |
| US1+US2+US3 — Filmes/Séries | Fase 4 concluída — `MoviesScreen.tsx`/`SeriesScreen.tsx` espelham Live TV integralmente; snapshot ganhou `searchActive`; `{kind:'search'}` removido de `categoryScreenSnapshot.ts` (D-007 atualizado); `tsc -b` limpo (0 erros) pela primeira vez desde a Fase 2 |
| Polish | Fase 5 concluída — dead code removido (`useCatalogSearch`, `useDebouncedValue`), contratos obsoletos da 017 removidos, `e2e/busca-por-categoria.mjs` novo, nota de superseding na 017, `CLAUDE.md` atualizado, todos os gates rodados. Dois bugs reais achados e corrigidos na verificação manual do quickstart (R-005/R-006): um de teste (`m3u-sob-demanda.mjs`) e um de produção (ícone de busca não respeitava `contentUnavailable`, revelando um bug mais profundo em `categoryLoader.ts`'s `readStored` — categoria `stored` já lida podia cair em `source_missing` de novo ao reentrar na mesma sessão, mascarando itens já corretos em `channels`) |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Remover `useCatalogSearch`/`{kind:'search'}` antes de TODAS as três telas migrarem quebra o build (elas compartilham `CategoryScreenSnapshot`, que ganha um campo obrigatório novo) | Alto se ignorado — `tsc -b` vermelho no meio da implementação | Resolvido: Fase 4 cobriu Filmes E Séries juntas; `{kind:'search'}` removido ao final dela (D-007 atualizado), `tsc -b` limpo (0 erros). Só `useCatalogSearch` (hook) e os 2 arquivos de contrato obsoletos da 017 seguem para o Polish (D-010/D-011) |
| R-002 | "Todos" pode listar um volume grande de itens (soma de várias categorias) sem filtro nenhum ao entrar — performance de primeira renderização | Médio — mitigado pela virtualização já validada (feature 009, até 5000 itens em teste) | Resolvido: sem meta numérica nova; se a TV física mostrar problema real, vira um achado a assessar separadamente, fora do escopo desta feature |
| R-003 | A trava de contrato da feature 017 (`contract-tests.lock` daquela feature) fica desatualizada em relação ao código depois desta feature substituir os arquivos de teste que ela travava | Baixo — já documentado e aceito no `R-006` da 017 | Resolvido: D-011, nenhuma ação corretiva necessária; nota inline na 017 (`plan.md`, `R-006` daquela feature) confirma a substituição (verificado pelo sdd-converge, presente de fato no arquivo) |
| R-004 | Aviso de cobertura sempre visível dentro de "Todos" (mesmo sem buscar) é uma Assumption da spec, não uma resposta confirmada por pergunta direta ao usuário | Baixo — decisão de UX reversível | Se o usuário discordar ao revisar a tela pronta, é um ajuste pontual de FR-010, sem replanejar o resto |
| R-005 | Achado durante T029 (gate final de testes/lint/build/E2E): `tv-web/e2e/m3u-sob-demanda.mjs` (script da feature 014, não tocado por esta feature) falhava de forma reproduzível no Cenário B — o card da segunda fonte na Home não mostrava a tempo o selo "Modo limitado", com timeout em cascata na verificação seguinte. Bug pré-existente, fora do escopo formal da 018, achado por acaso | Baixo — o app está correto; só o teste tinha uma race | Resolvido: corrigido a pedido do usuário via subagente dedicado: causa raiz era do PRÓPRIO SCRIPT de teste, não do app — `await page.waitForSelector('.source-card', ...)` resolve na hora porque já existe card de uma fonte anterior, sem dar tempo do refetch do react-query (`useSources`, staleTime 0 mas assíncrono) trazer o selo da fonte recém-importada; `assert()` do script é síncrono, sem retry. Corrigido em `tv-web/e2e/m3u-sob-demanda.mjs` (Cenário B): a espera agora é pelo próprio `.source-card-badge` com "Modo limitado" (`locator(...).waitFor(...)`, com polling do Playwright) em vez de um `.source-card` genérico. Confirmado estável em múltiplas rodadas (3/4 — a 1 falha isolada foi flakiness pontual não relacionada, num seletor de Filmes diferente, não reproduzida de novo); `npx tsc -b` 0 erros; `npx vitest run` sem regressão nova (711/712, mesma flakiness pré-existente de `LiveScreen.favorites.test.tsx`); `busca-por-categoria.mjs` e `capa-real.mjs` continuam 100%. **Nota adicional (verificação independente, mesma sessão):** rodando mais 4 vezes depois da correção, a asserção original do Cenário B nunca mais falhou (bug real, confirmado corrigido), mas o script mostrou timeout esporádico em outros dois pontos (`.poster-grid, .live-state`, `.tiles-row`) em 2 das 4 rodadas — plausivelmente flakiness de timing desta máquina sob carga (várias sessões concorrentes no PC durante o teste), consistente com o R-007 já registrado em `sdd/specs/017-busca-local-catalogo/plan.md` sobre `test:e2e` não ser limpo nesta máquina Windows. Não é uma regressão desta feature nem do fix acima — registrado como conhecido, sem investigação adicional |
| R-006 | Achado durante T029, verificação manual do quickstart no navegador: o ícone de busca aparecia mesmo com uma categoria em erro (`source_missing`/`failed`), porque a condição usava só `baseItems.length > 0`/`baseMovies.length > 0`/`baseSeries.length > 0` (D-006), sem checar `contentUnavailable` como o resto da tela já faz — `loadCategoryContent` sempre lê `channels`, que retinha itens de uma leitura anterior mesmo com outcome de erro. Ao corrigir isso (ver abaixo), o `e2e/busca-por-categoria.mjs` passou a falhar de forma nova e reproduzível no cenário "RETURN em camadas": voltar do detalhe de um filme pra uma categoria `stored` (feature 014) já lida mostrava "conteúdo não está mais no aparelho" mesmo com os itens certos já gravados. Investigação revelou um bug bem mais profundo e pré-existente (feature 014, não desta feature): `useCategoryContent`/`useCategoryList` usam React Query com `staleTime` padrão (`main.tsx` não configura `QueryClient`); todo remount da tela (ex.: abrir e voltar de uma tela de detalhe) refaz `ensureCategory` com um `category` desatualizado (sem `itemsFetchedAt`, porque a lista de categorias nunca é invalidada depois de uma leitura); para `fetchMode: 'stored'`, isso tenta reler `storedEntries` — já consumido/apagado na primeira leitura (D-007) — e cai em `source_missing`, mascarando itens que já estão corretos em `channels`. Afeta qualquer volta de tela de detalhe pra uma categoria `stored`, não só a busca — bug real e sério, não um falso positivo desta feature | Alto (bug de fundo) / Baixo (ícone em si) — o ícone só revelou um problema que já existia em qualquer tela ao voltar de um detalhe | Resolvido: duas correções aplicadas, ambas com aprovação explícita do usuário (`AskUserQuestion`): (1) `LiveScreen.tsx`/`MoviesScreen.tsx`/`SeriesScreen.tsx` — condição do ícone agora inclui `!contentUnavailable`, com teste de regressão novo em cada tela (`LiveScreen.test.tsx`, `MoviesScreen.test.tsx`, `SeriesScreen.test.tsx`); (2) `categoryLoader.ts`, `readStored` — quando `storedEntries` vem vazio, checa `countChannels(sourceId, category.order, category.kind)` antes de declarar `source_missing`; se já há itens gravados (leitura anterior bem-sucedida), devolve `fresh` em vez de mascarar dado bom como indisponível — `source_missing` real (nunca lida, aparelho limpou storedEntries) continua funcionando (teste existente D-008 intacto), com teste de regressão novo em `categoryLoader.test.ts`. Verificado: `npx tsc -b` 0 erros; `npx vitest run` completo 714/716 (mesma flakiness pré-existente de `*.favorites.test.tsx` sob paralelismo, confirmada isolada); `npm run lint`/`build` limpos; `busca-por-categoria.mjs` 17/17 em 2 rodadas; `capa-real.mjs` 17/17; `m3u-sob-demanda.mjs` 2 de 3 rodadas limpas (mesma flakiness de timing do R-005, não regressão); reproduzido e confirmado também manualmente no navegador via Playwright MCP, antes e depois de cada correção |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-25 | Fase 1 (Setup) | Baseline confirmado: `npx tsc -b` → 8 erros (todos esperados, Movies/Series/testes por `searchActive`); `npx vitest run` → 704/711 (5 contratos vermelhos pelo motivo certo + 3 flakiness pré-existente de `*.favorites.test.tsx`); trava íntegra. | Nenhuma |
| 2026-09-25 | Fase 2 (Foundational) | `searchWithinItems<T>` implementada (normaliza, prefixo-primeiro, alfabético); `searchIndex` virou wrapper fino sobre ela sem mudar assinatura pública (achado: usar `entry.normalizedName` como extrator mudaria o desempate — corrigido usando `record.name`, reconstruindo a lista de records); `useAggregatedItems` implementada reaproveitando `loadSearchIndex`/React Query; CSS novo (`.search-icon-button`, `.category-title-row`, `.live-item-all`). 1/1 contrato da fase verde; `catalogSearch.contract.test.ts` (017, intocado) continua 2/2 verde; suíte da área sem regressão. | Nenhuma |

| 2026-09-25 | Fase 3 (Live TV — US1+US2+US3) | `LiveScreen.tsx` reescrito para o novo modelo: trilha genérica `[favorites, all, ...categories]` (constante, inclusive no zapping), `searchActive`/`searchTerm`/`topFocused` como sub-estado de qualquer entrada, `useAggregatedItems` alimentando "Todos", filtro client-side (`searchWithinItems`) para categoria real/Favoritos, ícone (`.search-icon-button`) só com itens carregados, zapping sem ícone. 4/4 contratos verdes. `LiveScreen.test.tsx`/`LiveScreen.favorites.test.tsx` reescritos para a nova trilha/modelo de busca (2 ArrowUp para alcançar "★ Favoritos" a partir do padrão, agora que "Todos" fica entre ela e a primeira categoria real). Achado real: bug de navegação (`return` incondicional bloqueava ←/→ com o ícone focado) — pego pelo próprio contrato, corrigido antes de fechar a fase. `LiveScreen.busca.contract.test.tsx` (017, obsoleto) fica vermelho de propósito até o Polish remover (D-011/T026). | Nenhuma |
| 2026-09-25 | Fase 4 (Filmes/Séries — US1+US2+US3) | `MoviesScreen.tsx`/`SeriesScreen.tsx` espelharam `LiveScreen.tsx` integralmente (sem zapping); ambas ganharam um `.live-column-title` novo dentro de `.category-title-row` (não existia antes — necessário pro ícone ter "o título/contagem" ao lado, FR-001). `onOpenMovie`/`onOpenSeries` passaram a entregar `searchActive` no snapshot. Como as duas telas migraram juntas, `{kind:'search'}` foi removido de `categoryScreenSnapshot.ts` já ao final desta fase (D-007 atualizado) em vez de esperar o Polish — `tsc -b` fechou com 0 erros. `MoviesScreen.test.tsx`/`.favorites.test.tsx`/`SeriesScreen.test.tsx`/`.favorites.test.tsx`/`App.test.tsx` reescritos para o novo modelo; T023 (Séries/"Todos") precisou de um teste novo além da reescrita do já existente. `MoviesScreen.busca.contract.test.tsx` (017, obsoleto) fica vermelho de propósito até o Polish remover. | Nenhuma |
| 2026-09-26 | Fase 5 (Polish) | T025/T026 (dead code + contratos obsoletos da 017) e T027 (`e2e/busca-por-categoria.mjs`, 17/17) fechados sem incidentes. T028 (nota de superseding na 017) e T030 (`CLAUDE.md`) escritos. T029 (gate final) revelou dois bugs reais na verificação manual do quickstart no navegador (Playwright MCP, não só os testes mockados) — ver R-005/R-006: um no script `m3u-sob-demanda.mjs` (race de timing, corrigido por subagente), outro em produção (ícone de busca não checava `contentUnavailable`; a correção revelou um bug mais profundo e pré-existente em `categoryLoader.ts`'s `readStored`, que caía em `source_missing` para uma categoria `stored` já lida ao reentrar na mesma sessão — corrigido com `countChannels` como fallback antes de declarar conteúdo ausente). Ambos corrigidos com aprovação explícita do usuário, com testes de regressão novos. Suíte final: `tsc -b` 0 erros, `vitest run` 714/716 (flakiness pré-existente), `lint`/`build` limpos, 5/5 contratos verdes, trava íntegra. | Nenhuma |

**PRÓXIMO**: Todas as tasks de `tasks.md` concluídas (T001–T030, Checklist de Release 100%) — feature pronta para `sdd-converge`.

## Arquivos Principais

- `tv-web/src/lib/catalog/catalogSearch.ts`
- `tv-web/src/lib/catalog/categoryLoader.ts` (R-006 — `readStored` com fallback a `channels`)
- `tv-web/src/features/catalog/catalogApi.ts`
- `tv-web/src/features/catalog/categoryScreenSnapshot.ts`
- `tv-web/src/features/live/LiveScreen.tsx`
- `tv-web/src/features/movies/MoviesScreen.tsx`
- `tv-web/src/features/series/SeriesScreen.tsx`
- `tv-web/src/features/screens.css`
- `tv-web/e2e/busca-por-categoria.mjs`

## Cuidados para Retomada

- Em `handleTrailDirection`, o bloco de navegação do "topo" (ícone/campo)
  precisa retornar cedo SÓ para ↑/↓ — nunca incondicionalmente. Um `return`
  dentro de `if (topFocused) {...}` sem checar a direção bloqueia ←/→
  (sair pra trilha, re-entrar) sempre que o ícone/campo estiver focado.
  Achado real na Fase 3, pego pelo próprio contrato "RETURN em camadas".
  Ao espelhar em `MoviesScreen.tsx`/`SeriesScreen.tsx` (Fase 4, navegação
  em grade com `gridNextIndex`/`GRID_COLS` em vez de lista 1D), replicar a
  mesma estrutura (`hasTop`/`if (hasTop && topFocused) { ...; if (dir ===
  'up' || dir === 'down') return }`), nunca um `return` cego dentro do
  bloco de topo.
- A trilha agora tem sempre 2 entradas virtuais fixas (Favoritos, Todos)
  — `VIRTUAL_TRAIL_COUNT = 2` não muda mais com `zapOpen`. Testes que
  navegam da categoria padrão até "★ Favoritos" com um único `ArrowUp`
  (herdados da feature 017, quando só havia 1 entrada virtual antes dela)
  precisam de dois `ArrowUp` agora.
- (R-006) Testes unitários das três telas mockam `useCategoryContent`/
  `useCategoryList` inteiramente (`vi.mock('../catalog/catalogApi', ...)`)
  — o comportamento real de cache do React Query (`staleTime` padrão em
  `main.tsx`, sem config) nunca é exercitado por eles. Um bug de fundo em
  categorias `stored` (feature 014) só apareceu na verificação manual do
  `quickstart.md` no navegador de verdade, nunca nos testes mockados nem
  nos E2E que não desmontam a tela (trocar de categoria pela trilha não
  remonta o componente; abrir uma tela de detalhe e voltar, sim). Ao mexer
  em qualquer coisa que dependa de `ensureCategory`/`readStored`/cache de
  categoria, teste manualmente o fluxo "entrar numa categoria `stored` →
  abrir um item → voltar" no navegador, não só rodar a suíte mockada.

## Resultado Final

Convergência (`sdd-converge`, 2026-09-26): rodada sem achado acionável de
código. Os 5 testes de contrato passam de forma genuína (nenhum atalho,
mock da própria unidade ou condicionamento a valor exato de teste), a
trava está íntegra, e todo FR-001–FR-019/SC-001–SC-004 foi confirmado no
código real das três telas (`LiveScreen.tsx`, `MoviesScreen.tsx`,
`SeriesScreen.tsx`). O dead code da feature 017 (`useCatalogSearch`,
`useDebouncedValue`, `{ kind: 'search' }`, `.live-item-search`) foi de
fato removido do código funcional — só restam comentários históricos
explicando a remoção, confirmados por busca direta no repositório.

Único achado (CF-001, severidade LOW, puramente textual, sem ação de
código): `spec.md` FR-005 ainda diz "após uma pausa breve", mas D-004
já documenta e o código já implementa "sem debounce" (filtro síncrono a
cada tecla, decisão deliberada e correta — a frase da spec só não foi
atualizada quando D-004 refinou esse detalhe técnico). Registrado aqui
em vez de editado no corpo de `spec.md` (fora do escopo de edição deste
skill); uma futura sessão pode corrigir essa frase pontual se achar valor
nisso — não bloqueia nada e não muda comportamento.

Dois desvios reais do plano original, ambos já detalhados em R-005/R-006
acima e nas Execution Notes da Fase 5: um bug de teste pré-existente
(`m3u-sob-demanda.mjs`, feature 014) e um bug de produção pré-existente
(`categoryLoader.ts`'s `readStored`, feature 014) — nenhum dos dois
estava no escopo original desta feature, ambos achados por acaso durante
o gate final (T029) e corrigidos com aprovação explícita do usuário. Nenhum
outro desvio entre o planejado e o entregue.

`README.md` do projeto: conferido, não precisou de edição — a menção
genérica existente a "Pesquisa nos três tipos de conteúdo" já cobre o
novo design sem entrar em detalhe de mecanismo de UI (ícone vs. entrada
de trilha), e esta feature não teve validação em TV física para registrar
como marco.
