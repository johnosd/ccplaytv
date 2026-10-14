# Contratos client: feature 065

Não há nova API HTTP/backend. Estas são superfícies internas públicas, testadas sem depender de variáveis privadas.

## Superfícies existentes

- createPrefetchInvalidator(client, batchMs).categoryDone(sourceId, categoryId, kind?) conserva os dois primeiros argumentos; kind opcional preparado pelo plan. Na execução aplica escopo e resolve categoria se faltar kind. dispose cancela lote pendente.
- tmdbGet(path, params, credential, fetchImpl?) mantém retorno Promise<unknown> e TmdbError com mensagem fixa. Opções adicionais de cancelamento/contexto são opcionais no fim; callers antigos continuam funcionando.
- loadTipPool/loadWeeklyTrending mantêm DiscoveryResult e nunca lançam para a UI. Todas as páginas necessárias têm sucesso antes de renovar o cache.
- MetadataOptions pode receber signal/contexto opaco; nunca chave na query key. Cancelamento de consumidor não significa abortar todos os consumidores.
- catalogApi mantém os nomes/tipos de hooks que telas e contratos antigos importam; extrações são reexportadas. toItemOut mantém campos reais de listagem.

## Novas assinaturas (stubs existentes)

~~~typescript
selectFeaturedRatedAsync<T>(
  items: Iterable<T> | AsyncIterable<T>,
  read: RatedFields<T>,
  options: FeaturedRatedOptions,
  scheduling: {
    yieldControl: () => Promise<void>
    batchSize?: number
    signal?: AbortSignal
  },
): Promise<{ picked: T[]; eligibleCount: number }>

prepareCategoryReadModel(
  sourceId: string,
  categoryId: number,
  database?: CatalogDb,
): Promise<void>

readCategoryWindow(
  sourceId: string,
  categoryId: number,
  offset: number,
  limit: number,
  database?: CatalogDb,
): Promise<{ items: CatalogRecord[]; total: number; nextOffset?: number }>
~~~

offset/limit são inteiros não negativos, limit positivo; entrada inválida retorna erro fixo sem dados privados. Janela vazia legítima retorna items=[] e total correto. nextOffset só existe se há itens depois da janela. Todos os ids/ordem vêm do canônico; após prepare em contexto válido, janela não chama categoryBlocks.get para pegar poucos itens. As funções são reexportadas por catalogRepository na execução; telas não importam repository diretamente.

Projeção não contém dados de reprodução; getChannel/playbackUrl continuam recuperando os campos canônicos quando a ação explícita precisa deles. Compatibilidade por source/generation/revision é obrigatória, não um TTL de tempo isolado.
