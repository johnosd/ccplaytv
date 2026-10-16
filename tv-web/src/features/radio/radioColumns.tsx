import type { ReactNode, Ref } from 'react'
import { Button } from '../../components/Button'
import { ChannelRow } from '../../components/ChannelRow'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import type { HintItem } from '../../components/HintBar'
import { SideCategoryNav } from '../../components/SideCategoryNav'
import type { AppLanguage } from '../../lib/i18n/languages'
import type { Translator } from '../../lib/i18n/translate'
import { countryDisplayName } from '../../lib/radio/countryNames'
import type { RadioStation } from '../../lib/radio/radioTypes'
import type { RadioCatalog } from './useRadioCatalog'
import type { RadioFocus } from './useRadioKeyboard'
import type { RadioPlaybackState } from './useRadioPlayback'

/**
 * Desenho da Rádio (feature 074, `logic/radio-tela.md` §2) — funções, não componentes, pelo mesmo motivo de
 * `liveColumns.tsx`: um componente novo seria uma fronteira de reconciliação que perderia refs e rolagem.
 */

export interface RadioColumnsModel {
  catalog: RadioCatalog
  focus: RadioFocus
  playback: RadioPlaybackState
  favoriteIds: ReadonlySet<string>
  language: AppLanguage
  t: Translator
  trailFocusRef: Ref<HTMLButtonElement>
  listFocusRef: Ref<HTMLDivElement>
  trailRef: Ref<HTMLDivElement>
  listRef: Ref<HTMLDivElement>
}

export function radioHints(t: Translator, zone: RadioFocus['zone']): HintItem[] {
  if (zone === 'trail') {
    return [
      { keyLabel: 'OK', action: t('radio.hint.enter') },
      { keyLabel: '← →', action: t('radio.hint.page') },
      { keyLabel: 'RETURN', action: t('common.back') },
    ]
  }
  return [
    { keyLabel: 'OK', action: t('radio.hint.play') },
    { keyLabel: '← →', action: t('radio.hint.page') },
    { keyLabel: t('radio.hint.holdOk'), action: t('radio.hint.favorite') },
    { keyLabel: 'RETURN', action: t('common.back') },
  ]
}

/** Recorte visível acima da lista (D-010): cobertura parcial nunca parece o catálogo completo. */
function scopeLine(model: RadioColumnsModel, shown: number): string {
  const { catalog, t } = model
  const entry = catalog.entered
  if (entry === 'favorites') return t.plural('radio.scope.favorites', shown)
  if (entry === 'world') return t('radio.scope.world', { shown })
  const total = catalog.totalOf(entry)
  return total !== undefined ? t('radio.scope.country', { shown, total }) : t('radio.stations')
}

function stationRow(model: RadioColumnsModel, station: RadioStation, index: number): ReactNode {
  const { focus, playback, favoriteIds, language, catalog, listFocusRef } = model
  const focused = focus.zone === 'list' && index === focus.listIndex
  const playing = playback.status !== 'idle' && playback.station.id === station.id
  const showCountry = catalog.entered !== `country:${station.countryCode}`
  return (
    <div
      key={station.id}
      ref={focused ? listFocusRef : undefined}
      className={`radio-station${focused ? ' tv-focus' : ''}${playing ? ' is-playing' : ''}`}
      onClick={() => focus.selectStation(station)}
    >
      <ChannelRow
        logoUrl={station.artUrl}
        name={station.name}
        nowPlaying={station.tags.slice(0, 2).join(' · ') || undefined}
        group={showCountry && station.countryCode ? countryDisplayName(station.countryCode, language) : undefined}
        focused={focused}
        favorite={favoriteIds.has(station.id)}
      />
    </div>
  )
}

function stationsBody(model: RadioColumnsModel): ReactNode {
  const { catalog, focus, t } = model
  const { state } = catalog
  const stateFocused = (index: number) => focus.zone === 'list' && focus.stateAction === index
  const back = { label: t('common.back'), onSelect: () => undefined }

  if (state.entry !== catalog.entered || state.status === 'loading') {
    return <EmptyState title={t('radio.loading')} action={back} focused={stateFocused(0)} />
  }
  if (state.status === 'error') {
    return (
      <ErrorState
        title={state.failure === 'offline' ? t('radio.offline') : t('radio.error')}
        actions={[
          { label: t('common.retry'), onSelect: () => catalog.enter(catalog.entered) },
          { label: t('common.back'), onSelect: () => undefined },
        ]}
        focusedActionIndex={focus.zone === 'list' ? focus.stateAction : undefined}
      />
    )
  }
  if (focus.stations.length === 0) {
    return catalog.entered === 'favorites' ? (
      <EmptyState title={t('radio.favoritesEmpty')} description={t('radio.favoritesHint')} action={back} focused={stateFocused(0)} />
    ) : (
      <EmptyState title={t('radio.empty')} action={back} focused={stateFocused(0)} />
    )
  }
  return <div className="radio-list">{focus.stations.map((station, index) => stationRow(model, station, index))}</div>
}

export function renderRadioColumns(model: RadioColumnsModel): ReactNode {
  const { catalog, focus, t, trailFocusRef, trailRef, listRef } = model
  const shown = focus.stations.length
  return (
    <div className="radio-body">
      <nav className="radio-column radio-column-trail" aria-label={t('radio.trail')}>
        <div ref={trailRef} className="radio-scroll">
          <SideCategoryNav
            entries={catalog.trail.map((entry) => ({
              id: entry.id,
              label: entry.label,
              count: entry.count,
              pinned: entry.kind === 'favorites' || entry.kind === 'world',
              pinnedBadge: false,
            }))}
            selectedId={catalog.entered}
            focusedId={focus.zone === 'trail' ? focus.trailFocusId : undefined}
            onSelect={(id) => {
              const entry = catalog.trail.find((item) => item.id === id)
              if (entry?.key) focus.enterEntry(entry.key)
            }}
            focusedRef={trailFocusRef}
          />
        </div>
      </nav>
      <section className="radio-column radio-column-stations" aria-label={t('radio.stations')}>
        <div className="radio-column-head">{scopeLine(model, shown)}</div>
        {catalog.state.stale && (
          <div className="radio-notice">
            <span>{t('radio.stale')}</span>
            <Button variant="ghost" focused={focus.noticeFocused} onSelect={() => catalog.enter(catalog.entered)}>
              {t('common.retry')}
            </Button>
          </div>
        )}
        <div ref={listRef} className="radio-scroll">
          {stationsBody(model)}
        </div>
      </section>
    </div>
  )
}
