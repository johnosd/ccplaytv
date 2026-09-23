# Implementation Plan: Importação por Estrutura com Carga sob Demanda por Categoria

**Slug**: `010-catalogo-sob-demanda` | **Date**: 2026-09-23 | **Spec**: `sdd/specs/010-catalogo-sob-demanda/spec.md`

## Summary

A importação de fonte de provedor passa a gravar apenas as **categorias**
declaradas pelo painel; os itens de cada categoria passam a ser obtidos e
gravados quando a pessoa entra nela, com prazo de validade próprio. A
motivação é medida, não suposta: na TV de referência, com a fonte real de
311.367 entradas, a tela de progresso parou em "Lendo entradas" com
contadores subindo devagar — gargalo de **gravação** no IndexedDB.

Tecnicamente: uma coleção `categories` nova vira entidade de primeira
classe; `catalogRepository` deixa de derivar categorias das chaves únicas
de `channels`; um `categoryLoader` novo vira o ponto único de obtenção sob
demanda; `importPipeline` bifurca por tipo de fonte (provedor JSON grava
estrutura, M3U e modo limitado seguem integrais).

**A feature depende de uma premissa não confirmada** — que o painel aceite
filtrar por `category_id`. Fechar isso é a Fase 0, antes de qualquer código
de produção.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Vite 8 (alvo de build
`chrome108`).

**Primary Dependencies**: Dexie (IndexedDB), TanStack Query (estado de
consulta das telas), `@tanstack/react-virtual` (instalado pela feature 009,
não consumido por esta).

**Storage**: IndexedDB no aparelho, via Dexie — é a fonte de verdade
(ADR-008). Sem backend. Schema atual na v6; esta feature abre a v7.

**Testing**: Vitest + Testing Library + jsdom (`npm run test`). Lint por
oxlint (`npm run lint`). Sem backend envolvido: `api/` não é tocado.

**Target Platform**: Samsung QN50Q60DAGXZD, Tizen 8.0 / Chromium 108,
empacotado em `.wgt` a partir de `CCPlayTv/`.

**Performance Goals**: SC-001 (sincronizar em ≤ 15 s), SC-002 (abrir
categoria em ≤ 3 s com rede), SC-004 (espaço pós-sincronização proporcional
ao número de categorias, não de itens).

**Constraints**: a TV não entrega console — sem `dlog`, sem `ps`, Web
Inspector fechado (confirmado em 23/09/2026). A única instrumentação em
campo é a própria interface. Isso obriga a medição a ser visível na tela ou
inexistente.

**Scale/Scope**: fonte real de referência com 311.367 entradas e algumas
centenas de categorias. É essa a escala que decide o desenho, não um caso
médio hipotético.

## Decisões Invariantes

- **D-001**: Categoria é entidade própria, com geração. Saber que uma
  categoria existe deixa de depender de ter os itens dela.
- **D-002**: A troca de geração **nunca** toca `userStates`. FR-010
  descarta catálogo; favoritos e progresso sobrevivem a qualquer
  ressincronização. Reconciliar estado do usuário pressupõe que ele
  continue existindo.
- **D-003**: A obtenção "de exibição" acontece na **entrada** da categoria
  (SELECT/coluna) — a tela só MOSTRA conteúdo depois disso. **Emendada em
  23/09/2026 (verificação na TV física, R-013)**: além disso, a categoria
  sobre a qual o cursor **repousa** (parado por ~300ms, não a cada tecla)
  é pré-buscada em segundo plano, sem mudar o que a tela exibe — só
  preenchendo o cache para a entrada, quando acontecer, ser instantânea.
  Pedido explícito do usuário depois de ver o comportamento estrito ao
  vivo. Continua não havendo pré-busca de categorias **vizinhas** à que
  está com o foco.
- **D-004**: Fonte por URL M3U e provedor em modo limitado (`legacy_m3u`)
  mantêm o caminho integral atual, sem bifurcar o repositório de leitura —
  as telas continuam pedindo página de categoria, venha ela de onde vier.
  **Consequência travada (achado A1 do Analyze)**: *toda* fonte grava
  linhas em `categories`, inclusive as integrais. O que difere é
  `fetchMode` — `on_demand` versus `eager` —, nunca a existência da
  estrutura. `listCategories` tem um caminho de leitura só; não existe
  derivação de reserva para fonte sem estrutura gravada.
- **D-005**: `declaredCount` (promessa da fonte) e `itemsCount` (fato do
  disco) são campos distintos e nunca fundidos. É o que permite declarar
  divergência em vez de escolher um número.
- **D-006**: Substituição de itens de uma categoria é **integral** e em
  transação. Substituição parcial deixaria órfão de obtenção anterior.
- **D-007**: Se a Fase 0 mostrar que o painel não honra `category_id`,
  **nenhuma** alternativa de `research.md` é adotada sem reabrir o design.
  Escolher em silêncio uma que muda o perfil de memória desfaria, sem
  registro, a decisão que a feature 005 tomou por medição.
- **D-008**: Nenhuma tela fala com Dexie direto (herdado de 005 D-001).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | PASS | PASS | Nada muda no acesso; fonte continua não sendo conta. |
| Segredos Fora dos Clientes e dos Logs | ATENÇÃO | PASS | A URL de `player_api.php` com credencial deixa de ser montada 1× por importação e passa a ser montada a cada categoria aberta. Mais superfície, mesma regra. FR-017 + `data-model.md` §6 tornam explícito; task de revisão de vazamento na Polish. |
| Categorias da Fonte São Preservadas | PASS | **REFORÇA** | A categoria vira entidade com nome e ordem declarados, `name` vazio preservado. Deixa de ser número derivado. |
| IA e Classificação Nunca Inventam Dados | ATENÇÃO | PASS | Exibir `declaredCount` é exibir dado da fonte, não estimativa — desde que distinguível do real (D-005, SC-006) e com divergência declarada (FR-015). |
| Comandos Locais Independem de Rede, Backend ou IA | ATENÇÃO | PASS | O princípio enumera foco, Voltar e controles de mídia em reprodução — nenhum deles passa a depender de rede. Entrar numa categoria é obtenção de dado, como abrir uma fonte sempre foi. A degradação offline é real e está coberta pela ADR-002; ver R-007 e a emenda obrigatória. |
| Trailers e Metadados Não Alteram Estado da Obra | N/A | N/A | Feature não toca trailers nem metadados externos. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | PASS | PASS | FR-008 exige focável em carregando e erro; SC-005 verifica só com o controle. |
| Lista de Catálogo Nunca É Manifesto de Streaming | N/A | N/A | Caminho M3U inalterado; o reconhecimento de manifesto continua onde está. |
| Foco Visível e Sem Becos Sem Saída | PASS | **REFORÇA** | FR-004 (obter na entrada, não no foco) é a aplicação literal de "focar não dispara consulta externa". FR-008 cobre os estados novos. |
| Voltar Restaura Foco e Posição | LACUNA | PASS | A spec não tinha requisito para isso na primeira redação. **Resolvido em 23/09/2026 (achado A2 do Analyze): virou FR-019.** Voltar a uma categoria revalidada reconcilia o foco por id do item, não por índice — a lista pode ter mudado entre a saída e a volta. Coberto por R-004 e por T037/T039. |
| Identidade de Reprodução Não Depende da URL | ATENÇÃO | PASS | FR-010 descarta itens no resync. D-002 trava que `userStates` não é tocado — sem isso, ressincronizar apagaria favoritos e retomada. |
| Progresso e Capacidades São Reais | PASS | PASS | FR-013 proíbe percentual. Nota: com categorias existe denominador confiável, então percentual seria *permitido* pela constitution; a spec escolheu ser mais estrita. Não é violação. |
| Documentação do Repositório É Canônica | ATENÇÃO | PASS | Esta feature invalida `contracts/local-storage.md` §2 e `data-model.md` da 005, e amplia o alcance da ADR-002. Correção na mesma feature, não depois — tasks na Polish. |

Nenhuma violação não justificável. Nada foi para Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/010-catalogo-sob-demanda/
├── spec.md                        # Saída do sdd-specify
├── plan.md                        # Este arquivo
├── research.md                    # Fase 0 — a premissa não confirmada
├── data-model.md                  # Fase 1 — categories, v7, fronteiras
├── contracts/
│   └── catalog-on-demand.md       # Fase 1 — delta sobre o contrato da 005
├── quickstart.md                  # Fase 1 — verificação manual
└── tasks.md                       # Saída do sdd-plan
```

### Source Code (repository root)

Monorepo com frontend Tizen, projeto de empacotamento e backend congelado.
Esta feature toca **apenas** `tv-web/` e `CCPlayTv/` (nada em `api/`).

```text
tv-web/                              # React 19 + TS + Vite — o que roda na TV
├── src/
│   ├── App.tsx                      # Roteamento por estado; invalidação de consultas
│   ├── features/
│   │   ├── catalog/catalogApi.ts    # ALTERADO — hooks de consulta das telas
│   │   ├── live/
│   │   │   ├── LiveScreen.tsx       # ALTERADO — entra em categoria sob demanda
│   │   │   └── groupChannels.ts     # ALTERADO — totais reais por categoria
│   │   ├── movies/MoviesScreen.tsx  # ALTERADO
│   │   ├── series/SeriesScreen.tsx  # ALTERADO
│   │   ├── list-home/ListHomeScreen.tsx  # ALTERADO — contagem declarada
│   │   └── import/
│   │       ├── importApi.ts         # ALTERADO
│   │       └── ImportProgressScreen.tsx  # ALTERADO — conta categorias
│   └── lib/catalog/
│       ├── db.ts                    # ALTERADO — v7, coleção categories
│       ├── catalogRepository.ts     # ALTERADO — categories como entidade
│       ├── categoryLoader.ts        # NOVO — obtenção sob demanda
│       ├── importPipeline.ts        # ALTERADO — bifurca por tipo de fonte
│       ├── xtreamConnector.ts       # ALTERADO — consultas por category_id
│       └── freshness.ts             # ALTERADO — prazo por categoria
└── vite.config.ts                   # target chrome108 — não mexer

CCPlayTv/                            # Projeto Tizen empacotado em .wgt
└── tizen_web_project.yaml           # Lista de arquivos do pacote

api/                                 # Backend congelado — NÃO tocado por esta feature
```

**Structure Decision**: frontend-only. O trabalho concentra-se em
`tv-web/src/lib/catalog/` (contrato de dados) e nas telas que consomem o
catálogo. `api/` permanece congelado por ADR-008.

## Complexity Tracking

> Nenhuma violação de constitution exigiu justificativa.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| — | — | — |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

O que é testável sem a TV: toda a lógica de decisão do `categoryLoader`
(fresh/fetched/stale-served/failed), a bifurcação do `importPipeline`, o
schema v7, os repositórios, e os estados focáveis das telas. Testes com
instante **injetado**, nunca lendo o relógio dentro da função — é o padrão
que `freshness.ts` já estabelece e o que torna a regra de validade
determinística.

O que **só** a TV decide: SC-001, SC-002 e SC-004. São números de
desempenho no aparelho de referência, e a TV não entrega console — a
medição tem que aparecer na interface ou não existe.

Comandos-base:

```powershell
cd tv-web
npm run test        # vitest run
npm run lint        # oxlint
npm run build       # tsc -b && vite build
npm run build:tizen # build + sync para CCPlayTv/
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Schema (`db.ts`) | v7: coleção `categories` criada (`sourceId`, `[sourceId+generation+kind+order]`). Sem migração de dados — fonte pré-010 fica sem estrutura até re-sincronizar. |
| Repositório (`catalogRepository.ts`) | `listCategories` lê só de `categories` (caminho único, D-004); `storeCategories`, `storeCategoryItems`, `markCategoryFetched` novos; publish/discard/deleteAllForSource alcançam `categories` sem tocar `userStates`. |
| Pipeline de importação | Bifurcado: provedor JSON grava só estrutura (`on_demand`, zero itens); integral (M3U/`legacy_m3u`) grava estrutura `eager` + itens, como sempre, com `categoryId` desde o primeiro lote. |
| Obtenção sob demanda | `categoryLoader.ts` pronto: `ensureCategory` com os 4 estados do contrato, de-dup de chamadas concorrentes, atalho `eager`. |
| Telas | `ImportProgressScreen`/`importApi` distinguem categorias/itens via `run.unit`. `ListHomeScreen`/`catalogApi` mostram contagem real por seção, e declaram que a cobertura é por categoria. **Live TV, Filmes e Séries reescritas** (categoria-primeiro: trilha de categorias + conteúdo obtido só ao entrar), com nota de divergência declarado×real quando os dois existem. |
| US3 | Concluída — divergência visível, foco reconciliado por id (mecanismo da Fase 3, testado explicitamente aqui). |
| Documentação | ADR-002 emendada; contrato/data-model da 005 apontam o delta; CLAUDE.md/README.md corrigidos (inclusive dessincronia pré-existente). |
| **Verificação na TV física** | **Concluída (T046, 23/09/2026).** 6 de 7 cenários aprovados (A-F); Cenário G (fonte M3U) não executado por falta de fonte disponível na sessão — mitigado por T016 (automatizado). Cenário B só aprovou após a correção do R-013 (pré-busca amortecida). |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | **Resolvido (23/09/2026)**: o painel poderia não honrar `category_id` — a única referência do repositório (`docs/iptvnator/06`) mostra o cliente maduro baixando a seção inteira e filtrando localmente | Era crítico — é a premissa que sustenta a feature | Sonda contra o painel real (T001-T004): filtra nas três seções, com redução de 82–99,7% no tamanho da resposta. Números em `research.md` R0-1. Caminho principal do design confirmado; nenhuma alternativa adotada |
| R-002 | Painel pode limitar taxa de requisições quando a pessoa percorre muitas categorias rápido | Médio — categorias falhando sem motivo aparente | Uma obtenção por categoria compartilhada entre chamadas concorrentes (contrato §2, regra 2); observar na TV; não há retentativa automática agressiva |
| R-003 | `declaredCount` pode divergir do entregue | Baixo — mas vira número mentiroso se escondido | D-005 separa os campos; FR-015 exige declarar |
| R-004 | Voltar a uma categoria revalidada com a lista mudada pode perder o foco ou estourar índice | Médio — viola "Voltar Restaura Foco e Posição" | Reconciliar por id do item, padrão que `LiveScreen` já usa (`FocusIdentity`) e que `MoviesScreen`/`SeriesScreen` passaram a usar em 23/09/2026. Requisito próprio: **FR-019** |
| R-005 | A feature 009 está Em Execução e refatora `LiveScreen.tsx`, que esta feature também altera | Médio — conflito e retrabalho | Ordem entre as duas é decisão a tomar antes da Fase 3; recomendação em "Cuidados" |
| R-006 | FR-010 descarta itens obtidos ao ressincronizar; a pessoa perde o que baixou navegando | Médio — percepção de perda | Decisão explícita do usuário na clarificação de 23/09/2026. Registrada, não silenciosa |
| R-007 | Cobertura parcial deixa de ser exceção e vira o modo normal de operação | Médio — a ADR-002 passa a ser lida ao contrário do que o app faz | Emenda obrigatória à ADR-002 dentro desta feature (R0-4 de `research.md`) |
| R-008 | Fonte importada pelo modelo antigo fica sem `categories` e com itens sem `categoryId` | Médio — catálogo existente parece vazio | Sem migração de dados: tratada como fonte a re-sincronizar (`data-model.md` §4). Converter exigiria adivinhar `providerCategoryId`, que a constitution proíbe |
| R-010 | **Resolvido**: FR-014 original ("contagens declaradas pelo provedor") ficaria sempre vazia na prática — o protocolo Xtream real não declara contagem por categoria | Médio — hub sem número nenhum logo após sincronizar, contrariando o AS#2 da US1 | FR-014 refinada em execução: soma itens de categoria `eager` (completo) + `declaredCount` de `on_demand` (quando existir); sem nenhum dos dois, mostra contagem de categorias — nunca "0" para seção não obtida. Implementado em `catalogApi.ts` (`sectionCount`) e `ListHomeScreen.tsx` |
| R-011 | Achado durante T033: botões "Tentar de novo"/"Voltar" em estados de carregando/erro (Live/Movies/Series) têm `.tv-focus` visual mas não são ativáveis por OK do controle físico — `useRemoteNav` não roteia Enter para eles, nenhum `.focus()` DOM real é chamado. Pré-existente em `LiveScreen` antes desta feature; reproduzido fielmente (não corrigido) e mais 4 instâncias novas somadas (painéis de conteúdo de categoria nas 3 telas) | Baixo/Médio — botão existe (satisfaz a letra da constitution), mas só funciona por mouse | **Fora de escopo desta US** (não é sobre obtenção sob demanda, é sobre o mecanismo de ativação por controle). Logado em `.planning/backlog.md` como `[Bug]`, não corrigido calado. Caminho normal: `sdd-bugfix` |
| R-012 | `groupChannels()` (função original de agrupamento client-side) ficou sem consumidor em produção depois da Fase 3 — a categoria já é o grupo, não precisa mais ser derivada de uma lista plana | Baixo — código morto, não incorreto | Mantida com seus testes intactos por ora, para não inchar ainda mais o diff desta fase. Candidata a remoção explícita na Fase 5 (Polish) |
| R-013 | Achado na verificação da TV física (T046, Cenário B): sem pré-busca, mover o cursor pela trilha de categorias fazia toda entrada parecer a primeira vez — o usuário considerou isso pior do que o desenho original previa | Médio — percepção de lentidão em uso normal, mesmo com SC-002 (≤3s) tecnicamente atendido | **Resolvido a pedido do usuário**: pré-busca amortecida (300ms de permanência do cursor) via `useCategoryFocusPrefetch`/`prefetchCategoryContent` em `catalogApi.ts`, usada pelas três telas. Debounce existe especificamente para não violar o espírito de R-002 (rajada de requisições) ao passar o cursor rápido por muitas categorias. FR-004/D-003 emendadas |
| R-009 | **Resolvido**: trocar `listCategories` para ler a coleção `categories` deixaria toda fonte M3U sem categoria alguma, porque o caminho integral não gravava estrutura. Regressão invisível aos testes atuais — nenhum deles lê categorias de fonte M3U depois da migração | **Era crítico** — quebraria fontes que funcionam hoje | Resolvido em 23/09/2026 (achado A1 do Analyze): o caminho integral passa a gravar estrutura com `fetchMode: 'eager'`, criando a categoria na primeira aparição do grupo. D-004 estendida; `data-model.md` §2.1 e contrato §3 registram a decisão e a alternativa rejeitada. Coberto por T021 (implementação) e T016/T017 (regressão) |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-23 | Fase 0 | Sonda (`probe-category.mjs`) rodada contra o painel real do usuário: `category_id` filtra nas três seções, redução de 82–99,7% no tamanho da resposta. R-001 resolvido; R0-1 de `research.md` atualizado com os números. Script apagado após o registro (T004). | Nenhuma — Fase 1 liberada |
| 2026-09-23 | Fase 1 | Coleção `categories` (v7) e repositório completo (`listCategories`/`storeCategories`/`storeCategoryItems`/`markCategoryFetched`, publish/discard/delete estendidos). Um índice previsto em `data-model.md` (`providerCategoryId`) foi removido em execução — sem consumidor, e quebrava consultas sob Dexie 4 + fake-indexeddb neste ambiente de teste; `sourceId` virou índice próprio pelo mesmo motivo (prefixo de composto caía na mesma camada frágil). | **Regressão esperada**: `importPipeline.test.ts` fica vermelho até T021 (Fase 2) — o caminho M3U ainda não grava estrutura |
| 2026-09-23 | Fase 2 (US1) | `importPipeline` bifurcado por tipo de fonte; regressão da Fase 1 fechada. `xtreamConnector` ganhou `category_id` opcional nas consultas de item (pronto para a Fase 3) e `declaredCount` no tipo (sempre `undefined` na prática — Xtream real não declara). `ImportProgressScreen`/`ListHomeScreen` honestos quanto ao que sabem (R-010: FR-014 refinada — categoria vira piso quando não há item conhecível, nunca "0" forjado). Suíte: 223/223, `tsc`/`oxlint` limpos. | Nenhuma — Fase 3 liberada |
| 2026-09-23 | Fase 3 (US2) | `categoryLoader.ts` novo com os 4 estados do contrato + de-dup de chamadas concorrentes. `catalogApi.ts`: `useCategoryList`/`useCategoryContent` substituem `useChannels`/`useMovies`/`useSeries`. As 3 telas reescritas categoria-primeiro; Movies/Series ganharam trilha de categorias (regressão de design necessária: grade plana de tudo deixou de ser viável sob demanda). T035 resolvida por caminho diferente do previsto (totais fluem de `CatalogCategory`, não de `groupChannels.ts` — função original fica sem uso em produção, R-012). Achado fora de escopo logado, não corrigido (R-011). Suíte: 251/251, `tsc`/`oxlint`/`build` limpos. | Nenhuma — Fase 4 liberada |
| 2026-09-23 | Fase 4 (US3) | Divergência `declaredCount`×`totalCount` declarada nas 3 telas de categoria (nunca dispara contra Xtream real hoje, mas pronta). Nota de cobertura-por-categoria em `ListHomeScreen`. Reconciliação de foco por revalidação testada explicitamente (T037) — mecanismo já existia da Fase 3. Suíte: 254/254, `tsc`/`oxlint`/`build` limpos. | Nenhuma — Fase 5 (Polish) liberada |
| 2026-09-23 | Fase 5 (Polish) | T041-T045 concluídos: ADR-002 emendada; contrato/data-model da 005 apontam o delta; CLAUDE.md/README.md corrigidos (mais amplo que o pedido — as duas descreviam um estado pré-ADR-008/pré-005 que já estava errado antes desta feature); revisão de segredos sem achado novo; `tizen_web_project.yaml` confirmado batendo com o build (`npm run build:tizen`). T046 rodado com o usuário na TV física: SC-001 e SC-002 confirmados (Cenário A ≤15s, Cenário B instantâneo na segunda entrada); Cenário B revelou R-013 (pré-busca por permanência do cursor, T047), corrigido e reaprovado; C, D, E, F aprovados (F com a sobrevivência de favoritos não testável — não há UI de favoritar ainda, só cobertura automatizada); G não executado (sem fonte M3U disponível). Suíte 257/257, `tsc`/`oxlint`/`build`/`build:tizen` limpos. | Cenário G fica para confirmação visual numa sessão futura com fonte M3U disponível — risco baixo, caminho não alterado por esta feature |

**PRÓXIMO**: Feature 010 concluída — todas as tasks de `tasks.md` marcadas,
incluindo T046. `sdd-converge` pode rodar quando o usuário quiser fechar a
feature formalmente. Pendências que sobrevivem, fora do escopo desta
feature: R-011 (botões "Tentar de novo"/"Voltar" não ativáveis por OK, já
logado em `.planning/backlog.md` como `[Bug]`), R-012 (`groupChannels()`
morto, candidato a remoção num polish futuro), e o Cenário G do
`quickstart.md` (fonte M3U) ainda não observado numa TV física.

## Arquivos Principais

- `tv-web/src/lib/catalog/db.ts` — schema v7, `CategoryRecord`, `CategoryKind`, `CatalogFetchMode`, `ImportRunRecord.unit`
- `tv-web/src/lib/catalog/catalogRepository.ts` — `listCategories` reescrito, `storeCategories`, `storeCategoryItems`, `markCategoryFetched`
- `tv-web/src/lib/catalog/xtreamConnector.ts` — `LiveCategory.declaredCount`, `category_id` opcional em `fetchLiveStreams`/`fetchVodStreams`/`fetchSeries`
- `tv-web/src/lib/catalog/importPipeline.ts` — bifurcação por tipo de fonte, `categoryIdFor`/`categoryKindOf`
- `tv-web/src/features/import/importApi.ts` + `ImportProgressScreen.tsx` — `unit` categorias/itens
- `tv-web/src/features/catalog/catalogApi.ts` + `tv-web/src/features/list-home/ListHomeScreen.tsx` — `SectionCount`
- `tv-web/src/lib/catalog/categoryLoader.ts` — novo, `ensureCategory`
- `tv-web/src/features/live/LiveScreen.tsx`, `tv-web/src/features/movies/MoviesScreen.tsx`, `tv-web/src/features/series/SeriesScreen.tsx` — reescritas categoria-primeiro
- `tv-web/src/features/screens.css` — `.category-content` novo
- `tv-web/src/lib/catalog/db.test.ts` — novo
- `tv-web/src/lib/catalog/catalogRepository.test.ts` — estendido
- `tv-web/src/lib/catalog/categoryLoader.test.ts`, `tv-web/src/features/movies/MoviesScreen.test.tsx`, `tv-web/src/features/series/SeriesScreen.test.tsx` — novos
- `tv-web/src/features/live/LiveScreen.test.tsx` — reescrito

## Cuidados para Retomada

- **Dexie 4 + fake-indexeddb neste projeto não tolera bem um índice
  composto cujo último componente é opcional** (lançava `DataError` até em
  tabela vazia, via a camada "virtual index") **nem consultar um prefixo
  de índice composto como se fosse índice próprio** (`.where('sourceId')`
  quando só existe `[sourceId+...]`) — mesmo sintoma, mesma camada. Sempre
  que uma tabela nova precisar de "todos os registros desta fonte,
  qualquer geração/categoria", declare um índice de um campo só para isso,
  do jeito que `channels` já faz com `[sourceId+generation]` — não confie
  em prefixo de composto nem em campo opcional como último componente de
  índice.
