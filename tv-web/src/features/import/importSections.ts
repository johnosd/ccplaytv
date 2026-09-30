/**
 * Linhas da tela de importação por parte (feature 038, US3,
 * `logic/progresso-importacao.md`). Funções puras: recebem o que o importador
 * e o estado do EPG dizem, devolvem o texto de cada linha — nunca percentual
 * (FR-016), nunca "0 categorias" para uma parte que a lista não tem (FR-017),
 * nunca o erro cru do guia (FR-018).
 */

// Telas falam com `importApi`, nunca com `lib/` direto (D-001 da 005).
import { EPG_ERROR_CODE, epgErrorMessage, type EpgStatus } from './importApi'

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

const LABELS = { channel: 'Canais', movie: 'Filmes', series: 'Séries', guide: 'Guia' } as const

export const STATE_LABELS: Record<ImportRowState, string> = {
  waiting: 'Aguardando',
  loading: 'Carregando',
  ready: 'Pronto',
  failed: 'Falhou',
  unavailable: 'Não disponível nesta lista',
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`
}

function countOf(run: ImportSectionRun): string | undefined {
  if (run.categories !== undefined) return plural(run.categories, 'categoria', 'categorias')
  if (run.items !== undefined) return plural(run.items, 'item', 'itens')
  return undefined
}

function textOf(state: ImportRowState, detail?: string): string {
  return detail ? `${STATE_LABELS[state]} — ${detail}` : STATE_LABELS[state]
}

/** Canais, Filmes e Séries. Sem `sections` (importação antiga), as três aguardam. */
export function sectionRows(sections: ImportSections | undefined): ImportRow[] {
  return (['channel', 'movie', 'series'] as const).map((key) => {
    const run: ImportSectionRun = sections?.[key] ?? { state: 'waiting' }
    // Contagem só onde ela diz algo: carregando (M3U) e pronto.
    const detail = run.state === 'ready' || (run.state === 'loading' && run.items !== undefined) ? countOf(run) : undefined
    return { key, label: LABELS[key], state: run.state, text: textOf(run.state, detail) }
  })
}

export interface GuideRowInput {
  /** A importação terminou com sucesso (o EPG só começa depois). */
  importSucceeded: boolean
  epg: EpgStatus | undefined
  syncing: boolean
  /** Início desta importação, epoch ms — o que veio antes é de outra sincronização. */
  runStartedAt: number
}

/** A linha "Guia" (`logic/progresso-importacao.md` §2). */
export function guideRow({ importSucceeded, epg, syncing, runStartedAt }: GuideRowInput): ImportRow {
  const row = (state: ImportRowState, detail?: string): ImportRow => ({
    key: 'guide',
    label: LABELS.guide,
    state,
    text: textOf(state, detail),
  })
  if (!importSucceeded) return row('waiting')
  if (!epg || epg.state === 'not_configured' || epg.state === 'disabled') return row('unavailable')
  if (syncing) return row('loading')
  if (epg.state === 'linked' && (epg.lastSyncAt ?? 0) >= runStartedAt) return row('ready')
  if (epg.state === 'error' && epg.errorKind && (epg.lastErrorAt ?? 0) >= runStartedAt) {
    return row('failed', `${epgErrorMessage(epg.errorKind)} (${EPG_ERROR_CODE})`)
  }
  // A sincronização desta importação ainda não começou (ou não terminou).
  return row('loading')
}

/** A tela está "concluída" (foco automático em "Abrir lista", D-012). */
export function isGuideSettled(row: ImportRow): boolean {
  return row.state === 'ready' || row.state === 'failed' || row.state === 'unavailable'
}
