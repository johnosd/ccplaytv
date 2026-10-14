import type { SourceOut } from '../import/importApi'
import { describeAccount } from '../../lib/catalog/sourceAccount'
import type { CatalogSection } from '../../lib/catalog/db'
import { APP_LANGUAGE_LOCALE } from '../../lib/i18n/languages'
import { createTranslator, type Translator } from '../../lib/i18n/translate'
import type { CatalogCounts } from '../catalog/catalogApi'

/**
 * Formatação de exibição de uma lista (fonte), compartilhada entre a tela de
 * perfis e Configurações › Fontes IPTV (feature 026, D-007) — extraído de
 * `ProfilesScreen.tsx` sem mudar comportamento. Os textos e formatos seguem o
 * idioma do app (feature 054): `t` omitido = português.
 */

/**
 * Estado de sincronização da lista na linha de Configurações. `syncing` vem do
 * executor (store em memória, feature 034, FR-015) — "Sincronizando" nunca está
 * no disco. Credencial recusada e assinatura vencida dizem o motivo (FR-016) em
 * vez do "Erro" genérico; só fonte Xtream tem conta (FR-022).
 */
export function formatStatus(
  source: SourceOut,
  { syncing = false }: { syncing?: boolean } = {},
  t: Translator = createTranslator('pt'),
): string {
  if (syncing) return t('src.status.syncing')
  const account = source.provider_import_mode === 'xtream_api' ? describeAccount(source.account, Date.now(), t) : undefined
  if (account?.kind === 'refused') return t('src.status.refused')
  if (source.connection_state === 'error' && account?.kind === 'expired') return t('src.status.expired')
  if (source.connection_state === 'error') return t('src.status.error')
  if (source.connection_state === 'never_synced' || !source.last_successful_sync_at) {
    return t('src.status.never')
  }
  return t('src.status.syncedAt', {
    when: new Date(source.last_successful_sync_at).toLocaleString(APP_LANGUAGE_LOCALE[t.language]),
  })
}

/**
 * Estado do EPG da lista para a linha de Configurações (feature 030, FR-015),
 * só com dado real: nunca o endereço, nunca a credencial. `syncing` vem do
 * executor — "Sincronizando EPG" não existe no disco.
 */
export function formatEpgStatus(source: SourceOut, syncing: boolean, t: Translator = createTranslator('pt')): string {
  if (syncing) return t('src.epg.syncing')
  const epg = source.epg
  switch (epg?.state) {
    case 'disabled':
      return t('src.epg.disabled')
    case 'error':
      return t('src.epg.error')
    case 'linked':
      return epg.lastSyncAt
        ? t('src.epg.linkedAt', {
            when: new Date(epg.lastSyncAt).toLocaleString(APP_LANGUAGE_LOCALE[t.language], {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }),
          })
        : t('src.epg.linked')
    case 'never_synced':
      return t('src.epg.never')
    default:
      return t('src.epg.notConfigured')
  }
}

/** Tipo da lista para o cartão (FR-002). Nunca o endereço nem a credencial (FR-048/FR-024). */
export function formatType(source: SourceOut, t: Translator = createTranslator('pt')): string {
  return source.type === 'provider_credentials' ? t('src.type.xtream') : t('src.type.m3u')
}

/**
 * Texto discreto da conta na linha de Configurações (feature 034, FR-005) —
 * só para fonte que fala o protocolo Xtream; M3U avulsa e Modo limitado não
 * declaram conta (FR-022). `undefined` = nada a mostrar.
 */
export function formatAccount(source: SourceOut, now: number, t: Translator = createTranslator('pt')): string | undefined {
  if (source.provider_import_mode !== 'xtream_api') return undefined
  return describeAccount(source.account, now, t).text
}

/** Aviso curto da lista: texto legível sempre — a cor nunca é o único sinal (FR-007). */
export interface AlertChip {
  tone: 'neutral' | 'warning' | 'error'
  label: string
}

/** O chip da conta (vence em breve, expirada, credencial inválida), ou `undefined`. Só Xtream. */
export function accountChipOf(source: SourceOut, now: number, t: Translator = createTranslator('pt')): AlertChip | undefined {
  if (source.provider_import_mode !== 'xtream_api') return undefined
  return describeAccount(source.account, now, t).chip
}

/**
 * Chips do cartão da lista (FR-006): só quando há algo a agir, na ordem do
 * `logic/conta-da-fonte.md` §6 — "Sincronizando" (estado em andamento, nunca
 * persistido), a conta, "Erro na última sincronização" (a menos que a conta
 * já explique a falha: credencial inválida ou conta expirada, FR-016) e
 * "Erro no EPG".
 */
export function sourceAlertChips(
  source: SourceOut,
  now: number,
  { syncing = false } = {},
  t: Translator = createTranslator('pt'),
): AlertChip[] {
  const chips: AlertChip[] = []
  if (syncing) chips.push({ tone: 'neutral', label: t('src.status.syncing') })
  const account = accountChipOf(source, now, t)
  if (account) chips.push(account)
  const accountKind = source.provider_import_mode === 'xtream_api' ? describeAccount(source.account, now, t).kind : undefined
  const accountExplainsFailure = accountKind === 'refused' || accountKind === 'expired'
  if (source.connection_state === 'error' && !accountExplainsFailure) {
    chips.push({ tone: 'error', label: t('src.status.error') })
  }
  if (source.epg?.state === 'error') chips.push({ tone: 'error', label: t('src.epg.errorChip') })
  return chips
}

const COUNT_KINDS = [
  { key: 'channels', section: null, items: 'src.count.channels', categories: 'src.count.channelCats', short: 'src.count.channelShort' },
  { key: 'movies', section: 'movie', items: 'src.count.movies', categories: 'src.count.movieCats', short: 'src.count.movieShort' },
  { key: 'series', section: 'series', items: 'src.count.series', categories: 'src.count.seriesCats', short: 'src.count.seriesShort' },
] as const

/**
 * Contagem conhecida da lista, na linha de Configurações (feature 034, FR-017/
 * FR-018, `logic/conta-da-fonte.md` §6) — só com dado real, **nunca "0"**:
 * tipo sem categoria declarada é omitido; seção que não respondeu na última
 * sincronização diz "não obtidos". Total de itens (M3U guardada) ganha do
 * número de categorias. Quando todas as partes contadas são de categorias, as
 * seguintes à primeira encurtam: "41 categorias de canais · 20 de filmes ·
 * 30 de séries". `undefined` = nada a mostrar.
 */
export function formatCounts(
  counts: CatalogCounts,
  unavailable: readonly CatalogSection[] = [],
  t: Translator = createTranslator('pt'),
): string | undefined {
  type Part = { text: string; counted: 'items' | 'categories' | null; short?: string }
  const parts: Part[] = []
  for (const kind of COUNT_KINDS) {
    const count = counts[kind.key]
    if (kind.section !== null && unavailable.includes(kind.section)) {
      parts.push({ text: t(kind.section === 'movie' ? 'src.count.notObtainedMovie' : 'src.count.notObtainedSeries'), counted: null })
    } else if (count.items !== undefined) {
      parts.push({ text: t.plural(kind.items, count.items), counted: 'items' })
    } else if (count.categories > 0) {
      parts.push({
        text: t.plural(kind.categories, count.categories),
        counted: 'categories',
        short: t(kind.short, { n: count.categories }),
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
