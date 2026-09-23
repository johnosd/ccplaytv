/**
 * Porta de `api/app/services/provider_connector.py` para o aparelho.
 *
 * Duas diferenças estruturais em relação ao original, ambas consequência
 * de rodar no navegador da TV em vez de num servidor:
 *
 * 1. **Não há guardião anti-SSRF.** SSRF é a ameaça de enganar um
 *    servidor para ele sondar a própria rede interna. Quando quem faz a
 *    requisição é o navegador do próprio usuário, essa ameaça não se
 *    aplica da mesma forma — ele já alcança a própria rede.
 * 2. **CORS entra no lugar.** O navegador recusa ler a resposta de um
 *    painel que não autorize origem cruzada, e reporta isso como uma
 *    falha genérica — indistinguível de "sem rede". Distinguir os dois é
 *    requisito (FR-011), então existe aqui a sondagem de `no-cors`
 *    descrita em `probeFailureKind`.
 */

import { classifyEntry, type ClassifiedEntry } from './classifier'

/** TS quando a conta permite mais de um formato — o que reproduziu na TV de referência. */
const PREFERRED_FORMAT = 'ts'

/** Nem todo painel responde à primeira forma (contracts/provider-protocol.md §2). */
const ACCOUNT_STATUS_ACTIONS: readonly (string | null)[] = ['get_account_info', null, 'get_profile']

const LEGACY_SUFFIXES = ['/player_api.php', '/panel_api.php', '/get.php']

export type ProviderFailureKind =
  | 'invalid_credentials'
  | 'subscription_expired'
  | 'direct_connection_refused'
  | 'network_failure'

export class ProviderError extends Error {
  kind: ProviderFailureKind
  constructor(kind: ProviderFailureKind, message: string) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
  }
}

/** Endereço inválido ou painel que não fala o protocolo — quem chama decide o fallback M3U. */
export class ProviderIncompatibleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderIncompatibleError'
  }
}

/**
 * Reduz qualquer forma comum à base normalizada, preservando subpath.
 * Recusa credencial embutida no endereço: ela vive nos campos próprios da
 * fonte, nunca na URL guardada (FR-003).
 */
export function normalizeServerAddress(raw: string): string {
  const value = raw.trim()
  if (value === '') throw new ProviderIncompatibleError('Endereço do servidor vazio.')

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) ? value : `http://${value}`

  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    throw new ProviderIncompatibleError('Endereço do servidor inválido.')
  }

  if (parsed.username !== '' || parsed.password !== '') {
    throw new ProviderIncompatibleError(
      'O endereço do servidor não deve conter usuário ou senha embutidos.',
    )
  }
  if (parsed.hostname === '') throw new ProviderIncompatibleError('Endereço do servidor sem host.')

  let path = parsed.pathname
  for (const suffix of LEGACY_SUFFIXES) {
    if (path.endsWith(suffix)) {
      path = path.slice(0, -suffix.length)
      break
    }
  }
  path = path.replace(/\/+$/, '')

  // Esquema preservado como informado — nunca forçamos HTTPS nem
  // desativamos validação de TLS (ADR-004 §8).
  return `${parsed.protocol}//${parsed.host}${path}`
}

export function playerApiUrl(
  base: string,
  username: string,
  password: string,
  params?: Record<string, string>,
): string {
  const query = new URLSearchParams({ username, password, ...(params ?? {}) })
  return `${base}/player_api.php?${query.toString()}`
}

export function legacyM3uUrl(base: string, username: string, password: string): string {
  const query = new URLSearchParams({
    username,
    password,
    type: 'm3u_plus',
    output: 'm3u8',
  })
  return `${base}/get.php?${query.toString()}`
}

/**
 * Descobre por que um `fetch` falhou, já que o navegador não conta.
 *
 * Uma falha de CORS e uma falha de rede chegam ao JavaScript do mesmo
 * jeito. A sondagem em `no-cors` separa as duas: se ela resolve (ainda que
 * com resposta opaca, ilegível), a rede alcançou o servidor e o que
 * bloqueou foi a política de origem cruzada. Se falha também, o problema
 * é de rede de verdade.
 */
export async function probeFailureKind(url: string): Promise<ProviderFailureKind> {
  try {
    await fetch(url, { mode: 'no-cors' })
    return 'direct_connection_refused'
  } catch {
    return 'network_failure'
  }
}

async function fetchJsonDirect(url: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { headers: { 'User-Agent': 'VLC/3.0.0' } })
  } catch {
    throw new ProviderError(
      await probeFailureKind(url),
      'Não foi possível falar com o provedor a partir deste aparelho.',
    )
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderError('invalid_credentials', 'O provedor recusou as credenciais.')
  }
  if (!response.ok) {
    // Status inesperado: o endpoint pode não existir nesta forma. Quem
    // chama decide se tenta a próxima ação ou cai no fallback.
    throw new ProviderIncompatibleError(`Provedor respondeu com status ${response.status}.`)
  }
  return response.json()
}

function interpretAuth(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') return ['1', 'true'].includes(value.trim().toLowerCase())
  return false // desconhecido nunca vira acesso por omissão
}

function isExpired(raw: unknown, now: number = Date.now()): boolean {
  if (raw === null || raw === undefined || raw === '' || raw === '0' || raw === 0) return false
  const timestamp = Number(raw)
  if (!Number.isFinite(timestamp)) return false
  return timestamp * 1000 < now
}

export interface AccountStatus {
  authorized: boolean
  expired: boolean
  /** `undefined` = a conta não declarou formatos — nunca assumir um. */
  allowedFormats?: string[]
}

/**
 * Tenta as formas de consulta em ordem e devolve a primeira utilizável.
 *
 * Credencial recusada (401/403) interrompe na hora: o endpoint existe e
 * respondeu negando, então cair no fallback M3U com a mesma credencial só
 * repetiria a recusa — e exporia a senha num caminho a mais.
 */
export async function resolveAccountStatus(
  base: string,
  username: string,
  password: string,
  now: number = Date.now(),
): Promise<AccountStatus> {
  let lastFailure: ProviderError | undefined

  for (const action of ACCOUNT_STATUS_ACTIONS) {
    const url = playerApiUrl(base, username, password, action ? { action } : undefined)
    let payload: unknown
    try {
      payload = await fetchJsonDirect(url)
    } catch (error) {
      if (error instanceof ProviderError) {
        if (error.kind === 'invalid_credentials') throw error
        lastFailure = error
      }
      continue // incompatível nesta forma — tenta a próxima
    }

    const userInfo =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>).user_info
        : undefined
    if (typeof userInfo !== 'object' || userInfo === null) continue

    const info = userInfo as Record<string, unknown>
    const formats = info.allowed_output_formats
    return {
      authorized: interpretAuth(info.auth),
      expired: isExpired(info.exp_date, now),
      allowedFormats: Array.isArray(formats) ? formats.map(String) : undefined,
    }
  }

  // Todas as tentativas falharam por conexão: o problema é alcançar o
  // painel, não o protocolo — e essa distinção é o que a US5 mostra.
  if (lastFailure) throw lastFailure
  throw new ProviderIncompatibleError('Painel não respondeu ao protocolo esperado.')
}

/** TS se permitido; senão o primeiro permitido; `undefined` se a conta não declarou nenhum. */
export function preferredFormat(allowed: string[] | undefined): string | undefined {
  if (!allowed || allowed.length === 0) return undefined
  const normalized = allowed.map((format) => String(format).trim().toLowerCase()).filter(Boolean)
  if (normalized.length === 0) return undefined
  return normalized.includes(PREFERRED_FORMAT) ? PREFERRED_FORMAT : normalized[0]
}

export function buildLiveUrl(
  base: string,
  username: string,
  password: string,
  streamId: string,
  format: string,
): string {
  return `${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${format}`
}

async function fetchListDirect(url: string): Promise<unknown[]> {
  const payload = await fetchJsonDirect(url)
  return Array.isArray(payload) ? payload : []
}

export interface LiveCategory {
  id: string
  name: string
  /** Posição na ordem declarada pelo provedor — preserva ordem sem reordenar por texto. */
  order: number
}

export async function fetchLiveCategories(
  base: string,
  username: string,
  password: string,
): Promise<LiveCategory[]> {
  const raw = await fetchListDirect(
    playerApiUrl(base, username, password, { action: 'get_live_categories' }),
  )
  const categories: LiveCategory[] = []
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) return
    const record = item as Record<string, unknown>
    if (record.category_id === undefined || record.category_id === null) return
    categories.push({
      id: String(record.category_id),
      // Nome vazio é preservado como o provedor declarou, nunca trocado
      // por rótulo externo.
      name: typeof record.category_name === 'string' ? record.category_name : '',
      order: index,
    })
  })
  return categories
}

export async function fetchLiveStreams(
  base: string,
  username: string,
  password: string,
): Promise<unknown[]> {
  return fetchListDirect(playerApiUrl(base, username, password, { action: 'get_live_streams' }))
}

export interface MappedChannel extends ClassifiedEntry {
  groupOrder: number
}

/**
 * Converte a resposta do painel na mesma forma que o caminho M3U produz
 * (D-001 da feature 004: os dois conectores entregam a mesma coisa).
 *
 * Canal sem nome utilizável é descartado — não se inventa nome. Canal cuja
 * categoria não está na lista continua acessível, sem vínculo forjado.
 */
export function mapLiveEntry(
  raw: Record<string, unknown>,
  categories: Map<string, LiveCategory>,
  buildUrl: (streamId: string) => string | undefined,
): MappedChannel | undefined {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name === '') return undefined

  const streamId =
    raw.stream_id === undefined || raw.stream_id === null ? undefined : String(raw.stream_id)
  const categoryId =
    raw.category_id === undefined || raw.category_id === null ? undefined : String(raw.category_id)
  const category = categoryId ? categories.get(categoryId) : undefined

  return {
    kind: 'channel',
    name,
    originalName: name,
    group: category?.name,
    groupOrder: category?.order ?? Number.MAX_SAFE_INTEGER,
    url: streamId ? buildUrl(streamId) : undefined,
    providerStreamId: streamId,
    providerCategoryId: categoryId,
  }
}

export interface XtreamChannelsResult {
  channels: MappedChannel[]
  allowedFormats?: string[]
}

/** Caminho principal: canais ao vivo pelo protocolo JSON. */
export async function acquireXtreamChannels(
  base: string,
  username: string,
  password: string,
  status: AccountStatus,
): Promise<XtreamChannelsResult> {
  const categoryList = await fetchLiveCategories(base, username, password)
  const categories = new Map(categoryList.map((category) => [category.id, category]))
  const streams = await fetchLiveStreams(base, username, password)

  const format = preferredFormat(status.allowedFormats)
  const buildUrl = (streamId: string): string | undefined =>
    format === undefined ? undefined : buildLiveUrl(base, username, password, streamId, format)

  const channels: MappedChannel[] = []
  for (const raw of streams) {
    if (typeof raw !== 'object' || raw === null) continue
    const mapped = mapLiveEntry(raw as Record<string, unknown>, categories, buildUrl)
    if (mapped) channels.push(mapped)
  }

  return { channels, allowedFormats: status.allowedFormats }
}

/**
 * Classifica uma entrada de M3U mantendo a ordem de categoria pela ordem
 * de aparição — é o equivalente, no caminho M3U, ao índice que o painel
 * entrega explicitamente.
 */
export function classifyWithGroupOrder(
  entry: Parameters<typeof classifyEntry>[0],
  groupOrders: Map<string, number>,
): MappedChannel {
  const classified = classifyEntry(entry)
  const group = classified.group ?? ''
  if (!groupOrders.has(group)) groupOrders.set(group, groupOrders.size)
  return { ...classified, groupOrder: groupOrders.get(group) as number }
}


export async function fetchVodCategories(base: string, username: string, password: string): Promise<LiveCategory[]> {
  const raw = await fetchListDirect(playerApiUrl(base, username, password, { action: 'get_vod_categories' }))
  const categories: LiveCategory[] = []
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) return
    const record = item as Record<string, unknown>
    if (record.category_id === undefined || record.category_id === null) return
    categories.push({
      id: String(record.category_id),
      name: typeof record.category_name === 'string' ? record.category_name : '',
      order: index,
    })
  })
  return categories
}

export async function fetchVodStreams(base: string, username: string, password: string): Promise<unknown[]> {
  return fetchListDirect(playerApiUrl(base, username, password, { action: 'get_vod_streams' }))
}

export function buildVodUrl(base: string, username: string, password: string, streamId: string, extension: string): string {
  return `${base}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${extension}`
}

export function mapVodEntry(
  raw: Record<string, unknown>,
  categories: Map<string, LiveCategory>,
  buildUrl: (streamId: string, extension: string) => string | undefined,
): MappedChannel | undefined {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name === '') return undefined

  if (typeof raw.stream_type === 'string' && raw.stream_type !== 'live') return undefined
  const streamId = raw.stream_id === undefined || raw.stream_id === null ? undefined : String(raw.stream_id)
  const categoryId = raw.category_id === undefined || raw.category_id === null ? undefined : String(raw.category_id)
  const category = categoryId ? categories.get(categoryId) : undefined
  const ext = typeof raw.container_extension === 'string' ? raw.container_extension : 'mp4'
  if (typeof raw.stream_type === 'string' && raw.stream_type !== 'movie') return undefined

  return {
    kind: 'movie',
    name,
    originalName: name,
    group: category?.name,
    groupOrder: category?.order ?? Number.MAX_SAFE_INTEGER,
    url: streamId ? buildUrl(streamId, ext) : undefined,
    providerStreamId: streamId,
    providerCategoryId: categoryId,
    streamExtension: ext,
  }
}

export async function acquireXtreamVod(
  base: string,
  username: string,
  password: string,
): Promise<MappedChannel[]> {
  const categoryList = await fetchVodCategories(base, username, password)
  const categories = new Map(categoryList.map((category) => [category.id, category]))
  const streams = await fetchVodStreams(base, username, password)

  const buildUrl = (streamId: string, ext: string): string => buildVodUrl(base, username, password, streamId, ext)

  const vods: MappedChannel[] = []
  for (const raw of streams) {
    if (typeof raw !== 'object' || raw === null) continue
    const mapped = mapVodEntry(raw as Record<string, unknown>, categories, buildUrl)
    if (mapped) vods.push(mapped)
  }
  return vods
}

export async function fetchSeriesCategories(base: string, username: string, password: string): Promise<LiveCategory[]> {
  const raw = await fetchListDirect(playerApiUrl(base, username, password, { action: 'get_series_categories' }))
  const categories: LiveCategory[] = []
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) return
    const record = item as Record<string, unknown>
    if (record.category_id === undefined || record.category_id === null) return
    categories.push({
      id: String(record.category_id),
      name: typeof record.category_name === 'string' ? record.category_name : '',
      order: index,
    })
  })
  return categories
}

export async function fetchSeries(base: string, username: string, password: string): Promise<unknown[]> {
  return fetchListDirect(playerApiUrl(base, username, password, { action: 'get_series' }))
}

export function mapSeriesEntry(
  raw: Record<string, unknown>,
  categories: Map<string, LiveCategory>
): MappedChannel | undefined {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name === '') return undefined

  const seriesId = raw.series_id === undefined || raw.series_id === null ? undefined : String(raw.series_id)
  if (!seriesId) return undefined

  const categoryId = raw.category_id === undefined || raw.category_id === null ? undefined : String(raw.category_id)
  const category = categoryId ? categories.get(categoryId) : undefined

  return {
    kind: 'series',
    name,
    originalName: name,
    group: category?.name,
    groupOrder: category?.order ?? Number.MAX_SAFE_INTEGER,
    providerCategoryId: categoryId,
    seriesId,
  }
}

export async function acquireXtreamSeries(
  base: string,
  username: string,
  password: string,
): Promise<MappedChannel[]> {
  const categoryList = await fetchSeriesCategories(base, username, password)
  const categories = new Map(categoryList.map((category) => [category.id, category]))
  const streams = await fetchSeries(base, username, password)

  const series: MappedChannel[] = []
  for (const raw of streams) {
    if (typeof raw !== 'object' || raw === null) continue
    const mapped = mapSeriesEntry(raw as Record<string, unknown>, categories)
    if (mapped) series.push(mapped)
  }
  return series
}

export interface XtreamEpisode extends MappedChannel {
  seasonNumber: number
  episodeNumber: number
  seriesId: string
}

export async function fetchSeriesInfo(
  base: string,
  username: string,
  password: string,
  seriesId: string
): Promise<XtreamEpisode[]> {
  const url = playerApiUrl(base, username, password, { action: 'get_series_info', series_id: seriesId })
  const payload = await fetchJsonDirect(url)
  if (typeof payload !== 'object' || payload === null) return []
  
  const record = payload as Record<string, unknown>
  const episodesObj = record.episodes
  if (typeof episodesObj !== 'object' || episodesObj === null) return []

  const episodes: XtreamEpisode[] = []
  for (const [seasonStr, epsArray] of Object.entries(episodesObj)) {
    if (!Array.isArray(epsArray)) continue
    
    for (const ep of epsArray) {
      if (typeof ep !== 'object' || ep === null) continue
      const rawEp = ep as Record<string, unknown>
      
      const epName = typeof rawEp.title === 'string' ? rawEp.title.trim() : `S${seasonStr} E${rawEp.episode_num}`
      const streamId = rawEp.id === undefined || rawEp.id === null ? undefined : String(rawEp.id)
      const ext = typeof rawEp.container_extension === 'string' ? rawEp.container_extension : 'mp4'
      const urlBuilt = streamId ? `${base}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${ext}` : undefined

      const seasonNumber = parseInt(seasonStr, 10) || 1
      const episodeNumber = typeof rawEp.episode_num === 'number' ? rawEp.episode_num : 0

      episodes.push({
        kind: 'episode',
        name: epName,
        originalName: typeof rawEp.title === 'string' ? rawEp.title : '',
        groupOrder: Number.MAX_SAFE_INTEGER,
        providerStreamId: streamId,
        streamExtension: ext,
        url: urlBuilt,
        seriesId,
        seasonNumber,
        episodeNumber
      })
    }
  }
  return episodes
}
