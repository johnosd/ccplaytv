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
/**
 * Por que uma fonte está em Modo limitado (feature 014, FR-020). Só existe
 * quando `providerImportMode === 'legacy_m3u'` — acesso recusado e
 * assinatura vencida NÃO levam ao Modo limitado, fazem a importação falhar
 * (FR-002 da spec 014).
 */
export type LimitedReason = 'protocol_unavailable' | 'panel_unreachable'
/** Categoria de falha de uma sincronização de EPG (feature 030) — nunca a mensagem crua da rede. */
export type EpgErrorKind = 'network' | 'refused' | 'not_xmltv' | 'unreadable' | 'storage_full'

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
  /** Motivo do Modo limitado (feature 014). Só presente junto de `providerImportMode: 'legacy_m3u'`. */
  limitedReason?: LimitedReason
  /** `undefined` = fonte ainda não passou pelo conector novo. */
  providerMigratedAt?: number
  connectionState: ConnectionState
  lastSuccessfulSyncAt?: number
  lastTruncatedByStorage?: boolean
  lastDiscardedByType?: number
  /** Geração publicada do catálogo. `undefined` = nenhuma ainda (D-004). */
  activeGeneration?: number
  /**
   * EPG (feature 030, `data-model.md` §1). Endereços podem carregar
   * credencial/token: mesma regra da ADR-010 — nunca em log, tela, erro,
   * terceiro ou exportação. `SourceView` não os expõe.
   */
  epgManualUrl?: string
  /** `url-tvg`/`x-tvg-url` do cabeçalho M3U; regravado (inclusive ausente) a cada importação. */
  epgDeclaredUrl?: string
  /** Deslocamento manual −12…+12; ausente = 0. Aplicado só na leitura. */
  epgOffsetHours?: number
  epgDisabled?: boolean
  /** Última sincronização **bem-sucedida** — não avança em falha. */
  epgLastSyncAt?: number
  epgLastErrorKind?: EpgErrorKind
  epgLastErrorAt?: number
  epgActiveGeneration?: number
  /** A última importação já capturou id de EPG dos canais (D-007). Ausente numa fonte sincronizada → migração única. */
  epgIdsCapturedAt?: number
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
  /**
   * Instante em que o item foi assistido até o fim (feature 012, D-007).
   * Ausente = nunca concluído. Persistente: reassistir e gravar progresso
   * de novo não apaga este campo — os dois convivem (retomada + selo).
   */
  completedAt?: number
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
  /**
   * Liga um episódio à sua série, ou identifica a própria série (feature
   * 012, D-001/D-002). Provedor: `series_id` do painel. M3U: sintético,
   * `m3u:<grupo>|<título-base normalizado>` (D-003) — nunca credencial.
   */
  seriesId?: string
  seasonNumber?: number
  episodeNumber?: number
  streamExtension?: string
  directUrl?: string
  /**
   * Instante da última obtenção dos episódios desta série (feature 012,
   * D-005). Só existe em registro `kind: 'series'` de categoria
   * `on_demand`; ausente = nunca obtida. Espelha `CategoryRecord.
   * itemsFetchedAt`, mas granular por série, não por categoria inteira.
   */
  episodesFetchedAt?: number
  /**
   * Capa/logo declarada pela própria fonte (feature 015, D-001/D-002 do
   * plan.md, para filme/série) — Xtream `stream_icon`/`cover`, ou
   * `tvg-logo` do M3U. Feature 024 (R-003): também para `kind: 'channel'`
   * — a exclusão original era de escopo, não técnica. `undefined` = fonte
   * não declarou, ou registro gravado antes da feature que passou a
   * capturar aquele `kind`. Campo de valor comum, sem índice — não exige
   * bump de versão do Dexie (D-009).
   */
  iconUrl?: string
  /**
   * Posição 0-based do item dentro da categoria, na ordem em que a fonte o
   * entregou (feature 024, `logic/numero-do-canal.md` §4). Gravada por
   * `storeCategoryItems`/`storeStoredCategory` (as duas funções que
   * escrevem uma categoria inteira de uma vez, na ordem recebida) para
   * todo `kind` — só a Live TV a lê, para o número de exibição do canal.
   * `undefined` = registro gravado antes desta feature.
   */
  categoryPosition?: number
  /**
   * Ano declarado pela fonte (feature 025, FR-049) — filme/série do
   * provedor. Campo de valor sem índice, sem bump de versão (mesmo padrão
   * de `iconUrl`). `undefined` = não declarado, ilegível, ou registro
   * gravado antes da feature.
   */
  year?: number
  /** Inclusão declarada pela fonte, epoch ms (feature 025) — só filme do provedor (`added`). */
  addedAt?: number
  /** Duração declarada pela fonte, em segundos (feature 025) — só episódio do provedor (`info.duration_secs`). */
  durationSeconds?: number
  /**
   * Id de EPG declarado pela fonte para o canal (feature 030, FR-006/FR-008):
   * `epg_channel_id` (Xtream) ou `tvg-id` (M3U), já com `trim()`. Só
   * `kind: 'channel'`. `undefined` = não declarado, ou registro gravado antes
   * desta feature — nunca casado por nome. Valor sem índice, sem bump.
   */
  epgChannelId?: string
  /**
   * Sinopse do episódio declarada pelo provedor (feature 032, FR-028) —
   * `info.plot` de `get_series_info`, gravada junto com o episódio. Só
   * `kind: 'episode'`. Valor sem índice, sem bump. `undefined` = não declarada
   * ou episódio gravado antes desta feature.
   */
  synopsis?: string
}

/**
 * Um programa da programação guardada (feature 030, `data-model.md` §2).
 * Horários em epoch ms como o XMLTV declarou (fuso já resolvido); o
 * deslocamento manual da fonte só é aplicado na leitura.
 */
export interface EpgProgramRecord {
  id?: number
  sourceId: string
  generation: number
  /** `<programme channel="…">`, comparado por igualdade exata. Nunca vazio. */
  channelKey: string
  start: number
  end: number
  title: string
  description?: string
}

/** As três seções que o painel expõe por categoria (feature 010). */
/**
 * Campos descritivos de um filme/série (feature 032, `data-model.md` §3) —
 * o mesmo formato para o que o provedor declarou e para o que o TMDB devolveu.
 * Todos opcionais: ausente = nenhuma fonte tem valor real, nunca um texto de
 * preenchimento.
 */
export interface TitleFields {
  synopsis?: string
  /** Só presente quando a sinopse NÃO está em português (código ISO 639-1) — FR-021. */
  synopsisLanguage?: string
  backdropUrl?: string
  genres?: string
  durationSeconds?: number
  director?: string
  country?: string
  cast?: string
}

export type TmdbResultRecord =
  | { status: 'matched'; tmdbId: number; fields: TitleFields }
  | { status: 'no_match' }
  | { status: 'dead_id'; tmdbId: number }

/**
 * Cache de metadata por título (feature 032, `data-model.md` §1). Chave =
 * `stableId` (nunca URL); sobrevive a nova geração e é apagada com a fonte.
 */
export interface TitleMetadataRecord {
  stableId: string
  sourceId: string
  kind: 'movie' | 'series'
  provider?: TitleFields
  /** Última obtenção bem-sucedida do provedor — falha não avança. */
  providerFetchedAt?: number
  /** `info.tmdb_id` do `get_vod_info` — só filme (o painel não declara para série). */
  providerTmdbId?: number
  tmdb?: TmdbResultRecord
  tmdbFetchedAt?: number
}

export type IntegrationState = 'connected' | 'refused' | 'offline' | 'rate_limited'

/**
 * Chave BYOK de um serviço de terceiro (constitution 1.6.0, feature 032).
 * **Segredo**: só `lib/metadata/tmdbKeyRepository.ts` e `tmdbConnector.ts`
 * leem `key`; nunca em log, estado de tela, erro, exportação ou requisição a
 * outro host que não o do próprio serviço.
 */
export interface IntegrationRecord {
  id: 'tmdb'
  key: string
  format: 'v3' | 'v4'
  state: IntegrationState
  lastTestedAt: number
  /** Depois de `429`: nenhuma chamada até este instante. */
  pausedUntil?: number
}

export type CategoryKind = 'channel' | 'movie' | 'series'

/** Como os itens de uma categoria chegam (data-model.md §2.1). */
export type CatalogFetchMode =
  | 'on_demand' // Provedor pelo protocolo JSON — itens buscados por categoria, ao abri-la.
  | 'eager' // Legado: fonte M3U importada antes da feature 014 — itens já vieram inteiros na importação. Só leitura.
  | 'stored' // Feature 014: conteúdo guardado no aparelho, separado por categoria — itens lidos ao entrar.

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

/**
 * Um registro de `CatalogRecord` como fica guardado em `storedEntries`
 * (feature 014) — os mesmos campos, exceto os que só existem depois da
 * leitura da categoria (`id`, `sourceId`, `generation`, `categoryId`).
 */
export type StoredCatalogRecord = Omit<CatalogRecord, 'id' | 'sourceId' | 'generation' | 'categoryId'>

/**
 * Um bloco do conteúdo M3U guardado no aparelho (feature 014, D-004/D-005).
 *
 * Existe só no caminho do arquivo guardado (`fetchMode: 'stored'`): a
 * importação guarda o conteúdo já classificado e separado por categoria —
 * nunca o texto bruto —, em blocos por causa do teto de memória em buffer
 * (`STORED_FLUSH_THRESHOLD`). Ler uma categoria concatena todos os blocos
 * dela, na ordem de `chunk`, grava os itens em `channels` e apaga os
 * blocos — depois disso a categoria nunca mais é lida daqui na mesma
 * geração (D-007).
 */
export interface StoredEntriesRecord {
  id?: number
  sourceId: string
  generation: number
  /** Id local da categoria (`categories.id`) dona destes registros. */
  categoryId: number
  /** Ordem de gravação do bloco — a leitura concatena na ordem crescente. */
  chunk: number
  records: StoredCatalogRecord[]
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
  /** Sem espaço para guardar o conteúdo (feature 014, D-009). */
  | 'storage_full'

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
  storedEntries!: EntityTable<StoredEntriesRecord, 'id'>
  epgPrograms!: EntityTable<EpgProgramRecord, 'id'>
  titleMetadata!: EntityTable<TitleMetadataRecord, 'stableId'>
  integrations!: EntityTable<IntegrationRecord, 'id'>

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
    // v8 (feature 012): índice novo para localizar os episódios de uma
    // série (ou a própria série) por [sourceId+generation+seriesId], sem
    // varrer `channels` inteira. Sem `.upgrade()` de propósito — registro
    // existente sem `seriesId` simplesmente não entra no índice (parte
    // `undefined` de um índice composto do IndexedDB não indexa a linha), e
    // episódio M3U gravado antes desta feature não tem `seriesId` pra
    // religar por aproximação (`data-model.md` §1): a fonte precisa
    // re-sincronizar pra ganhar o agrupamento.
    this.version(8).stores({
      channels:
        '++id, [sourceId+generation], [sourceId+generation+groupOrder], ' +
        '[sourceId+generation+kind+groupOrder], [sourceId+generation+seriesId]',
    })
    // v9 (feature 013): índice novo para resolver um favorito de provedor
    // (guardado só como stableId, nunca como id local — sdd/specs/
    // 013-favoritos/logic/resolucao-favoritos.md) no registro da geração
    // ativa, por [sourceId+generation+kind+providerStreamId], sem varrer
    // `channels`. `kind` entra porque o `stream_id` do Xtream não é único
    // entre live/VOD/série. Sem `.upgrade()`: é só índice, o Dexie o
    // constrói sobre os registros existentes na abertura. Registro sem
    // `providerStreamId` (toda entrada de fonte M3U) não entra no índice
    // composto — a importação M3U grande, que é o caminho de escrita que
    // importa, não paga nada por isto (data-model.md §2).
    this.version(9).stores({
      channels:
        '++id, [sourceId+generation], [sourceId+generation+groupOrder], ' +
        '[sourceId+generation+kind+groupOrder], [sourceId+generation+seriesId], ' +
        '[sourceId+generation+kind+providerStreamId]',
    })
    // v10 (feature 014): `storedEntries` guarda o conteúdo M3U já
    // classificado e separado por categoria, para a importação por URL
    // M3U concluir sem gravar item em `channels` (o que antes fazia dela
    // ser eager). `[sourceId+generation]` é o eixo de descarte por geração
    // (publicação/descarte/remoção da fonte, mesmo padrão de `categories`);
    // `[sourceId+generation+categoryId+chunk]` é o eixo de leitura — os
    // blocos de uma categoria, na ordem em que foram gravados. Sem
    // `.upgrade()`: fonte M3U importada antes desta feature continua
    // `eager`, só leitura, até re-sincronizar (D-012) — não há dado velho
    // para migrar para uma tabela que não existia.
    this.version(10).stores({
      storedEntries: '++id, [sourceId+generation], [sourceId+generation+categoryId+chunk]',
    })
    // v11 (feature 030): programação de EPG por fonte. `[sourceId+generation]`
    // é o eixo de descarte/substituição por geração; o composto com
    // `channelKey+start` é o de leitura por canal, já em ordem de início.
    // Sem `.upgrade()`: tabela nova. Os campos novos em `sources`/`channels`
    // são de valor, sem índice.
    this.version(11).stores({
      epgPrograms: '++id, [sourceId+generation], [sourceId+generation+channelKey+start]',
    })
    // v12 (feature 032): metadata descritiva por título e chave BYOK.
    // `titleMetadata` é chaveada por `stableId` (fonte+tipo+id estável — nunca
    // URL) e por isso NÃO depende de geração: um resync não a invalida.
    // `sourceId` é o eixo de descarte quando a fonte é removida.
    // `integrations` é uma linha por serviço (hoje só `tmdb`). Sem
    // `.upgrade()`: tabelas novas, não há dado antigo a converter.
    this.version(12).stores({
      titleMetadata: 'stableId, sourceId',
      integrations: 'id',
    })
  }
}

export const db = new CatalogDb()
