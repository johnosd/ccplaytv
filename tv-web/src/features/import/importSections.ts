/**
 * Linhas da tela de importação por parte (feature 038, US3,
 * `logic/progresso-importacao.md`). Funções puras: recebem o que o importador
 * e o estado do EPG dizem, devolvem o texto de cada linha — nunca percentual
 * (FR-016), nunca "0 categorias" para uma parte que a lista não tem (FR-017),
 * nunca o erro cru do guia (FR-018).
 */

// Telas falam com `importApi`, nunca com `lib/` direto (D-001 da 005).
import type { MessageKey } from '../../lib/i18n/messages/pt'
import { createTranslator, type Translator } from '../../lib/i18n/translate'
import { EPG_ERROR_CODE, EPG_STALE_AFTER_MS, epgErrorMessage, type EpgStatus } from './importApi'

export type ImportRowState = 'waiting' | 'loading' | 'ready' | 'failed' | 'unavailable'

export interface ImportSectionRun {
  state: ImportRowState
  categories?: number
  items?: number
}

export type ImportSections = Record<'channel' | 'movie' | 'series', ImportSectionRun>

export interface ImportRow {
  key: 'channel' | 'movie' | 'series' | 'guide'
  label: string
  state: ImportRowState
  /** Rótulo do estado + contagem/motivo, pronto para exibir. */
  text: string
}

/** Rótulos no catálogo (`import.state.*`, feature 054) — o texto vem de `t()`. */
export const STATE_LABEL_KEYS = {
  waiting: 'import.state.waiting',
  loading: 'import.state.loading',
  ready: 'import.state.ready',
  failed: 'import.state.failed',
  unavailable: 'import.state.unavailable',
} as const satisfies Record<ImportRowState, MessageKey>

const ROW_LABEL_KEYS = {
  channel: 'import.row.channel',
  movie: 'import.row.movie',
  series: 'import.row.series',
} as const satisfies Record<'channel' | 'movie' | 'series', MessageKey>

function countOf(run: ImportSectionRun, t: Translator): string | undefined {
  if (run.categories !== undefined) return t.plural('import.categories', run.categories)
  if (run.items !== undefined) return t.plural('import.items', run.items)
  return undefined
}

function textOf(state: ImportRowState, t: Translator, detail?: string): string {
  const label = t(STATE_LABEL_KEYS[state])
  return detail ? t('import.stateWithDetail', { state: label, detail }) : label
}

/** Canais, Filmes e Séries. Sem `sections` (importação antiga), as três aguardam. */
export function sectionRows(sections: ImportSections | undefined, t: Translator = createTranslator('pt')): ImportRow[] {
  return (['channel', 'movie', 'series'] as const).map((key) => {
    const run: ImportSectionRun = sections?.[key] ?? { state: 'waiting' }
    // Contagem só onde ela diz algo: carregando (M3U) e pronto.
    const detail = run.state === 'ready' || (run.state === 'loading' && run.items !== undefined) ? countOf(run, t) : undefined
    return { key, label: t(ROW_LABEL_KEYS[key]), state: run.state, text: textOf(run.state, t, detail) }
  })
}

export interface GuideRowInput {
  /** A importação terminou com sucesso (o EPG só começa depois). */
  importSucceeded: boolean
  epg: EpgStatus | undefined
  syncing: boolean
  /** Início desta importação, epoch ms — o que veio antes é de outra sincronização. */
  runStartedAt: number
  /** Instante de agora, epoch ms (testes; padrão `Date.now()`). */
  now?: number
}

/** A linha "Guia" (`logic/progresso-importacao.md` §2). */
export function guideRow(
  { importSucceeded, epg, syncing, runStartedAt, now = Date.now() }: GuideRowInput,
  t: Translator = createTranslator('pt'),
): ImportRow {
  const row = (state: ImportRowState, detail?: string): ImportRow => ({
    key: 'guide',
    label: t('import.row.guide'),
    state,
    text: textOf(state, t, detail),
  })
  if (!importSucceeded) return row('waiting')
  if (!epg || epg.state === 'not_configured' || epg.state === 'disabled') return row('unavailable')
  if (syncing) return row('loading')
  if (epg.state === 'linked' && (epg.lastSyncAt ?? 0) >= runStartedAt) return row('ready')
  if (epg.state === 'error' && epg.errorKind && (epg.lastErrorAt ?? 0) >= runStartedAt) {
    return row('failed', `${epgErrorMessage(epg.errorKind, t)} (${EPG_ERROR_CODE})`)
  }
  // Guia sincronizado há menos de `EPG_STALE_AFTER_MS` (12 h): a importação não pediu outro de propósito (`isEpgDueAfterImport`), então
  // nada vai rodar. Sem isto a linha ficava em "Carregando" para sempre ao ressincronizar a lista de novo dentro do prazo.
  if (epg.state === 'linked' && epg.lastSyncAt !== undefined && now - epg.lastSyncAt <= EPG_STALE_AFTER_MS) return row('ready')
  // A sincronização desta importação ainda não começou (ou não terminou).
  return row('loading')
}

/** A tela está "concluída" (foco automático em "Abrir lista", D-012). */
export function isGuideSettled(row: ImportRow): boolean {
  return row.state === 'ready' || row.state === 'failed' || row.state === 'unavailable'
}
