# Leitura, seleção e atualização do catálogo: feature 065

## Fachada e limites

Toda tela usa features/catalog; todos os novos leitores de itens passam por catalogRepository.ts. Os módulos novos repository/categoryWindow.ts, repository/readProjection.ts, catalogDerivedRows.ts e seriesWatchRepository.ts não importam features nem player. Separar hooks extraídos de catalogApi em showcaseApi.ts, categoryWindowApi.ts, historyApi.ts e seriesSummaryApi.ts, com reexports compatíveis na fachada; não aumentar tetos herdados da catraca 063.

prepareCategoryReadModel/readCategoryWindow são stubs públicos preparados no plan. Reexportar pela fachada na execução. A preparação é idempotente e reconstruível. Janela usa manifesto válido; lê somente chunks intersectando [offset, offset+limit), retorna total e nextOffset. offset não é identidade. Quando a revisão muda, invalidar cursor antigo e localizar id para restaurar contexto antes de mostrar a nova janela.

Retornar CatalogRecord com campos de listagem corretos e opcionais não necessários omitidos; detalhe/player recuperam registro canônico pela identidade/id. Não enviar URL de playback a metadados externos. Fallback legado mantém positivos até a conversão vigente, e a ponte movedIdOf continua válida.

## Seleção exata sem ordenar todos

selectFeaturedRated continua API pura e referência de regras, mas ganha implementação eficiente. selectFeaturedRatedAsync mantém as mesmas regras e retorna a mesma forma. Processar entradas em ordem, mantendo primeiro vencedor em empate total:

bestByTitleYear = escolher versão por comparador byQuality vigente
eligibleCount = quantidade EXATA de chaves
recent = melhores 36 recentes, top-K estável com ordinal para empate total
older = melhores até limit antigos por byYearFirst, somente para completar
pool = recent; completar com antigos se recent.length < limit
chosen = sortear por hash atual e id, quando pool.length > limit
resultado = ordenar escolhidos por byQuality vigente

Não reduzir bestByTitleYear a top-K antes de conhecer todos os vencedores globais. Comparadores e titleKey conservam semântica, incluindo acentos, marcadores, ano, 9,9 inclusivo, 10 exclusivo e fallback antigo. Fast paths de normalização precisam de testes de equivalência; cache global ilimitado não é solução.

Na variante cooperativa, yield após no máximo batchSize entradas (padrão inicial 256) e entre fases custosas; usar tarefa de macrotask/quadros, não apenas Promise.resolve() que mantém a fila de microtasks monopolizada. Verificar signal antes/depois de cada pausa. Não usar um .sort() de 43.000 após pausar o loop e alegar bloqueio resolvido. Medir também CPU da API pura (SC-003); mover/fragmentar trabalho não dispensa esse ganho.

catalogDerivedRows expõe um AsyncIterable de projeções por categoria/chunk e descarta o recorte anterior. Os seletores em features/catalog/showcaseApi recebem esse fluxo; lib não importa seletores de features/vod. selectFeaturedRatedAsync aceita Iterable ou AsyncIterable, sem coletar o fluxo inteiro antes de calcular. Adicionados recentes conserva comparador e ordem; descoberta local conserva correspondência/tie-break da 057 e localTitleMatch. Antes das projeções da US3, iterar blocos canônicos um por vez, nunca listAllOfKind().toArray() para montar a vitrine inteira. Não reter SearchIndex completo por escolher 12 cards.

## Eventos e invalidação

categoryDone(sourceId, categoryId, kind?) foi estendido no plan como stub compatível. Na execução, propagar kind/revisão do scheduler, carga por seção, conversão e entrada de categoria. Se chamador legado não informar kind, resolver a categoria por repositório; fallback conservador só quando categoria não existir/estrutura inteira mudar.

Agrupar eventos por fonte/tipo/categoryId, uma publicação por lote de 1 s. Invalidar categoria/prévia afetada, cobertura/contadores da fonte e resultados do tipo. Não invalidar índices de series/live por evento movie. Índice compacto já presente aplica delta por categoria; resultados de vitrines recalculam apenas o tipo afetado. Global search altera só a partição afetada ou marca stale sem leitura integral imediata.

Revisão/epoch protege duas leituras concorrentes: resultado velho não substitui revisão nova. Preservar geração em atualização no mesmo caminho; mudança real de geração limpa derivados anteriores. O limite de até 2 s de FR-005 inclui processamento após o último lote, aferido pelo scheduler real.

## Grade, busca, histórico e resumos

Trocar payload acumulado por janela de três páginas e cursores de categoria+offset+revisão. Preservar índice lógico total, id focado, scrollOffset e mapeamento id→posição; recarregar janela anterior ao RETURN. Busca/ordenação abrangem todos os itens obtidos antes de paginar, com índice compacto ou varredura cooperativa; nunca ordenar só a página visível.

Separar contagem do histórico de HistoryContent. Contador não nasce como zero durante recarga nem exige gcTime Infinity dos objetos. Recuperar todos os resultados por páginas sem apagar userStates. Reutilizar buildStableId e helpers de agregação existentes.

seriesWatchMembers e summaries seguem data-model.md. Mover o helper puro summarizeSeriesWatched para lib/catalog/seriesWatchedSummary.ts e reexportar no caminho features/series anterior: lib não pode importar features. A semântica conhecida é known, watched e upToDate, conforme completedAt. Primeiro backfill é explícito e limitado; em cache válido, load consulta somente summaries. Atualização de episódio usa membros da própria série; mudança de estado usa índice stableIds para obter séries afetadas. Não chamar ensureSeriesEpisodes nem rede para produzir selo ao montar/focar.
