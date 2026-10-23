import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { Translator } from '../../lib/i18n/translate'
import type { PlayerServiceSession } from '../../lib/player/PlayerService'
import { createExternalCueDriver, type ExternalCueDriver } from '../../lib/subtitles/externalCueDriver'
import { rememberSequenceLanguage } from '../../lib/subtitles/sequenceMemory'
import { parseSubtitleFile, type ExternalCue } from '../../lib/subtitles/subtitleFile'
import {
  subtitleLanguageForApp,
  type ExternalSubtitlesDeps,
  type StoredExternalSubtitle,
  type SubtitleLanguage,
  type SubtitleTarget,
} from '../../lib/subtitles/types'
import type { SubtitleSource } from '../SubtitleOverlay'
import { stepExternalDelay, type ExternalPanelInput, type TracksRow } from '../playerPanels'
import { createSearchActions } from './externalSubtitleSearch'
import { buildExternalPanelInput, createDelaySaver, metaOf, whenIdle, type ExternalEntry } from './externalSubtitlesSupport'
import type { PanelState } from './playerLayerTypes'
import type { SearchPanelModel, SearchView } from './subtitleSearchModel'

export interface ExternalSubtitlesParams {
  itemId: string
  /** Prop do `PlayerLayer`: ausente = padrão de produção; `null` = desligado. */
  deps: ExternalSubtitlesDeps | null | undefined
  sessionRef: MutableRefObject<PlayerServiceSession | null>
  panelRef: MutableRefObject<PanelState | null>
  t: Translator
  showToast: (message: string) => void
}

export interface ExternalSubtitles {
  /** Há alvo (filme/episódio) e serviço: "Áudio e legendas" é real mesmo sem faixas do motor. */
  availableRef: MutableRefObject<boolean>
  /** Primeira entrada em `playing` de cada sessão (`reapplyTrackChoice`): resolve o alvo e religa o driver. */
  onFirstPlaying(session: PlayerServiceSession): void
  panelInput(): ExternalPanelInput | undefined
  /** Fonte do overlay quando a externa está ativa; `null` = a sessão (legenda embutida). */
  source: SubtitleSource | null
  searchModel(): SearchPanelModel
  searchLanguage: SubtitleLanguage
  /** SELECT numa linha da externa no painel de faixas. `true` = tratada aqui. */
  selectRow(row: TracksRow): boolean
  deactivate(): void
  stepDelay(direction: 'left' | 'right'): void
  searchDirection(direction: 'up' | 'down' | 'left' | 'right'): void
  searchSelect(): void
  closeSearch(): void
}

/**
 * Legenda externa no player (feature 090, `logic/legenda-externa.md` §5): busca só por ação da pessoa
 * (`externalSubtitleSearch.ts`), aplicada pelo driver do tempo da mídia, memória por item e idioma. Estado em refs + um
 * contador para redesenhar — uma fala nunca re-renderiza o `PlayerLayer` (o driver fala direto com o overlay).
 */
export function useExternalSubtitles({ itemId, deps: depsProp, sessionRef, panelRef, t, showToast }: ExternalSubtitlesParams): ExternalSubtitles {
  const [, setVersion] = useState(0)
  const rerender = () => setVersion((n) => n + 1)
  // `undefined` = o padrão de produção, carregado por `import()` só no passo ocioso depois do primeiro `playing`:
  // nada de licença/portal/memória entra no carregamento do player (D-012) nem muda os chunks do pacote Tizen.
  const depsRef = useRef<ExternalSubtitlesDeps | null | undefined>(depsProp)
  const deps = depsRef.current ?? null
  const availableRef = useRef(false)
  const itemIdRef = useRef(itemId)
  const targetRef = useRef<SubtitleTarget | null>(null)
  const resolvingRef = useRef<string | null>(null)
  const cancelIdleRef = useRef<(() => void) | null>(null)
  const entriesRef = useRef<ExternalEntry[]>([])
  /** Só quando a memória não lista (fakes de teste): o texto baixado nesta sessão, para reativar sem rede. */
  const textsRef = useRef(new Map<SubtitleLanguage, string>())
  const driverRef = useRef<ExternalCueDriver | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const viewRef = useRef<SearchView>({ status: 'idle' })
  const languageRef = useRef<SubtitleLanguage>(subtitleLanguageForApp(t.language))
  const seqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const [delaySaver] = useState(createDelaySaver)

  function detach() {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    driverRef.current?.dispose()
    driverRef.current = null
  }

  // Troca de item ou desmontagem: nada da busca/legenda anterior sobrevive (FR-010).
  useEffect(() => {
    itemIdRef.current = itemId
    return () => {
      delaySaver.flush()
      seqRef.current += 1
      abortRef.current?.abort()
      cancelIdleRef.current?.()
      cancelIdleRef.current = null
      detach()
      targetRef.current = null
      resolvingRef.current = null
      availableRef.current = false
      entriesRef.current = []
      textsRef.current.clear()
      viewRef.current = { status: 'idle' }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a troca de item reinicia; o resto vive em refs
  }, [itemId])

  function attach(driver: ExternalCueDriver, session: PlayerServiceSession) {
    unsubscribeRef.current?.()
    const update = () => driver.update(session.progress?.positionMs ?? 0, session.state === 'playing')
    unsubscribeRef.current = session.subscribe(update)
    update()
  }

  /**
   * Retomar (US2, `logic §5.4`): a externa que a pessoa deixou ativa volta sozinha, do aparelho — sem rede e sem
   * `save`. Vale mais que a embutida herdada da sequência (`apply` desliga a embutida). Ilegível = segue sem ela.
   */
  function restore(target: SubtitleTarget, stored: StoredExternalSubtitle | undefined) {
    if (!stored || driverRef.current) return
    try {
      apply(metaOf(stored), parseSubtitleFile(stored.text))
    } catch {
      return
    }
    if (target.kind === 'episode' && target.seriesId) rememberSequenceLanguage(target.sourceId, target.seriesId, stored.language)
  }

  function resolve(forItem: string) {
    const deps = depsRef.current
    if (!deps) return
    resolvingRef.current = forItem
    deps.resolveTarget(forItem).then(
      async (target) => {
        if (itemIdRef.current !== forItem) return
        targetRef.current = target
        availableRef.current = target !== null
        if (target) {
          const listed = deps.store.list
            ? await deps.store.list(target.stableId)
            : [await deps.store.load(target.stableId)].filter((row): row is StoredExternalSubtitle => row !== null)
          if (itemIdRef.current !== forItem) return
          entriesRef.current = listed.map(metaOf)
          restore(target, listed.find((row) => row.active))
        }
        rerender()
      },
      () => {
        resolvingRef.current = null
      },
    )
  }

  function setPanel(next: PanelState) {
    panelRef.current = next
    rerender()
  }

  function apply(entry: ExternalEntry, cues: ExternalCue[]) {
    const session = sessionRef.current
    detach()
    const driver = createExternalCueDriver(cues, { delayMs: entry.delayMs })
    driverRef.current = driver
    if (session) {
      attach(driver, session)
      // Uma legenda por vez (FR-009): a embutida desliga. Motor sem faixas recusa — tanto faz.
      session.selectTextTrack(null)
    }
    entriesRef.current = [
      ...entriesRef.current.filter((row) => row.language !== entry.language).map((row) => ({ ...row, active: false })),
      { ...entry, active: true },
    ]
  }

  const search = deps
    ? createSearchActions({
        deps,
        t,
        panelRef,
        viewRef,
        languageRef,
        seqRef,
        abortRef,
        target: () => targetRef.current,
        setPanel,
        rerender,
        onDownloaded(result, text, cues) {
          const target = targetRef.current
          if (!target) return
          const entry: ExternalEntry = {
            stableId: target.stableId,
            sourceId: target.sourceId,
            language: result.language,
            resultId: result.id,
            release: result.release,
            delayMs: 0,
            active: true,
          }
          apply(entry, cues)
          if (!deps.store.list) textsRef.current.set(result.language, text)
          void deps.store.save({ ...entry, text }).catch(() => false)
          if (target.kind === 'episode' && target.seriesId) rememberSequenceLanguage(target.sourceId, target.seriesId, result.language)
          setPanel({ kind: 'tracks', focusKey: `external:${result.language}`, originIndex: panelRef.current?.originIndex ?? 0 })
        },
      })
    : null

  /** Reativar/alternar um idioma já obtido: do aparelho, sem rede (US1/AC8–AC9). */
  function activateStored(language: SubtitleLanguage) {
    const target = targetRef.current
    const entry = entriesRef.current.find((row) => row.language === language)
    if (!deps || !target || !entry || entry.active) return
    const forItem = itemId
    const run = (text: string | undefined) => {
      if (itemIdRef.current !== forItem || text === undefined) return
      try {
        apply(entry, parseSubtitleFile(text))
      } catch {
        showToast(t('subtitles.error.unreadable'))
        return
      }
      void deps.store.update(target.stableId, { active: true }, language)
      rerender()
    }
    const cached = textsRef.current.get(language)
    if (cached !== undefined || !deps.store.list) run(cached)
    else void deps.store.list(target.stableId).then((rows) => run(rows.find((row) => row.language === language)?.text))
  }

  function deactivate() {
    const target = targetRef.current
    if (!entriesRef.current.some((row) => row.active)) return
    delaySaver.flush()
    detach()
    entriesRef.current = entriesRef.current.map((row) => ({ ...row, active: false }))
    if (deps && target) void deps.store.update(target.stableId, { active: false })
    rerender()
  }

  /** Ajuste da externa (FR-008, `logic §4.1`): efeito na hora, gravação adiada. */
  function setDelay(ms: number) {
    const target = targetRef.current
    const active = entriesRef.current.find((row) => row.active)
    if (!deps || !target || !active || active.delayMs === ms) return
    entriesRef.current = entriesRef.current.map((row) => (row === active ? { ...row, delayMs: ms } : row))
    driverRef.current?.setDelay(ms)
    delaySaver.schedule(() => void deps.store.update(target.stableId, { delayMs: ms }, active.language))
    rerender()
  }

  return {
    availableRef,
    onFirstPlaying(session) {
      if (driverRef.current) attach(driverRef.current, session)
      if (depsRef.current === null || resolvingRef.current === itemId) return
      cancelIdleRef.current?.()
      const forItem = itemId
      cancelIdleRef.current = whenIdle(() => {
        cancelIdleRef.current = null
        const loading =
          depsRef.current === undefined
            ? import('../../lib/subtitles/runtime').then((runtime) => {
                depsRef.current = runtime.defaultExternalSubtitles()
              })
            : Promise.resolve()
        loading.then(
          () => resolve(forItem),
          () => {
            depsRef.current = null
          },
        )
      })
    },
    panelInput: () =>
      availableRef.current ? buildExternalPanelInput(deps, targetRef.current, entriesRef.current, languageRef.current, t) : undefined,
    source: driverRef.current,
    searchModel: () => search?.searchModel() ?? { languages: [], notes: [], message: null, items: [{ key: 'status:loading', label: '' }] },
    searchLanguage: languageRef.current,
    selectRow(row) {
      if (row.group === 'externalSearch') search?.openSearch(panelRef.current?.originIndex ?? 0, row.language)
      else if (row.group === 'external' && row.language) activateStored(row.language)
      else if (row.key === 'delay:external') setDelay(0)
      else return false
      return true
    },
    deactivate,
    stepDelay(direction) {
      const active = entriesRef.current.find((row) => row.active)
      if (active) setDelay(stepExternalDelay(active.delayMs, direction))
    },
    searchDirection: (direction) => search?.searchDirection(direction),
    searchSelect: () => search?.searchSelect(),
    closeSearch: () => search?.closeSearch(),
  }
}
