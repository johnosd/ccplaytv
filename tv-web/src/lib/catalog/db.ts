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
  providerStreamId?: string
  providerCategoryId?: string
  seriesId?: string
  seasonNumber?: number
  episodeNumber?: number
  streamExtension?: string
  directUrl?: string
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
  }
}

export const db = new CatalogDb()
