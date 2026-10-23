/**
 * Ações do diálogo "Buscar legenda online" (feature 090, `logic/legenda-externa.md` §5.2, §5.6). Sem React: o hook
 * `useExternalSubtitles` passa refs e callbacks. Toda chamada nasce de uma ação da pessoa (FR-002); cada nova
 * requisição aborta a anterior e respostas atrasadas são descartadas pelo `seq` (FR-010) — sem depender de o
 * `abort` lançar.
 */
import type { MutableRefObject } from 'react'
import type { Translator } from '../../lib/i18n/translate'
import { parseSubtitleFile, type ExternalCue } from '../../lib/subtitles/subtitleFile'
import { buildSearchRequest } from '../../lib/subtitles/searchRequest'
import type { ExternalSubtitlesDeps, SubtitleLanguage, SubtitleProvider, SubtitleResult, SubtitleTarget } from '../../lib/subtitles/types'
import { errorView, timeFormatter } from './externalSubtitlesSupport'
import type { PanelState } from './playerLayerTypes'
import { buildSearchPanel, initialSearchFocus, moveSearchFocus, type SearchPanelModel, type SearchView } from './subtitleSearchModel'

export interface SearchRefs {
  viewRef: MutableRefObject<SearchView>
  languageRef: MutableRefObject<SubtitleLanguage>
  seqRef: MutableRefObject<number>
  abortRef: MutableRefObject<AbortController | null>
}

export interface SearchContext extends SearchRefs {
  deps: ExternalSubtitlesDeps
  t: Translator
  panelRef: MutableRefObject<PanelState | null>
  target: () => SubtitleTarget | null
  setPanel: (next: PanelState) => void
  rerender: () => void
  /** Arquivo baixado e lido: aplicar, guardar e voltar ao painel de faixas. */
  onDownloaded: (result: SubtitleResult, text: string, cues: ExternalCue[]) => void
}

export function createSearchActions(ctx: SearchContext) {
  const { deps, panelRef, viewRef, languageRef, seqRef, abortRef } = ctx
  const formatTime = timeFormatter(ctx.t)

  function searchModel(): SearchPanelModel {
    return buildSearchPanel(viewRef.current, languageRef.current, ctx.t, formatTime, Boolean(deps.useDefault))
  }

  function showView(view: SearchView) {
    viewRef.current = view
    const panel = panelRef.current
    if (panel?.kind === 'subtitleSearch') ctx.setPanel({ ...panel, focusKey: initialSearchFocus(searchModel()) })
    else ctx.rerender()
  }

  function nextRequest(): { seq: number; signal: AbortSignal } {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    seqRef.current += 1
    return { seq: seqRef.current, signal: controller.signal }
  }

  function runSearch(language: SubtitleLanguage) {
    const target = ctx.target()
    if (!target) return
    languageRef.current = language
    const { seq, signal } = nextRequest()
    showView({ status: 'loading', downloading: false })
    const { request, byName } = buildSearchRequest(target, language)
    deps.service.search(request, signal).then(
      (response) => {
        if (seq !== seqRef.current) return
        showView(
          response.results.length > 0
            ? { status: 'results', results: response.results, byName, unavailable: response.unavailable, keyIssues: response.keyIssues }
            : { status: 'empty', byName, unavailable: response.unavailable, keyIssues: response.keyIssues },
        )
      },
      (error: unknown) => {
        if (seq === seqRef.current) showView(errorView(error))
      },
    )
  }

  function download(result: SubtitleResult) {
    const target = ctx.target()
    if (!target) return
    const previous = viewRef.current.status === 'results' ? viewRef.current.results : undefined
    const { seq, signal } = nextRequest()
    showView({ status: 'loading', downloading: true })
    const context = target.kind === 'episode' ? { season: target.season, episode: target.episode } : undefined
    deps.service.download(result.id, result.language, signal, context).then(
      (text) => {
        if (seq !== seqRef.current) return
        let cues: ExternalCue[]
        try {
          cues = parseSubtitleFile(text)
        } catch {
          showView({ status: 'error', code: 'unreadable', results: previous })
          return
        }
        viewRef.current = { status: 'idle' }
        ctx.onDownloaded(result, text, cues)
      },
      (error: unknown) => {
        if (seq === seqRef.current) showView(errorView(error, previous))
      },
    )
  }

  /** "Usar o padrão do ccplayTv": ação explícita da pessoa (ADR-021 §4); depois repete a busca no mesmo idioma. */
  function switchToDefault() {
    const view = viewRef.current
    const issues = view.status === 'results' || view.status === 'empty' ? Object.keys(view.keyIssues ?? {}) : []
    const providers = (view.status === 'error' && view.personal ? [view.personal] : issues) as SubtitleProvider[]
    if (!deps.useDefault || providers.length === 0) return
    void deps
      .useDefault(providers)
      .catch(() => {})
      .then(() => {
        if (panelRef.current?.kind === 'subtitleSearch') runSearch(languageRef.current)
      })
  }

  function closeSearch() {
    abortRef.current?.abort()
    seqRef.current += 1
    viewRef.current = { status: 'idle' }
    ctx.setPanel({ kind: 'tracks', focusKey: 'external:search', originIndex: panelRef.current?.originIndex ?? 0 })
  }

  return {
    searchModel,
    runSearch,
    closeSearch,
    openSearch(originIndex: number, language?: SubtitleLanguage) {
      ctx.setPanel({ kind: 'subtitleSearch', focusKey: 'status:loading', originIndex })
      runSearch(language ?? languageRef.current)
    },
    searchDirection(direction: 'up' | 'down' | 'left' | 'right') {
      const panel = panelRef.current
      if (panel?.kind !== 'subtitleSearch') return
      ctx.setPanel({ ...panel, focusKey: moveSearchFocus(searchModel(), panel.focusKey, direction, languageRef.current) })
    },
    searchSelect() {
      const panel = panelRef.current
      if (panel?.kind !== 'subtitleSearch') return
      const model = searchModel()
      const language = model.languages.find((row) => row.key === panel.focusKey)?.language
      if (language) return runSearch(language)
      const row = model.items.find((item) => item.key === panel.focusKey)
      if (row?.result) download(row.result)
      else if (row?.action === 'retry') runSearch(languageRef.current)
      else if (row?.action === 'language' && row.language) runSearch(row.language)
      else if (row?.action === 'back') closeSearch()
      else if (row?.action === 'useDefault') switchToDefault()
      else if (row?.action === 'chooseOther') {
        const view = viewRef.current
        if (view.status === 'error' && view.results) showView({ status: 'results', results: view.results, byName: false, unavailable: [] })
      }
    },
  }
}
