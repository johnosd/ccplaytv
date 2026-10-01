import { useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  groupLabel,
  useAggregatedItems,
  useCategoryContent,
  useEpgPrograms,
  useFavoritesContent,
  type CatalogCategory,
  type CatalogItemOut,
} from '../../catalog/catalogApi'
import { useSources } from '../../import/importApi'
import { useNow } from '../../../lib/useNow'
import { useVirtualFocusSync } from '../../../lib/focus/useVirtualFocusSync'
import { useScrollFocusedIntoView } from '../../../lib/focus/useScrollFocusedIntoView'
import { formatEpgClock, formatEpgTimeRange } from '../../../lib/epg/formatEpgTime'
import { ErrorState } from '../../../components/ErrorState'
import { EmptyState } from '../../../components/EmptyState'
import { PosterArt } from '../../../components/PosterArt'
import { Spinner } from '../../../components/Spinner'
import { channelNumberOf } from '../channelNumber'
import {
  blocksInView,
  dayOfTime,
  initialFocus,
  jumpToDay,
  moveHorizontal,
  moveVertical,
  programNearest,
  scrollForFocus,
  tickTimes,
  type GuideDay,
  type GuideFocus,
  type GuideProgram,
  type GuideRow,
  type GuideView,
} from './guideGrid'
import { buildGuideRows, guideBounds, initialView } from './guideRows'

/**
 * Guia completo em tela cheia (feature 031, `logic/grade-e-foco.md`,
 * `logic/entradas-e-saida.md`).
 *
 * O guia NÃO registra teclado: quem o hospeda (a Live TV, ou o `topLayer` do
 * `PlayerLayer`, que captura o teclado na fase de captura) encaminha as
 * teclas pelo `EpgGuideHandle` — o mesmo motivo pelo qual o `Modal` não
 * funciona dentro do player (feature 029). O foco é por estado + classe
 * (ADR-009), nunca foco DOM.
 */

/** A lista de canais que o guia exibe — o mesmo modelo de "entrada" da Live TV (favoritos, todos, ou uma categoria por id). */
export type GuideListKey = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; id: number }

export interface EpgGuideHandle {
  onDirection: (direction: 'up' | 'down' | 'left' | 'right') => void
  onSelect: () => void
  onBack: () => void
  /** CH+/CH− (FR-015): pagina os canais em blocos do tamanho da área visível. Ausente do contrato travado de propósito. */
  onPage: (direction: 'previous' | 'next') => void
}

export interface EpgGuideProps {
  sourceId: string
  /** Categorias de canais da fonte (seletor de lista). */
  categories: CatalogCategory[]
  /** Lista de origem (FR-009/FR-010). */
  initialList: GuideListKey
  /** Id (`CatalogItemOut.id`) do canal de origem, para o foco inicial; `null` = primeiro canal da lista. */
  initialChannelId: string | null
  /**
   * OK num programa atual/futuro ou no bloco "Sem programação" (FR-020):
   * quem hospeda toca o canal e passa a usar `list` como vizinhança de
   * zapping. `listKey` diz de qual lista veio (para restaurar o foco na Live TV).
   */
  onWatch: (channel: CatalogItemOut, list: CatalogItemOut[], listKey: GuideListKey) => void
  /** RETURN na camada base do guia. */
  onClose: () => void
  /** Ação de "sem programação" (FR-013): ir ao painel de EPG da fonte. Ausente = a ação não aparece. */
  onOpenEpgSettings?: () => void
  /** Retorno discreto (toast do host): programa encerrado, canal indisponível. */
  onNotify?: (message: string) => void
  handleRef?: Ref<EpgGuideHandle>
}

/** Espelha `--guide-row-height` em `guide.css` — o virtualizador precisa da mesma altura. */
const GUIDE_ROW_HEIGHT = 84
const GUIDE_ROW_OVERSCAN = 4
const EMPTY_ITEMS: CatalogItemOut[] = []

type BodyState = 'loading' | 'error' | 'empty' | 'explain' | 'grid'

interface StateAction {
  label: string
  run: () => void
}

interface SelectorEntry {
  key: GuideListKey
  label: string
}

function sameList(a: GuideListKey, b: GuideListKey): boolean {
  if (a.kind === 'category') return b.kind === 'category' && b.id === a.id
  return a.kind === b.kind
}

const EXPLAIN_TEXT: Record<'not_configured' | 'disabled' | 'never_synced' | 'error', string> = {
  not_configured: 'Esta lista não tem EPG configurado.',
  disabled: 'O EPG desta lista está desativado.',
  never_synced: 'O EPG desta lista ainda não foi sincronizado.',
  error: 'Não foi possível carregar a programação.',
}

export function EpgGuide({
  sourceId,
  categories,
  initialList,
  initialChannelId,
  onWatch,
  onClose,
  onOpenEpgSettings,
  onNotify,
  handleRef,
}: EpgGuideProps): ReactNode {
  const [list, setList] = useState<GuideListKey>(initialList)
  /** Canal de origem: só vale para o foco inicial da lista de abertura; trocar de lista o zera. */
  const originRef = useRef<string | null>(initialChannelId)
  const [focus, setFocus] = useState<GuideFocus | null>(null)
  const [refTimeState, setRefTime] = useState<number | null>(null)
  const now = useNow()
  const bounds = useMemo(() => guideBounds(now), [now])
  const [view, setView] = useState<GuideView>(() => initialView(Date.now(), guideBounds(Date.now())))
  const [zone, setZone] = useState<'bar' | 'grid'>('grid')
  const [barIndex, setBarIndex] = useState(0)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [selectorIndex, setSelectorIndex] = useState(0)

  // ---- Dados: os mesmos hooks da Live TV, habilitados pelo tipo da lista (D-001). ----
  const category = list.kind === 'category' ? categories.find((candidate) => candidate.id === list.id) : undefined
  const content = useCategoryContent(sourceId, category)
  const favorites = useFavoritesContent(sourceId, 'channel', list.kind === 'favorites')
  const aggregated = useAggregatedItems(sourceId, 'channel', list.kind === 'all')
  const items: CatalogItemOut[] =
    list.kind === 'favorites' ? (favorites.data?.items ?? EMPTY_ITEMS) : list.kind === 'all' ? aggregated.items : (content.data?.items ?? EMPTY_ITEMS)
  const listLoading = list.kind === 'favorites' ? favorites.isLoading : list.kind === 'all' ? aggregated.isLoading : content.isLoading
  const listFailed =
    list.kind === 'favorites'
      ? favorites.isError
      : list.kind === 'all'
        ? false
        : content.isError || content.data?.outcome === 'failed' || content.data?.outcome === 'source_missing'

  const epgChannelIds = useMemo(() => items.map((item) => item.epg_channel_id), [items])
  const lookup = useEpgPrograms(sourceId, epgChannelIds).data
  const sourcesQuery = useSources()
  const epgState = sourcesQuery.data?.sources.find((candidate) => candidate.id === sourceId)?.epg?.state

  const rows = useMemo(() => buildGuideRows(items, lookup), [items, lookup])
  const rowIndexById = useMemo(() => new Map(rows.map((row, index) => [row.channelId, index])), [rows])

  // ---- Estado do corpo (todo estado tem foco possível — constitution). ----
  const explainReason: keyof typeof EXPLAIN_TEXT | null =
    epgState === 'not_configured' || epgState === 'disabled' || epgState === 'never_synced'
      ? epgState
      : epgState === 'error' && lookup !== undefined && lookup.byKey.size === 0
        ? 'error'
        : null
  const bodyState: BodyState =
    listLoading || sourcesQuery.isLoading
      ? 'loading'
      : listFailed
        ? 'error'
        : items.length === 0
          ? 'empty'
          : explainReason
            ? 'explain'
            : 'grid'

  function retry() {
    if (list.kind === 'favorites') void favorites.refetch()
    else void content.refetch()
  }
  function openSelector() {
    setSelectorIndex(Math.max(0, entries.findIndex((entry) => sameList(entry.key, list))))
    setSelectorOpen(true)
  }

  const stateAction: StateAction | null =
    bodyState === 'error'
      ? { label: 'Tentar de novo', run: retry }
      : bodyState === 'empty'
        ? { label: 'Trocar lista', run: openSelector }
        : bodyState === 'explain' && onOpenEpgSettings
          ? { label: 'Configurar EPG', run: onOpenEpgSettings }
          : null
  const barItems: ('selector' | 'today' | 'tomorrow' | 'action')[] =
    bodyState === 'grid' ? ['selector', 'today', 'tomorrow'] : stateAction ? ['selector', 'action'] : ['selector']
  const activeZone = bodyState === 'grid' ? zone : 'bar'
  const barFocus = barItems[Math.min(barIndex, barItems.length - 1)]

  const entries: SelectorEntry[] = useMemo(
    () => [
      { key: { kind: 'favorites' }, label: '★ Favoritos' },
      { key: { kind: 'all' }, label: 'Todos' },
      ...categories.map((candidate): SelectorEntry => ({ key: { kind: 'category', id: candidate.id }, label: groupLabel(candidate.name) })),
    ],
    [categories],
  )
  const listLabel = entries.find((entry) => sameList(entry.key, list))?.label ?? 'Lista'

  // ---- Foco por identidade (canal + início), reconciliado a cada render (D-003). ----
  const resolved = useMemo((): { focus: GuideFocus; row: GuideRow } | null => {
    if (rows.length === 0) return null
    const wantedIndex = focus ? rowIndexById.get(focus.channelId) : undefined
    if (focus && wantedIndex !== undefined) {
      const row = rows[wantedIndex]
      const stillThere = focus.programStart === null ? row.programs.length === 0 : row.programs.some((program) => program.start === focus.programStart)
      if (stillThere) return { focus, row }
      // A programação mudou com o guia aberto: reancora no mais próximo da hora de referência.
      const anchor = refTimeState ?? focus.programStart ?? now
      return { focus: { channelId: row.channelId, programStart: programNearest(row, anchor)?.start ?? null }, row }
    }
    const originIndex = originRef.current === null ? undefined : rowIndexById.get(originRef.current)
    const row = rows[originIndex ?? 0]
    return { focus: initialFocus(row, now), row }
  }, [rows, rowIndexById, focus, refTimeState, now])

  const focusedProgram: GuideProgram | undefined =
    resolved && resolved.focus.programStart !== null ? resolved.row.programs.find((program) => program.start === resolved.focus.programStart) : undefined
  // Antes da primeira tecla, a janela acompanha o programa de abertura (pode estar fora da janela inicial).
  const displayView = focus === null && focusedProgram ? scrollForFocus(view, focusedProgram, bounds) : view
  const refTime = refTimeState ?? (focusedProgram ? Math.max(focusedProgram.start, displayView.viewStart) : now)
  const focusedRowIndex = resolved ? (rowIndexById.get(resolved.focus.channelId) ?? 0) : 0
  const focusedChannel: CatalogItemOut | undefined = resolved ? items[focusedRowIndex] : undefined

  // ---- Linhas virtualizadas (eixo vertical); o horizontal é só a janela visível (`blocksInView`). ----
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: bodyState === 'grid' ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GUIDE_ROW_HEIGHT,
    overscan: GUIDE_ROW_OVERSCAN,
  })
  useVirtualFocusSync({
    focusedIndex: focusedRowIndex,
    scrollToIndex: rowVirtualizer.scrollToIndex,
    enabled: bodyState === 'grid' && activeZone === 'grid' && !selectorOpen,
  })
  const selectorEntryRef = useScrollFocusedIntoView<HTMLButtonElement>(selectorIndex)

  // ---- Teclas (encaminhadas pelo hospedeiro) ----
  function applyFocus(next: GuideFocus, kind: 'horizontal' | 'vertical') {
    const row = rows[rowIndexById.get(next.channelId) ?? -1]
    const program = row && next.programStart !== null ? row.programs.find((candidate) => candidate.start === next.programStart) : undefined
    const nextView = program ? scrollForFocus(displayView, program, bounds) : displayView
    setView(nextView)
    setFocus(next)
    // ←/→ definem a coluna de referência; ↑/↓ a preservam (congela o valor derivado).
    setRefTime(kind === 'horizontal' && program ? Math.max(program.start, nextView.viewStart) : refTime)
  }

  function chooseEntry(index: number) {
    const entry = entries[index]
    if (!entry) return
    originRef.current = null
    setList(entry.key)
    setFocus(null)
    setRefTime(null)
    setView(initialView(now, bounds))
    setSelectorOpen(false)
    setZone('grid')
    setBarIndex(0)
  }

  /** Abas Hoje/Amanhã (FR-016): move foco, efTime e janela de uma vez e devolve o foco à grade. */
  function jumpTo(day: GuideDay) {
    if (!resolved) return
    const target = jumpToDay(resolved.row, day, now)
    setFocus(target.focus)
    setRefTime(target.refTime)
    const dayView: GuideView =
      day === 'today' ? initialView(now, bounds) : { viewStart: Math.max(bounds.from, Math.min(target.refTime, bounds.to - view.spanMs)), spanMs: view.spanMs }
    // O primeiro programa de amanhã pode começar horas depois da meia-noite: a janela o alcança, nunca deixa o foco fora da tela.
    const targetProgram = target.focus.programStart === null ? undefined : resolved.row.programs.find((program) => program.start === target.focus.programStart)
    const overlapsView = targetProgram !== undefined && targetProgram.start < dayView.viewStart + dayView.spanMs && targetProgram.end > dayView.viewStart
    setView(targetProgram && !overlapsView ? scrollForFocus(dayView, targetProgram, bounds) : dayView)
    setZone('grid')
  }

  /** CH−/CH+ (FR-015): salta pageRows canais, saturando nas pontas; efTime é preservado como em ↑/↓. */
  function onPage(direction: 'previous' | 'next') {
    if (selectorOpen || bodyState !== 'grid' || activeZone !== 'grid' || !resolved) return
    const visibleRows = Math.floor((scrollRef.current?.clientHeight ?? 0) / GUIDE_ROW_HEIGHT)
    const pageRows = Math.max(1, visibleRows - 1)
    let current = resolved.focus
    for (let step = 0; step < pageRows; step += 1) {
      const moved = moveVertical(rows, current, refTime, direction === 'next' ? 'down' : 'up')
      if (!moved) break
      current = moved
    }
    if (current !== resolved.focus) applyFocus(current, 'vertical')
  }

  function onDirection(direction: 'up' | 'down' | 'left' | 'right') {
    if (selectorOpen) {
      if (direction === 'up') setSelectorIndex((index) => Math.max(index - 1, 0))
      if (direction === 'down') setSelectorIndex((index) => Math.min(index + 1, entries.length - 1))
      return
    }
    if (activeZone === 'bar') {
      if (bodyState === 'grid') {
        if (direction === 'down') setZone('grid')
        else if (direction === 'right') setBarIndex((index) => Math.min(index + 1, barItems.length - 1))
        else if (direction === 'left') setBarIndex((index) => Math.max(index - 1, 0))
        return
      }
      // Estados especiais: só o seletor e (se houver) a ação do estado.
      if (direction === 'down' || direction === 'right') setBarIndex((index) => Math.min(index + 1, barItems.length - 1))
      else setBarIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (!resolved) return
    if (direction === 'left' || direction === 'right') {
      applyFocus(moveHorizontal(resolved.row, resolved.focus, direction), 'horizontal')
      return
    }
    const moved = moveVertical(rows, resolved.focus, refTime, direction)
    if (moved) applyFocus(moved, 'vertical')
    else if (direction === 'up') setZone('bar')
  }

  function onSelect() {
    if (selectorOpen) {
      chooseEntry(selectorIndex)
      return
    }
    if (activeZone === 'bar') {
      if (barFocus === 'selector') openSelector()
      else if (barFocus === 'today' || barFocus === 'tomorrow') jumpTo(barFocus === 'today' ? 'today' : 'tomorrow')
      else stateAction?.run()
      return
    }
    if (!resolved || !focusedChannel) return
    if (!focusedChannel.playable) {
      onNotify?.('Este canal não tem uma fonte de reprodução disponível.')
      return
    }
    if (focusedProgram && focusedProgram.end <= now) {
      onNotify?.('Este programa já terminou.')
      return
    }
    onWatch(focusedChannel, items, list)
  }

  function onBack() {
    if (selectorOpen) {
      setSelectorOpen(false)
      return
    }
    onClose()
  }

  useImperativeHandle(handleRef, () => ({
    onDirection,
    onSelect,
    onBack,
    onPage,
  }))

  // ---- Desenho ----
  const barSelectorFocused = activeZone === 'bar' && barFocus === 'selector' && !selectorOpen
  const actionFocused = activeZone === 'bar' && barFocus === 'action' && !selectorOpen
  const activeDay = dayOfTime(refTime, now)
  const dayTabFocused = (day: GuideDay) => activeZone === 'bar' && barFocus === day && !selectorOpen

  function renderDetail(): ReactNode {
    if (!resolved || !focusedChannel) return null
    const isNow = focusedProgram !== undefined && focusedProgram.start <= now && now < focusedProgram.end
    return (
      <div className="epg-guide-detail">
        {focusedProgram ? (
          <>
            <div className="epg-guide-detail-head">
              {isNow && <span className="epg-guide-detail-now">Agora</span>}
              <span>{formatEpgTimeRange(focusedProgram.start, focusedProgram.end)}</span>
            </div>
            <h2 className="epg-guide-detail-title">{focusedProgram.title}</h2>
            {focusedProgram.description && <p className="epg-guide-detail-description">{focusedProgram.description}</p>}
          </>
        ) : (
          <h2 className="epg-guide-detail-title">Sem programação</h2>
        )}
        <span className="epg-guide-detail-channel">{focusedChannel.name}</span>
      </div>
    )
  }

  function renderRow(index: number, top: number): ReactNode {
    const row = rows[index]
    const channel = items[index]
    if (!row || !channel) return null
    const number = channelNumberOf(channel, categories)
    return (
      <div key={row.channelId} className="epg-guide-row" style={{ transform: `translateY(${top}px)` }}>
        <div className={`epg-guide-channel${channel.playable ? '' : ' is-unavailable'}`}>
          {number && <span className="epg-guide-channel-number">{number}</span>}
          <PosterArt url={channel.icon_url ?? undefined} title={channel.name} variant="logo" />
          <span className="epg-guide-channel-name">{channel.name}</span>
          {!channel.playable && <span className="epg-guide-channel-badge">Indisponível</span>}
        </div>
        <div className="epg-guide-timeline">
          {row.programs.length === 0 ? (
            <div
              className={`epg-guide-block is-empty no-scale${
                activeZone === 'grid' && !selectorOpen && resolved?.focus.channelId === row.channelId ? ' tv-focus' : ''
              }`}
              role="button"
            >
              Sem programação
            </div>
          ) : (
            blocksInView(row, displayView).map((block) => {
              const isNow = block.program.start <= now && now < block.program.end
              const isPast = block.program.end <= now
              const isFocused =
                activeZone === 'grid' &&
                !selectorOpen &&
                resolved?.focus.channelId === row.channelId &&
                resolved.focus.programStart === block.program.start
              return (
                <div
                  key={block.program.start}
                  role="button"
                  aria-disabled={isPast ? 'true' : undefined}
                  className={`epg-guide-block no-scale${isNow ? ' is-now' : ''}${isPast ? ' is-past' : ''}${isFocused ? ' tv-focus' : ''}`}
                  style={{ left: `${block.leftPct}%`, width: `${block.widthPct}%` }}
                >
                  {isNow && <span className="epg-guide-block-tag">Agora</span>}
                  <span>{block.program.title}</span>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  function renderGrid(): ReactNode {
    const ticks = tickTimes(displayView)
    const nowPct = ((now - displayView.viewStart) / displayView.spanMs) * 100
    return (
      <div className="epg-guide-grid">
        <div className="epg-guide-header">
          <div className="epg-guide-corner" />
          <div className="epg-guide-ticks">
            {ticks.map((tick) => (
              <span key={tick} className="epg-guide-tick" style={{ left: `${((tick - displayView.viewStart) / displayView.spanMs) * 100}%` }}>
                {formatEpgClock(tick)}
              </span>
            ))}
          </div>
        </div>
        <div className="epg-guide-body-wrap">
          <div ref={scrollRef} className="epg-guide-body no-scrollbar">
            <div className="epg-guide-rows" style={{ height: rowVirtualizer.getTotalSize() }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => renderRow(virtualRow.index, virtualRow.start))}
            </div>
          </div>
          <div className="epg-guide-overlay">
            {nowPct >= 0 && nowPct <= 100 && <div className="epg-guide-now-line" style={{ left: `${nowPct}%` }} />}
          </div>
        </div>
      </div>
    )
  }

  function renderBody(): ReactNode {
    switch (bodyState) {
      case 'loading':
        return (
          <div className="epg-guide-state">
            <Spinner size={48} />
            <p className="epg-guide-state-text">Carregando canais…</p>
          </div>
        )
      case 'error':
        return (
          <div className="epg-guide-state">
            <ErrorState
              title="Não foi possível carregar os canais desta lista."
              actions={[{ label: 'Tentar de novo', onSelect: retry }]}
              focusedActionIndex={actionFocused ? 0 : undefined}
            />
          </div>
        )
      case 'empty':
        return (
          <div className="epg-guide-state">
            <EmptyState
              title={list.kind === 'favorites' ? 'Nenhum canal favorito ainda' : 'Nenhum canal nesta lista'}
              description={list.kind === 'favorites' ? 'Segure OK num canal da Live TV para favoritar.' : 'Escolha outra lista.'}
              action={{ label: 'Trocar lista', onSelect: openSelector }}
              focused={actionFocused}
            />
          </div>
        )
      case 'explain':
        return (
          <div className="epg-guide-state">
            <h2 className="epg-guide-state-title">Sem programação</h2>
            <p className="epg-guide-state-text">{EXPLAIN_TEXT[explainReason ?? 'error']}</p>
            {onOpenEpgSettings && (
              <button type="button" className={`button-secondary no-scale${actionFocused ? ' tv-focus' : ''}`} onClick={onOpenEpgSettings}>
                Configurar EPG
              </button>
            )}
          </div>
        )
      default:
        return renderGrid()
    }
  }

  return (
    <div className="epg-guide" role="region" aria-label="Guia de programação">
      <div className="epg-guide-bar">
        <h1 className="epg-guide-title">Guia de programação</h1>
        <button type="button" className={`epg-guide-selector no-scale${barSelectorFocused ? ' tv-focus' : ''}`} onClick={openSelector}>
          {listLabel}
        </button>
        {bodyState === 'grid' && (
          <div className="epg-guide-tabs" role="tablist" aria-label="Dia">
            {(['today', 'tomorrow'] as const).map((day) => (
              <button
                key={day}
                type="button"
                role="tab"
                aria-selected={activeDay === day}
                className={`epg-guide-tab no-scale${activeDay === day ? ' is-active' : ''}${dayTabFocused(day) ? ' tv-focus' : ''}`}
                onClick={() => jumpTo(day)}
              >
                {day === 'today' ? 'Hoje' : 'Amanhã'}
              </button>
            ))}
          </div>
        )}
        {list.kind === 'all' && bodyState === 'grid' && (
          <span className="epg-guide-coverage">
            Guia de {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
          </span>
        )}
      </div>

      {bodyState === 'grid' && renderDetail()}
      {renderBody()}

      {selectorOpen && (
        <div className="epg-guide-selector-panel" role="listbox" aria-label="Escolher lista">
          {entries.map((entry, index) => {
            const isFocused = index === selectorIndex
            const isCurrent = sameList(entry.key, list)
            return (
              <button
                key={entry.label}
                ref={isFocused ? selectorEntryRef : undefined}
                type="button"
                role="option"
                aria-selected={isCurrent}
                className={`epg-guide-selector-entry no-scale${isCurrent ? ' is-current' : ''}${isFocused ? ' tv-focus' : ''}`}
                onClick={() => chooseEntry(index)}
              >
                {entry.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
