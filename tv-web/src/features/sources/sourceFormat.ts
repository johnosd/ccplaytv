import type { SourceOut } from '../import/importApi'
import { describeAccount } from '../../lib/catalog/sourceAccount'
import type { CatalogSection } from '../../lib/catalog/db'
import type { CatalogCounts } from '../catalog/catalogApi'

/**
 * Formatação de exibição de uma lista (fonte), compartilhada entre a tela de
 * perfis e Configurações › Fontes IPTV (feature 026, D-007) — extraído de
 * `ProfilesScreen.tsx` sem mudar comportamento.
 */

/**
 * Estado de sincronização da lista na linha de Configurações. `syncing` vem do
 * executor (store em memória, feature 034, FR-015) — "Sincronizando" nunca está
 * no disco. Credencial recusada e assinatura vencida dizem o motivo (FR-016) em
 * vez do "Erro" genérico; só fonte Xtream tem conta (FR-022).
 */
export function formatStatus(source: SourceOut, { syncing = false }: { syncing?: boolean } = {}): string {
  if (syncing) return 'Sincronizando'
  const account = source.provider_import_mode === 'xtream_api' ? describeAccount(source.account, Date.now()) : undefined
  if (account?.kind === 'refused') return 'Credencial inválida'
  if (source.connection_state === 'error' && account?.kind === 'expired') return 'Conta expirada'
  if (source.connection_state === 'error') return 'Erro na última sincronização'
  if (source.connection_state === 'never_synced' || !source.last_successful_sync_at) {
    return 'Nunca sincronizada'
  }
  return `Sincronizada em ${new Date(source.last_successful_sync_at).toLocaleString('pt-BR')}`
}

/**
 * Estado do EPG da lista para a linha de Configurações (feature 030, FR-015),
 * só com dado real: nunca o endereço, nunca a credencial. `syncing` vem do
 * executor — "Sincronizando EPG" não existe no disco.
 */
export function formatEpgStatus(source: SourceOut, syncing: boolean): string {
  if (syncing) return 'Sincronizando EPG'
  const epg = source.epg
  switch (epg?.state) {
    case 'disabled':
      return 'EPG desativado'
    case 'error':
      return 'Erro no EPG · EPG-02'
    case 'linked':
      return epg.lastSyncAt
        ? `EPG vinculado · atualizado em ${new Date(epg.lastSyncAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}`
        : 'EPG vinculado'
    case 'never_synced':
      return 'EPG ainda não sincronizado'
    default:
      return 'EPG não configurado'
  }
}

/** Tipo da lista para o cartão (FR-002). Nunca o endereço nem a credencial (FR-048/FR-024). */
export function formatType(source: SourceOut): string {
  return source.type === 'provider_credentials' ? 'Xtream' : 'M3U'
}

/**
 * Texto discreto da conta na linha de Configurações (feature 034, FR-005) —
 * só para fonte que fala o protocolo Xtream; M3U avulsa e Modo limitado não
 * declaram conta (FR-022). `undefined` = nada a mostrar.
 */
export function formatAccount(source: SourceOut, now: number): string | undefined {
  if (source.provider_import_mode !== 'xtream_api') return undefined
  return describeAccount(source.account, now).text
}

/** Aviso curto da lista: texto legível sempre — a cor nunca é o único sinal (FR-007). */
export interface AlertChip {
  tone: 'neutral' | 'warning' | 'error'
  label: string
}

/** O chip da conta (vence em breve, expirada, credencial inválida), ou `undefined`. Só Xtream. */
export function accountChipOf(source: SourceOut, now: number): AlertChip | undefined {
  if (source.provider_import_mode !== 'xtream_api') return undefined
  return describeAccount(source.account, now).chip
}

/**
 * Chips do cartão da lista (FR-006): só quando há algo a agir, na ordem do
 * `logic/conta-da-fonte.md` §6 — "Sincronizando" (estado em andamento, nunca
 * persistido), a conta, "Erro na última sincronização" (a menos que a conta
 * já explique a falha: credencial inválida ou conta expirada, FR-016) e
 * "Erro no EPG".
 */
export function sourceAlertChips(source: SourceOut, now: number, { syncing = false } = {}): AlertChip[] {
  const chips: AlertChip[] = []
  if (syncing) chips.push({ tone: 'neutral', label: 'Sincronizando' })
  const account = accountChipOf(source, now)
  if (account) chips.push(account)
  const accountExplainsFailure = account?.label === 'Credencial inválida' || account?.label === 'Conta expirada'
  if (source.connection_state === 'error' && !accountExplainsFailure) {
    chips.push({ tone: 'error', label: 'Erro na última sincronização' })
  }
  if (source.epg?.state === 'error') chips.push({ tone: 'error', label: 'Erro no EPG' })
  return chips
}

const COUNT_KINDS = [
  { key: 'channels', section: null, items: ['canal', 'canais'], categories: ['categoria de canais', 'categorias de canais'], short: 'de canais' },
  { key: 'movies', section: 'movie', items: ['filme', 'filmes'], categories: ['categoria de filmes', 'categorias de filmes'], short: 'de filmes' },
  { key: 'series', section: 'series', items: ['série', 'séries'], categories: ['categoria de séries', 'categorias de séries'], short: 'de séries' },
] as const

const NOT_OBTAINED: Record<CatalogSection, string> = { movie: 'filmes não obtidos', series: 'séries não obtidas' }

const formatInteger = (n: number): string => n.toLocaleString('pt-BR')

/**
 * Contagem conhecida da lista, na linha de Configurações (feature 034, FR-017/
 * FR-018, `logic/conta-da-fonte.md` §6) — só com dado real, **nunca "0"**:
 * tipo sem categoria declarada é omitido; seção que não respondeu na última
 * sincronização diz "não obtidos". Total de itens (M3U guardada) ganha do
 * número de categorias. Quando todas as partes contadas são de categorias, as
 * seguintes à primeira encurtam: "41 categorias de canais · 20 de filmes ·
 * 30 de séries". `undefined` = nada a mostrar.
 */
export function formatCounts(counts: CatalogCounts, unavailable: readonly CatalogSection[] = []): string | undefined {
  type Part = { text: string; counted: 'items' | 'categories' | null; short?: string; n?: number }
  const parts: Part[] = []
  for (const kind of COUNT_KINDS) {
    const count = counts[kind.key]
    if (kind.section !== null && unavailable.includes(kind.section)) {
      parts.push({ text: NOT_OBTAINED[kind.section], counted: null })
    } else if (count.items !== undefined) {
      parts.push({ text: `${formatInteger(count.items)} ${kind.items[count.items === 1 ? 0 : 1]}`, counted: 'items' })
    } else if (count.categories > 0) {
      parts.push({
        text: `${formatInteger(count.categories)} ${kind.categories[count.categories === 1 ? 0 : 1]}`,
        counted: 'categories',
        short: `${formatInteger(count.categories)} ${kind.short}`,
      })
    }
  }
  if (parts.length === 0) return undefined
  const counted = parts.filter((part) => part.counted !== null)
  const allCategories = counted.length > 0 && counted.every((part) => part.counted === 'categories')
  const first = counted[0]
  return parts
    .map((part) => (allCategories && part.counted === 'categories' && part !== first ? (part.short as string) : part.text))
    .join(' · ')
}
