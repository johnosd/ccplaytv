/**
 * Peças puras da legenda externa no player (feature 090, `logic/legenda-externa.md` §5, §9) — sem React nem rede.
 */
import { APP_LANGUAGE_LOCALE } from '../../lib/i18n/languages'
import type { Translator } from '../../lib/i18n/translate'
import { sequenceLanguageOf } from '../../lib/subtitles/sequenceMemory'
import {
  SubtitleError,
  type ExternalSubtitlesDeps,
  type StoredExternalSubtitle,
  type SubtitleLanguage,
  type SubtitleResult,
  type SubtitleTarget,
} from '../../lib/subtitles/types'
import type { ExternalPanelInput } from '../playerPanels'
import type { SearchView } from './subtitleSearchModel'

/** Uma legenda guardada sem o texto: o que o painel precisa (o texto só fica em RAM quando ativo — R-011). */
export type ExternalEntry = Omit<StoredExternalSubtitle, 'text'>

export function metaOf({ text: _text, ...entry }: StoredExternalSubtitle): ExternalEntry {
  return entry
}

/** Leitura local adiada para depois do primeiro quadro tocando, num momento ocioso (D-012, `logic §9`). */
export function whenIdle(run: () => void): () => void {
  const scope = globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof scope.requestIdleCallback === 'function') {
    const id = scope.requestIdleCallback(run, { timeout: 1500 })
    return () => scope.cancelIdleCallback?.(id)
  }
  // jsdom e motores sem a API: ainda uma tarefa separada depois do `playing`.
  const id = setTimeout(run, 0)
  return () => clearTimeout(id)
}

/** Escrita do ajuste no aparelho só depois de parar de apertar (D-012: uma escrita por ajuste, não por toque). */
export const DELAY_SAVE_MS = 800

export interface DelaySaver {
  /** Substitui a escrita pendente por esta, a `DELAY_SAVE_MS` de agora. */
  schedule(run: () => void): void
  /** Roda já a escrita pendente (desativar, trocar de item, desmontar) — nada se perde. */
  flush(): void
}

export function createDelaySaver(waitMs: number = DELAY_SAVE_MS): DelaySaver {
  let pending: { timer: ReturnType<typeof setTimeout>; run: () => void } | null = null
  return {
    schedule(run) {
      if (pending) clearTimeout(pending.timer)
      pending = {
        run,
        timer: setTimeout(() => {
          pending = null
          run()
        }, waitMs),
      }
    },
    flush() {
      if (!pending) return
      clearTimeout(pending.timer)
      const { run } = pending
      pending = null
      run()
    },
  }
}

export function errorView(error: unknown, results?: SubtitleResult[]): SearchView {
  const code = error instanceof SubtitleError ? error.code : 'unavailable'
  return {
    status: 'error',
    code,
    retryAtMs: error instanceof SubtitleError ? error.retryAtMs : undefined,
    results,
    personal: error instanceof SubtitleError ? error.personal : undefined,
  }
}

export function timeFormatter(t: Translator): (ms: number) => string {
  return (ms) => new Date(ms).toLocaleTimeString(APP_LANGUAGE_LOCALE[t.language], { hour: '2-digit', minute: '2-digit' })
}

/** O que o painel "Áudio e legendas" mostra da externa; `undefined` = nada (sem serviço ou sem alvo). */
export function buildExternalPanelInput(
  deps: ExternalSubtitlesDeps | null,
  target: SubtitleTarget | null,
  entries: ExternalEntry[],
  language: SubtitleLanguage,
  t: Translator,
): ExternalPanelInput | undefined {
  if (!deps || !target) return undefined
  // Episódio seguinte de uma série que já usou legenda externa: atalho, nunca busca sozinho (FR-003).
  const shortcut =
    target.kind === 'episode' && target.seriesId && entries.length === 0
      ? sequenceLanguageOf(target.sourceId, target.seriesId)
      : undefined
  return {
    stored: entries.map(({ language: code, active, delayMs }) => ({ language: code, active, delayMs })),
    search: {
      mode: shortcut ? 'shortcut' : 'search',
      language: shortcut ?? language,
      disabledMessage: deps.access?.() === 'not_entitled' ? t('subtitles.error.notEntitled') : undefined,
    },
  }
}
