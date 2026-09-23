import Dexie, { type EntityTable } from 'dexie'

/**
 * Armazenamento local do aparelho — a fonte de verdade das telas depois da
 * migração client-first (ADR-008). Substitui o PostgreSQL do backend, que
 * continua existindo para o caminho congelado, sem relação com este.
 *
 * Três coleções com fronteiras deliberadas (data-model.md):
 * - `sources` é durável e guarda credencial;
 * - `channels` é um snapshot substituível, trocado por geração;
 * - `importRuns` é efêmero e existe para a tela de progresso e para
 *   impedir duas importações simultâneas da mesma fonte.
 *
 * Nada aqui é acessado direto pelas telas: elas falam com os repositórios
 * (plan.md, D-001), para trocar esta camada não alcançar nenhuma tela.
 */

export type SourceType = 'm3u_url' | 'provider_credentials'
export type ConnectionState = 'never_synced' | 'synced' | 'error'
export type ProviderImportMode = 'xtream_api' | 'legacy_m3u'

export interface SourceRecord {
  id: string
  type: SourceType
  displayName: string
  m3uUrl?: string
  providerDns?: string
  /** Credencial — nunca sai daqui para `channels` nem para a interface (D-005/FR-009). */
  providerUsername?: string
  /** Credencial — idem. */
  providerPassword?: string
  /** `undefined` = conta ainda não consultada; lista vazia = consultada e nada declarado. */
  providerAllowedFormats?: string[]
  providerImportMode?: ProviderImportMode
  /** `undefined` = fonte ainda não passou pelo conector novo. */
  providerMigratedAt?: number
  connectionState: ConnectionState
  lastSuccessfulSyncAt?: number
  lastTruncatedByStorage?: boolean
  lastDiscardedByType?: number
  /** Geração publicada do catálogo. `undefined` = nenhuma ainda (D-004). */
  activeGeneration?: number
  createdAt: number
  updatedAt: number
}

export type CatalogItemKind = 'channel' | 'movie' | 'series' | 'episode' | 'unclassified'


export interface UserStateRecord {
  stableId: string
  sourceId: string
  isFavorite: boolean
  /**
   * Quando virou favorito, em epoch ms; ausente quando não é.
   *
   * Existe porque `isFavorite` **não é indexável**: booleano não é chave
   * válida de IndexedDB, então um índice sobre ele nasce vazio e a consulta
   * cai numa varredura completa sem ninguém perceber. Um instante é chave
   * válida, e ainda dá a ordem certa (favoritado por último aparece
   * primeiro) sem ordenação em memória.
   */
  favoritedAt?: number
  progressSeconds?: number
  lastWatched?: number
  createdAt: number
  updatedAt: number
}

export interface CatalogRecord {
  id?: number
  sourceId: string
  generation: number
  kind: CatalogItemKind
  name: string
  originalName: string
  group?: string
  groupOrder: number
  /**
   * Chave local da categoria a que este item pertence (feature 010).
   * Preenchida nos dois caminhos de importação — o integral também grava
   * categorias, com `fetchMode: 'eager'` (data-model.md §2.1/§3).
   * `undefined` só para item cujo grupo não é uma das categorias
   * navegáveis (canal, filme, série) — ex.: episódio solto.
   */
  categoryId?: number
  providerStreamId?: string
  providerCategoryId?: string
  seriesId?: string
  seasonNumber?: number
  episodeNumber?: number
  streamExtension?: string
  directUrl?: string
}

/** As três seções que o painel expõe por categoria (feature 010). */
export type CategoryKind = 'channel' | 'movie' | 'series'

/** Como os itens de uma categoria chegam (data-model.md §2.1). */
export type CatalogFetchMode =
  | 'on_demand' // Provedor pelo protocolo JSON — itens buscados por categoria, ao abri-la.
  | 'eager' // URL M3U e modo limitado — itens já vieram inteiros na importação.

/**
 * Uma categoria da estrutura do catálogo (feature 010).
 *
 * Existe como entidade própria desde a importação, mesmo antes de seus
 * itens serem obtidos: *saber que uma categoria existe* deixa de depender
 * de *ter os itens dela* (`data-model.md` §1). É o que permite a
 * importação de provedor gravar só a estrutura e concluir em segundos.
 */
export interface CategoryRecord {
  id?: number
  sourceId: string
  generation: number
  kind: CategoryKind
  fetchMode: CatalogFetchMode
  /** Identificador do provedor. `undefined` em categoria `eager` — não há o que perguntar por ela. */
  providerCategoryId?: string
  /** Como o provedor/fonte declarou. Vazio é estado legítimo — nunca substituído por rótulo externo. */
  name?: string
  /** Posição na ordem declarada pela fonte. Nunca ordenação alfabética imposta. */
  order: number
  /** Contagem que a fonte declara. `undefined` = não declarou nada — a interface não inventa um número. */
  declaredCount?: number
  /** Instante da última obtenção dos itens. `undefined` = nunca obtida. */
  itemsFetchedAt?: number
  /** Quantos itens de fato estão gravados agora — fato do disco, nunca fundido com `declaredCount` (D-005). */
  itemsCount?: number
}

export type ImportStatus = 'running' | 'completed' | 'failed' | 'cancelled'
export type ImportStep = 'fetching' | 'parsing' | 'storing' | 'done'

/** Categoria de erro, nunca a mensagem crua da rede — que carrega a URL completa. */
export type ImportErrorKind =
  | 'invalid_credentials'
  | 'subscription_expired'
  | 'direct_connection_refused'
  | 'network_failure'
  | 'invalid_playlist'
  | 'empty_playlist'
  | 'hls_manifest'
  /** O app foi fechado no meio — ninguém estava conduzindo a execução. */
  | 'interrupted'

/** Seções do painel que não responderam, declaradas em vez de viradas em lista vazia. */
export type CatalogSection = 'movie' | 'series'

export interface ImportRunRecord {
  id: string
  sourceId: string
  generation: number
  status: ImportStatus
  step: ImportStep
  /**
   * O que `entriesRead`/`channelsStored` contam nesta execução (feature
   * 010). `undefined`/`'items'` = itens (canal, filme, série, episódio) —
   * o significado de sempre, usado por toda fonte M3U e pelo modo
   * limitado. `'categories'` = categorias — usado pela fonte de provedor
   * pelo protocolo JSON, que grava só estrutura e conclui em segundos
   * (FR-013: a tela de progresso conta categorias, sem percentual).
   */
  unit?: 'items' | 'categories'
  /** Total de entradas lidas, incluindo as descartadas. */
  entriesRead: number
  channelsStored: number
  /** Entradas válidas que não eram canais — sustenta dizer "não é o catálogo completo". */
  discardedByType: number
  invalidCount: number
  /** `true` quando a gravação parou por falta de espaço (FR-018). */
  truncatedByStorage: boolean
  /**
   * Seções que o painel não serviu. Uma seção ausente não pode virar lista
   * vazia em silêncio: "este provedor não tem filmes" e "não deu para
   * perguntar por filmes" são coisas diferentes para quem olha a tela.
   */
  unavailableSections?: CatalogSection[]
  errorKind?: ImportErrorKind
  /**
   * Quando cada etapa começou, em epoch ms.
   *
   * Carimbado **onde a etapa acontece**, não onde a notícia dela chega. O
   * trabalho roda num Worker, e o instante em que a mensagem alcança a
   * thread de interface não é o instante em que a etapa começou — medir
   * pelo segundo daria um detalhamento errado justamente numa importação
   * longa, que é quando o detalhamento importa (US1).
   */
  stepStartedAt?: Partial<Record<ImportStep, number>>
  /**
   * Último sinal de vida da execução, em epoch ms.
   *
   * Sem ele, um registro em `running` deixado para trás por um fechamento do
   * app tranca a fonte para sempre: `activeRunFor` continua encontrando uma
   * execução "ativa" que ninguém está conduzindo, e toda importação seguinte
   * é recusada. O batimento é o que permite distinguir uma importação lenta
   * de uma órfã.
   */
  heartbeatAt?: number
  startedAt: number
  finishedAt?: number
}

const DB_NAME = 'ccplaytv'

export class CatalogDb extends Dexie {
  sources!: EntityTable<SourceRecord, 'id'>
  channels!: EntityTable<CatalogRecord, 'id'>
  importRuns!: EntityTable<ImportRunRecord, 'id'>
  userStates!: EntityTable<UserStateRecord, 'stableId'>
  categories!: EntityTable<CategoryRecord, 'id'>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(1).stores({
      sources: 'id',
      channels: '++id, [sourceId+generation], [sourceId+generation+groupOrder]',
      importRuns: 'id, [sourceId+status]',
    })
    this.version(3).stores({
      channels: '++id, [sourceId+generation], [sourceId+generation+groupOrder], [sourceId+generation+kind+groupOrder]'
   
    })
    this.version(4).stores({
      userStates: 'stableId, sourceId'
    })
    this.version(5).stores({
      userStates: 'stableId, sourceId, isFavorite, lastWatched'
    })
    // v6 troca o índice `isFavorite` por `favoritedAt`: booleano não é chave
    // válida de IndexedDB, então o índice da v5 nunca teve entrada alguma e
    // a consulta de favoritos varria a tabela inteira achando que usava
    // índice. A migração preenche o instante a partir do que já existe, para
    // favorito antigo não sumir da lista.
    this.version(6)
      .stores({
        userStates: 'stableId, sourceId, favoritedAt, lastWatched',
      })
      .upgrade((transaction) =>
        transaction
          .table<UserStateRecord>('userStates')
          .toCollection()
          .modify((state) => {
            if (state.isFavorite && state.favoritedAt === undefined) {
              state.favoritedAt = state.updatedAt
            }
          }),
      )
    // v7 (feature 010): categoria vira entidade própria, em vez de um
    // número derivado das chaves únicas de `channels`. Sem migração de
    // dados — uma fonte importada pelo modelo antigo fica sem linha em
    // `categories`, e é tratada como fonte a re-sincronizar, não como
    // dado a converter (data-model.md §4: adivinhar `providerCategoryId`
    // a partir de `groupOrder` seria reconstrução por aproximação, que a
    // constitution proíbe).
    // `sourceId` sozinho é índice de verdade, não só prefixo do composto:
    // consultá-lo como prefixo (`.where('sourceId')`) cai na camada de
    // "virtual index" do Dexie 4, que quebrou até consulta em tabela vazia
    // neste ambiente de teste (Dexie + fake-indexeddb). Declarar os dois
    // de propósito evita depender dessa emulação — mesma razão pela qual
    // `channels` usa `[sourceId+generation]` explícito para descarte por
    // fonte, em vez de confiar num prefixo do índice maior.
    //
    // O segundo índice que estava previsto aqui,
    // `[sourceId+generation+kind+providerCategoryId]` (para "localizar a
    // categoria que a tela abriu"), foi removido antes de qualquer código
    // consumidor existir: quem abre uma categoria já recebe o objeto
    // inteiro de `listCategories`, com o id local e o providerCategoryId
    // juntos — não há busca reversa por providerCategoryId em nenhum
    // caminho de código (data-model.md §2, nota de execução).
    this.version(7).stores({
      categories: '++id, sourceId, [sourceId+generation+kind+order]',
    })
  }
}

export const db = new CatalogDb()
