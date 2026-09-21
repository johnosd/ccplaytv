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
  /** Geração publicada do catálogo. `undefined` = nenhuma ainda (D-004). */
  activeGeneration?: number
  createdAt: number
  updatedAt: number
}

export interface ChannelRecord {
  id?: number
  sourceId: string
  generation: number
  name: string
  originalName: string
  /** Categoria como a fonte declarou. Ausente é estado legítimo, nunca rótulo inventado. */
  group?: string
  /** Posição da categoria na ordem declarada pela fonte — preserva ordem sem reordenar por texto. */
  groupOrder: number
  providerStreamId?: string
  providerCategoryId?: string
  /**
   * Só para fonte `m3u_url`, onde a URL **é** o dado que a lista fornece e
   * não há identificador a partir do qual reconstruí-la (data-model.md §4).
   * Para fonte de provedor fica ausente: a URL é montada na hora.
   */
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
  startedAt: number
  finishedAt?: number
}

const DB_NAME = 'ccplaytv'

export class CatalogDb extends Dexie {
  sources!: EntityTable<SourceRecord, 'id'>
  channels!: EntityTable<ChannelRecord, 'id'>
  importRuns!: EntityTable<ImportRunRecord, 'id'>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(1).stores({
      sources: 'id',
      // O índice composto com groupOrder é o que permite ler uma categoria
      // por página, na ordem declarada, sem carregar o catálogo (FR-005).
      channels: '++id, [sourceId+generation], [sourceId+generation+groupOrder]',
      importRuns: 'id, [sourceId+status]',
    })
  }
}

export const db = new CatalogDb()
