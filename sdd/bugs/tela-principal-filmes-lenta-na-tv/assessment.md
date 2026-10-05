# Bug Assessment: Tela principal de Filmes lenta na TV (1ª e 2ª visita)

- **Slug**: `tela-principal-filmes-lenta-na-tv`
- **Criado**: 2026-10-05
- **Origem**: texto colado (relato do usuário na TV física) + item 70 `[Bug]` de `.planning/backlog.md` (aberto pela convergência da 057, `sdd/specs/057-top10-dica-tmdb/plan.md` R-015)
- **Veredito**: valid
- **Severidade**: medium

## Report

Relato do usuário em 2026-10-05, depois de instalar a 057 na Samsung QN50Q60DAGXZD: "tela principal de filmes está meio lenta, precisa investigar e ver como otimizar ou até remover categorias"; "primeira visita está lenta. Segunda melhor mas ainda lenta". O Início abre rápido; as fileiras Top 10 e Dica aparecem (Top 10 de filmes com 2, 6, 7, 8, 9 e 10, fonte TMDB).

## Symptom

Ao abrir a vitrine de Filmes (lista real: ≈43 mil filmes, 104 categorias) o primeiro desenho demora e o controle remoto fica preso por instantes; voltando a Filmes depois de passar pelo Início melhora um pouco, mas continua lento. Esperado: a vitrine desenha as fileiras sem travar a thread de forma perceptível.

## Reproduction

1. Importar a lista real e deixar a pré-carga encher o catálogo (104 categorias, ≈10–15 s).
2. Abrir Filmes pela topbar (1ª visita), voltar ao Início, abrir Filmes de novo (2ª visita).
3. Medir com `PerformanceObserver('longtask')` e perfil de CPU (CDP) com a CPU limitada em 4× para se aproximar da TV. Roteiros no scratchpad da sessão (`perfil-filmes.mjs`, `prep057.mjs`), **sem chave TMDB** para isolar o custo que a 057 não causa.

Medições (lista real, **build de produção** `dist`, CPU 4×; tempos de relógio com a CPU limitada, CPU "real" = dividido por 4):

| | 1ª fileira | maior tarefa longa | soma de tarefas longas | CPU real (sem ocioso) |
| --- | --- | --- | --- | --- |
| 1ª visita | 121 ms | 254 ms | 922 ms (8 tarefas) | ≈307 ms |
| 2ª visita | 356 ms | 307 ms | 888 ms (4 tarefas) | ≈285 ms |

No desktop sem limite: 1ª visita 85–90 ms, 2ª visita ≈245 ms até a 1ª fileira, maior tarefa ≈203 ms. A TV tende a ser mais lenta que 4×. [NEEDS CLARIFICATION: a TV física não foi cronometrada; só o relato qualitativo do usuário.]

## Suspected Code Paths

- `tv-web/src/features/catalog/catalogApi.ts:1519-1534` (`useRecentlyAdded`) — o `select` roda `index.entries.map((entry) => toItemOut(entry.record, kind))` sobre **todos** os ≈43 mil registros só para depois escolher 12 (`recentlyAdded`). No perfil de dev: `itemOut` ≈117–138 ms reais, `recentlyAdded` ≈11–50 ms, GC.
- `tv-web/src/features/catalog/catalogApi.ts:1542-1585` (`useTopRated`, feature 056) — o `select` roda `selectFeaturedRated` sobre todo o índice: filtra por nota e ano e calcula `titleKey` (regex de normalização) para cada título elegível (≈8,9 mil filmes): `titleKey` ≈61–68 ms, `selectFeaturedRated` ≈31–34 ms.
- Os mesmos dois hooks (e `useAggregatedItems`, `useDiscoveryRow`) observam a **mesma** `queryKey` `['catalog-search-index', sourceId, kind]` com `staleTime: 0` e `refetchOnMount: 'always'` — **toda** montagem de Filmes relê o índice inteiro do IndexedDB (`loadSearchIndex` → `listAllOfKind`: `req.onsuccess` do Dexie ≈50 ms reais, mais ≈43 mil objetos novos e GC) e, como o array novo invalida os `select`, os dois `select` acima rodam de novo. O react-query **não** compartilha o resultado do `select` entre observadores/montagens: cada nova montagem recalcula no primeiro render, com os dados em cache, antes do primeiro desenho. Isso explica a 2ª visita mais lenta que a 1ª no desktop (1ª: o índice ainda está carregando e os `select` rodam depois do primeiro desenho).
- `tv-web/src/features/vod/vodShowcase.ts:11-31` (`recentlyAdded`) — recebe `CatalogItemOut[]`, o que força o mapeamento completo antes.
- Categorias (carrosséis): **não** aparecem entre os maiores custos do perfil. A pilha é virtualizada e só as fileiras da janela (−1…+3) leem prévias do disco (`useCategoryPreviews`). Remover categorias não resolveria; o custo é do índice completo.

## Root Cause Hypothesis

Duas fileiras da vitrine ("Adicionados recentemente" e "Bem avaliados") são derivadas de um índice com o tipo inteiro (≈43 mil registros) e o trabalho é refeito, de forma síncrona e dentro da renderização, a **cada montagem** da tela: releitura do índice por `refetchOnMount: 'always'` + mapeamento de todos os registros para `CatalogItemOut` + normalização de títulos de milhares de registros. Confiança: **alta** — o perfil de CPU (produção e dev) e o experimento sem chave TMDB reproduzem a diferença entre 1ª e 2ª visita e apontam as mesmas funções.

## Proposed Remediation

**Preferida** (três mudanças pequenas e independentes, sem remover nada da tela):

1. **Escolher antes de mapear** em `useRecentlyAdded`: generalizar a seleção (`recentlyAddedBy(items, addedAt, limit)` em `vodShowcase.ts`, com `recentlyAdded` chamando a versão genérica) e aplicar sobre `entry.record.addedAt`, mapeando para `CatalogItemOut` **só os 12** escolhidos. Mesmo resultado, sem 43 mil alocações.
2. **Guardar o resultado dos `select` pela identidade do índice**: um `WeakMap<índice, Map<chave, resultado>>` no módulo (chaves `added|kind` e `rated|kind|fonte|dia`), de modo que uma nova montagem com o índice em cache devolva a mesma lista sem recalcular nada (e com a mesma referência, sem re-render à toa).
3. **Parar de reler o índice a cada montagem**: nos hooks da vitrine (`useRecentlyAdded`, `useTopRated`) trocar `staleTime: 0` + `refetchOnMount: 'always'` por um `staleTime` de 60 s (e `refetchOnMount` padrão). A chegada de categoria já invalida a chave (`prefetchApi.ts:53`), então o conteúdo continua se atualizando sozinho; o custo é a janela de até 60 s em que uma troca fora desse caminho (ex.: ressincronização) pode mostrar o índice anterior. Com o índice estável, também deixa de ser reconstruído o índice dos registros do cruzamento do Top 10/Dica (`matchDiscoveryTitlesAsync`, guardado pela identidade de `index.entries`).

**Alternativas** (opcional):
- Tirar também esses dois `select` da renderização, como a 057 fez com o Top 10/Dica (cálculo em `useEffect` e fatiado). Mais invasivo: a fileira apareceria depois do primeiro desenho. Só se a TV ainda estiver lenta depois das três mudanças acima.
- Remover os carrosséis de categoria: **descartado** — não são o custo medido, e é a principal descoberta de conteúdo da tela.
- `staleTime: Infinity` com invalidação explícita ao fim de importação/ressincronização: mais rápido, mas exige auditar todos os pontos de escrita do catálogo; fica para uma melhoria futura.

**Files likely to change**:
- `tv-web/src/features/vod/vodShowcase.ts` (`recentlyAddedBy`)
- `tv-web/src/features/catalog/catalogApi.ts` (`useRecentlyAdded`, `useTopRated`, o guardador por índice)
- `tv-web/src/features/vod/vodShowcase.test.ts` e um teste novo de hook, p.ex. `tv-web/src/features/catalog/catalogApi.vitrine-cache.test.tsx`
- `sdd/bugs/tela-principal-filmes-lenta-na-tv/*` e `.planning/backlog.md` (painel de bugs, remoção do item 70)

**Tests to add or update**:
- `recentlyAddedBy`: mesma ordem, empate e descarte de item sem data que `recentlyAdded`; só lê o que precisa (não muta).
- Hooks: com o índice em cache, uma 2ª montagem de `useRecentlyAdded`/`useTopRated` **não** relê o índice (conta de leituras do banco) e devolve a mesma lista; chegada de categoria (invalidação) atualiza; troca de lista/tipo não reaproveita resultado de outra lista.
- Regressão: suítes de `src/features/vod`, `src/features/catalog` e os contratos 052/053/056/057 continuam verdes; E2E `top10-dica`, `bem-avaliados`, `carrosseis-filmes-series`, `vitrine-filmes-series`.
- Re-medir com o mesmo roteiro (produção, CPU 4×), 1ª e 2ª visita, sem e com chave.

## Risks & Considerations

- `staleTime` de 60 s: após uma ressincronização que não passe pela invalidação da pré-carga, a vitrine pode mostrar o índice anterior por até 60 s ao reabrir. Mitigação: o prazo curto e a invalidação existente; conferir se a conclusão da importação já invalida as queries do catálogo.
- O guardador por identidade do índice precisa ser chaveado por fonte, tipo e dia (a fileira "Bem avaliados" muda por dia): chave errada mostraria a lista de outra fonte.
- Contratos travados (052/053/056/057) usam hooks mockados e não dependem do `select`; confirmar rodando. Não editar contratos.
- O ganho na TV não está medido: o relato é qualitativo. A TV física precisa confirmar depois do reinstalar.
- O código tocado é da 056 (já commitada junto da 057); mudança mínima, sem refatorar o que não é do bug.

## Open Questions

- [NEEDS CLARIFICATION: tempo real da 1ª fileira de Filmes na TV, antes e depois — o usuário cronometra ou descreve (instantâneo / ≈1 s / vários segundos).]
- [NEEDS CLARIFICATION: a conclusão de importação/ressincronização invalida `['catalog-search-index', fonte]`? Se não, o `staleTime` de 60 s precisa de uma invalidação explícita lá (verificar na fase Fix antes de aplicar).]
