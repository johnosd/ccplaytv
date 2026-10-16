import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { measuredRowPitch, pagedIndex, pageSizeFor } from '../../lib/focus/paging'
import { locateOrNeighbor } from '../../lib/focus/reconcileFocus'
import type { RadioEntryKey, RadioStation } from '../../lib/radio/radioTypes'
import { useRemoteNav, type RemoteNavHandlers } from '../../lib/useRemoteNav'
import { nowPlayingActions, type NowPlayingAction } from './NowPlayingBar'
import { recalledRadioFocus, recalledRadioLastFocus, rememberRadioFocus } from './radioSessionMemory'
import type { RadioCatalog } from './useRadioCatalog'
import type { RadioPlayback } from './useRadioPlayback'

/**
 * Zonas de foco e teclas da Rádio (feature 074, `logic/radio-tela.md` §4). UM `useRemoteNav` (regra da 040). Foco é
 * estado (ADR-009): a lista guarda o `id` da estação focada e reconcilia por ele (FR-003), nunca por índice.
 */

export type RadioZone = 'bar' | 'trail' | 'list'

export interface RadioKeyboardModel {
  catalog: RadioCatalog
  playback: RadioPlayback
  onBack: () => void
  onToggleFavorite: (station: RadioStation) => void
  trailRef: RefObject<HTMLElement | null>
  listRef: RefObject<HTMLElement | null>
}

function pageSize(container: HTMLElement | null, selector: string): number {
  return pageSizeFor(container?.clientHeight ?? 0, measuredRowPitch(container, selector))
}

export function useRadioKeyboard({ catalog, playback, onBack, onToggleFavorite, trailRef, listRef }: RadioKeyboardModel) {
  const { trail, entered, state } = catalog
  const [zone, setZone] = useState<RadioZone>('list')
  const [previousZone, setPreviousZone] = useState<'trail' | 'list'>('list')
  const [trailFocusId, setTrailFocusId] = useState<string>(entered)
  const [listFocusId, setListFocusId] = useState<string | null>(() => recalledRadioFocus(entered)?.stationId ?? null)
  const [stateAction, setStateAction] = useState(0)
  const [barAction, setBarAction] = useState(0)
  /** "Tentar de novo" do aviso de dados vencidos, acima da 1ª estação (US3, FR-024). */
  const [noticeFocused, setNoticeFocused] = useState(false)

  const stations = state.entry === entered && state.status === 'ready' ? state.stations : []
  const listIndex = locateOrNeighbor(stations, (item) => item.id === listFocusId, entered, recalledRadioLastFocus(entered))
  const focusedStation = stations[listIndex]
  const trailIndex = Math.max(0, trail.findIndex((entry) => entry.id === trailFocusId))
  const barActions = nowPlayingActions(playback.state)
  /** Ações do estado da lista (carregando/vazio = Voltar; erro = Tentar de novo + Voltar). */
  const stateActions: ('retry' | 'back')[] =
    state.status === 'error' ? ['retry', 'back'] : stations.length === 0 ? ['back'] : []

  const focusStation = useCallback(
    (index: number) => {
      const station = stations[index]
      if (!station) return
      setListFocusId(station.id)
      rememberRadioFocus(entered, station.id, index)
    },
    [entered, stations],
  )

  const enterEntry = useCallback(
    (key: RadioEntryKey) => {
      catalog.enter(key)
      setTrailFocusId(key)
      setListFocusId(recalledRadioFocus(key)?.stationId ?? null)
      setStateAction(0)
      setNoticeFocused(false)
      setZone('list')
    },
    [catalog],
  )

  const toTrail = useCallback(() => {
    setNoticeFocused(false)
    setTrailFocusId(entered)
    setZone('trail')
  }, [entered])

  const toBar = useCallback(
    (from: 'trail' | 'list') => {
      if (barActions.length === 0) return
      setPreviousZone(from)
      setBarAction(0)
      setZone('bar')
    },
    [barActions.length],
  )

  /** OK numa estação (D-014). */
  const selectStation = useCallback(
    (station: RadioStation) => {
      const current = playback.state
      const same = current.status !== 'idle' && current.station.id === station.id
      if (same && (current.status === 'connecting' || current.status === 'playing')) playback.stop()
      else playback.play(station, { fromFavorites: entered === 'favorites' })
    },
    [entered, playback],
  )

  const nextStation = useCallback((): RadioStation | undefined => {
    const current = playback.state
    if (current.status !== 'failed') return undefined
    const index = stations.findIndex((item) => item.id === current.station.id)
    return index === -1 ? undefined : stations[index + 1]
  }, [playback.state, stations])

  const runBarAction = useCallback(
    (action: NowPlayingAction) => {
      const current = playback.state
      if (action === 'stop') playback.stop()
      else if (action === 'retry' && current.status === 'failed') playback.play(current.station, { fromFavorites: entered === 'favorites' })
      else if (action === 'next') {
        const next = nextStation()
        if (!next) return
        setListFocusId(next.id)
        playback.play(next, { fromFavorites: entered === 'favorites' })
      }
      setZone(previousZone)
    },
    [entered, nextStation, playback, previousZone],
  )

  const runStateAction = useCallback(() => {
    if (stateActions[stateAction] === 'retry') catalog.enter(entered)
    else toTrail()
  }, [catalog, entered, stateAction, stateActions, toTrail])

  const inList = zone === 'list' && stations.length > 0
  const onNotice = inList && noticeFocused && state.stale
  const favoriteTarget = inList && !onNotice ? focusedStation : undefined
  const handlers: Required<Pick<RemoteNavHandlers, 'onDirection' | 'onSelect' | 'onBack' | 'onMediaKey'>> &
    Pick<RemoteNavHandlers, 'onLongSelect' | 'onFavoriteKey'> = {
    onDirection: (direction) => {
      if (zone === 'bar') {
        if (direction === 'down') setZone(previousZone)
        else if (direction === 'left' || direction === 'right') {
          setBarAction((index) => Math.min(Math.max(index + (direction === 'right' ? 1 : -1), 0), barActions.length - 1))
        }
        return
      }
      if (zone === 'trail') {
        if (direction === 'up' && trailIndex === 0) return toBar('trail')
        const next =
          direction === 'up' || direction === 'down'
            ? Math.min(Math.max(trailIndex + (direction === 'down' ? 1 : -1), 0), trail.length - 1)
            : pagedIndex(trailIndex, trail.length, pageSize(trailRef.current, '.side-category-nav-item'), direction === 'right' ? 'next' : 'previous')
        if (next !== null && trail[next]) setTrailFocusId(trail[next].id)
        return
      }
      if (!inList) {
        if (direction === 'up' && stateAction === 0) return toBar('list')
        setStateAction((index) => Math.min(Math.max(index + (direction === 'down' || direction === 'right' ? 1 : -1), 0), Math.max(0, stateActions.length - 1)))
        return
      }
      if (onNotice) {
        if (direction === 'down') setNoticeFocused(false)
        else if (direction === 'up') toBar('list')
        return
      }
      if (direction === 'up' && listIndex === 0) return state.stale ? setNoticeFocused(true) : toBar('list')
      const next =
        direction === 'up' || direction === 'down'
          ? Math.min(Math.max(listIndex + (direction === 'down' ? 1 : -1), 0), stations.length - 1)
          : pagedIndex(listIndex, stations.length, pageSize(listRef.current, '.radio-station'), direction === 'right' ? 'next' : 'previous')
      if (next !== null) focusStation(next)
    },
    onSelect: () => {
      if (zone === 'bar') {
        const action = barActions[barAction]
        if (action) runBarAction(action)
        return
      }
      if (zone === 'trail') {
        const entry = trail[trailIndex]
        if (entry?.kind === 'retry-countries') void catalog.retryCountries()
        else if (entry?.key) enterEntry(entry.key)
        return
      }
      if (!inList) return runStateAction()
      if (onNotice) {
        setNoticeFocused(false)
        return catalog.enter(entered)
      }
      if (focusedStation) selectStation(focusedStation)
    },
    onLongSelect: favoriteTarget ? () => onToggleFavorite(favoriteTarget) : undefined,
    onFavoriteKey: favoriteTarget ? () => onToggleFavorite(favoriteTarget) : undefined,
    onBack: () => {
      if (zone === 'bar') setZone(previousZone)
      else if (zone === 'list') toTrail()
      else onBack()
    },
    onMediaKey: (key) => {
      if (key === 'MediaStop') playback.stop()
    },
  }

  // O `useRemoteNav` troca os handlers num efeito passivo, que pode rodar DEPOIS de o DOM já mostrar a lista nova: uma
  // tecla nesse intervalo veria a tela antiga. Os handlers abaixo são estáveis e leem o modelo da última renderização,
  // gravado no commit (`useLayoutEffect`). Segurar OK/amarela ficam sempre definidos e só agem na lista.
  const latest = useRef(handlers)
  useLayoutEffect(() => {
    latest.current = handlers
  })
  const stable = useMemo<RemoteNavHandlers>(
    () => ({
      onDirection: (direction) => latest.current.onDirection(direction),
      onSelect: () => latest.current.onSelect(),
      onLongSelect: () => latest.current.onLongSelect?.(),
      onFavoriteKey: () => latest.current.onFavoriteKey?.(),
      onBack: () => latest.current.onBack(),
      onMediaKey: (key) => latest.current.onMediaKey(key),
    }),
    [],
  )
  useRemoteNav(stable, {})

  return {
    zone,
    noticeFocused: onNotice,
    trailFocusId: trail[trailIndex]?.id,
    listIndex,
    focusedStation,
    stations,
    stateActions,
    stateAction,
    barAction: zone === 'bar' ? barAction : null,
    nextAvailable: nextStation() !== undefined,
    enterEntry,
    selectStation,
    runBarAction,
  }
}

export type RadioFocus = ReturnType<typeof useRadioKeyboard>
