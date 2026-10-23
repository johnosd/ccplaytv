/**
 * Modelo do diálogo "Buscar legenda online" (feature 090, `logic/legenda-externa.md` §5.2) — puro, sem React nem rede.
 * Quem decide foco e desenha são o hook `useExternalSubtitles` e `PlayerSubtitleSearchPanel`. Foco por CHAVE, nunca
 * por índice: `lang:<idioma>`, `result:<id>`, `action:<ação>`, `status:loading`.
 */
import type { Translator } from '../../lib/i18n/translate'
import {
  SUBTITLE_LANGUAGES,
  type SubtitleErrorCode,
  type SubtitleLanguage,
  type SubtitleProvider,
  type SubtitleResult,
  type SubtitleSearchResponse,
} from '../../lib/subtitles/types'
import { subtitleLanguageName } from '../playerPanels'

export type SearchView =
  | { status: 'idle' }
  | { status: 'loading'; downloading: boolean }
  | { status: 'results'; results: SubtitleResult[]; byName: boolean; unavailable: SubtitleProvider[]; keyIssues?: KeyIssues }
  | { status: 'empty'; byName: boolean; unavailable: SubtitleProvider[]; keyIssues?: KeyIssues }
  | { status: 'error'; code: SubtitleErrorCode; retryAtMs?: number; results?: SubtitleResult[]; personal?: SubtitleProvider }

/** Chave PESSOAL recusada ou no limite, por fornecedor (BYOK, P3). */
export type KeyIssues = NonNullable<SubtitleSearchResponse['keyIssues']>

export type SearchAction = 'retry' | 'back' | 'chooseOther' | 'language' | 'useDefault'

export interface SearchRow {
  key: string
  label: string
  result?: SubtitleResult
  action?: SearchAction
  language?: SubtitleLanguage
}

export interface SearchPanelModel {
  languages: SearchRow[]
  /** Avisos acima da lista (busca por nome, fornecedor fora). */
  notes: string[]
  /** Mensagem do estado (vazio/erro), ou `null`. */
  message: string | null
  /** Linhas focáveis abaixo dos idiomas; nunca vazia (constitution: sem beco sem saída). */
  items: SearchRow[]
}

const SUBTITLE_PROVIDERS_ORDER: readonly SubtitleProvider[] = ['opensubtitles', 'subdl']
const PROVIDER_NAME: Record<SubtitleProvider, string> = { opensubtitles: 'OpenSubtitles', subdl: 'SubDL' }

function resultLabel(result: SubtitleResult, t: Translator): string {
  const parts = [result.release || PROVIDER_NAME[result.provider], PROVIDER_NAME[result.provider]]
  if (result.downloads !== undefined) parts.push(t.plural('subtitles.downloads', result.downloads))
  if (result.seasonPack) parts.push(t('subtitles.seasonPack'))
  if (result.hearingImpaired) parts.push(t('subtitles.hearingImpaired'))
  return parts.join(' • ')
}

function errorMessage(code: SubtitleErrorCode, retryAtMs: number | undefined, t: Translator, formatTime: (ms: number) => string) {
  switch (code) {
    case 'not_entitled':
      return t('subtitles.error.notEntitled')
    case 'device_limit':
      return retryAtMs ? t('subtitles.error.deviceLimit', { time: formatTime(retryAtMs) }) : t('subtitles.error.deviceLimitSoon')
    case 'provider_limit':
      return t('subtitles.error.providerLimit')
    case 'key_rejected':
      return t('subtitles.error.keyRejected')
    case 'unreadable':
      return t('subtitles.error.unreadable')
    default:
      return t('subtitles.error.offline')
  }
}

export function buildSearchPanel(
  view: SearchView,
  language: SubtitleLanguage,
  t: Translator,
  formatTime: (ms: number) => string,
  /** Há "padrão do ccplayTv" a oferecer no lugar de uma chave pessoal que falhou (BYOK). */
  canUseDefault = false,
): SearchPanelModel {
  const languages = SUBTITLE_LANGUAGES.map((code) => ({ key: `lang:${code}`, label: subtitleLanguageName(code, t), language: code }))
  const notes: string[] = []
  if ((view.status === 'results' || view.status === 'empty') && view.byName) notes.push(t('subtitles.byName'))
  if (view.status === 'results' || view.status === 'empty') {
    for (const provider of view.unavailable) notes.push(t('subtitles.providerDown', { provider: PROVIDER_NAME[provider] }))
  }

  const useDefault: SearchRow[] = canUseDefault ? [{ key: 'action:useDefault', label: t('subtitles.useDefault'), action: 'useDefault' }] : []
  if ((view.status === 'results' || view.status === 'empty') && view.keyIssues) {
    for (const provider of SUBTITLE_PROVIDERS_ORDER) {
      const issue = view.keyIssues[provider]
      if (issue) notes.push(t(issue === 'rejected' ? 'subtitles.keyRejected' : 'subtitles.keyLimit', { provider: PROVIDER_NAME[provider] }))
    }
  }
  const hasKeyIssue = (view.status === 'results' || view.status === 'empty') && view.keyIssues !== undefined && Object.keys(view.keyIssues).length > 0

  if (view.status === 'results') {
    return {
      languages,
      notes,
      message: null,
      items: [
        ...view.results.map((result) => ({ key: `result:${result.id}`, label: resultLabel(result, t), result })),
        ...(hasKeyIssue ? useDefault : []),
      ],
    }
  }
  if (view.status === 'empty') {
    const others: SearchRow[] = SUBTITLE_LANGUAGES.filter((code) => code !== language).map((code) => ({
      key: `action:language:${code}`,
      label: subtitleLanguageName(code, t),
      action: 'language',
      language: code,
    }))
    const retry: SearchRow[] = view.unavailable.length > 0 ? [{ key: 'action:retry', label: t('common.retry'), action: 'retry' }] : []
    return {
      languages,
      notes,
      message: t('subtitles.empty', { language: subtitleLanguageName(language, t) }),
      items: [...(hasKeyIssue ? useDefault : []), ...retry, ...others],
    }
  }
  if (view.status === 'error') {
    const action: SearchRow =
      view.personal && canUseDefault
        ? useDefault[0]
        : view.code === 'offline' || view.code === 'unavailable'
          ? { key: 'action:retry', label: t('common.retry'), action: 'retry' }
          : view.code === 'unreadable' && view.results
            ? { key: 'action:chooseOther', label: t('subtitles.chooseOther'), action: 'chooseOther' }
            : { key: 'action:back', label: t('common.back'), action: 'back' }
    return { languages, notes, message: errorMessage(view.code, view.retryAtMs, t, formatTime), items: [action] }
  }
  const downloading = view.status === 'loading' && view.downloading
  return {
    languages,
    notes,
    message: null,
    items: [{ key: 'status:loading', label: t(downloading ? 'subtitles.downloading' : 'subtitles.searching') }],
  }
}

/** Foco ao chegar num estado: o primeiro item (resultado ou a ação do estado). */
export function initialSearchFocus(model: SearchPanelModel): string {
  return model.items[0].key
}

/** ↑/↓ entre os idiomas (uma linha) e os itens; ←/→ só na linha de idiomas. Sem volta nas pontas. */
export function moveSearchFocus(
  model: SearchPanelModel,
  currentKey: string,
  direction: 'up' | 'down' | 'left' | 'right',
  language: SubtitleLanguage,
): string {
  const languageIndex = model.languages.findIndex((row) => row.key === currentKey)
  if (languageIndex !== -1) {
    if (direction === 'down') return model.items[0].key
    if (direction === 'up') return currentKey
    const next = Math.max(0, Math.min(model.languages.length - 1, languageIndex + (direction === 'right' ? 1 : -1)))
    return model.languages[next].key
  }
  const index = model.items.findIndex((row) => row.key === currentKey)
  if (index === -1) return initialSearchFocus(model)
  if (direction === 'left' || direction === 'right') return currentKey
  if (direction === 'up') return index === 0 ? `lang:${language}` : model.items[index - 1].key
  return model.items[Math.min(model.items.length - 1, index + 1)].key
}

/** Depois de uma releitura: mantém a chave se ela ainda existe. */
export function reconcileSearchFocus(model: SearchPanelModel, currentKey: string): string {
  if (model.languages.some((row) => row.key === currentKey) || model.items.some((row) => row.key === currentKey)) return currentKey
  return initialSearchFocus(model)
}
