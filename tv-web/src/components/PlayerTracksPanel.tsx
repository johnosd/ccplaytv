import { useEffect, useRef } from 'react'
import { useT } from '../lib/i18n/I18nProvider'
import type { TracksPanelModel, TracksRow } from './playerPanels'

export interface PlayerTracksPanelProps {
  model: TracksPanelModel
  /** Chave da linha focada (estado do `PlayerLayer`, ADR-009) — nunca foco DOM. */
  focusedKey: string
}

/**
 * Painel "Áudio e legendas" (feature 029, `logic/faixas-e-legendas.md` §3) —
 * desenho puro. Vive DENTRO do `.player-overlay` com o visual do `Modal`
 * (D-002): o `PlayerLayer` já intercepta o teclado antes de qualquer filho,
 * então um `Modal` aqui nunca receberia tecla. Quem decide o foco e o que o
 * SELECT faz é o `PlayerLayer`.
 */
export function PlayerTracksPanel({ model, focusedKey }: PlayerTracksPanelProps) {
  const t = useT()
  const focusedRef = useRef<HTMLButtonElement | null>(null)

  // A linha focada precisa estar à vista: o painel rola sozinho, sem barra
  // nativa (D-pad apenas). `?.` porque jsdom não implementa `scrollIntoView`.
  useEffect(() => {
    focusedRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [focusedKey])

  function renderRow(row: TracksRow, role: 'radio' | 'button' | 'action') {
    const focused = row.key === focusedKey
    // `action` (feature 090): botão comum, sem estado de marcado — "Buscar legenda online".
    const stateProps =
      role === 'radio'
        ? { role: 'radio' as const, 'aria-checked': row.checked }
        : role === 'button'
          ? { 'aria-pressed': row.checked }
          : {}
    return (
      <button
        key={row.key}
        ref={focused ? focusedRef : undefined}
        type="button"
        className={`player-panel-row${focused ? ' tv-focus' : ''}${row.disabled ? ' is-soft-disabled' : ''}${
          row.checked ? ' is-selected' : ''
        }`}
        aria-disabled={row.disabled ? 'true' : undefined}
        {...stateProps}
      >
        <span className="player-panel-row-mark" aria-hidden="true">
          {row.checked ? '●' : '○'}
        </span>
        <span>{row.label}</span>
      </button>
    )
  }

  /** Ajuste da legenda externa (feature 090, `logic/legenda-externa.md` §4.1): ←/→ mudam, OK zera. */
  function renderExternalDelay(row: TracksRow) {
    const focused = row.key === focusedKey
    return (
      <button
        key={row.key}
        ref={focused ? focusedRef : undefined}
        type="button"
        role="slider"
        aria-label={t('player.tracks.sync')}
        aria-valuemin={-10_000}
        aria-valuemax={10_000}
        aria-valuenow={row.delayMs ?? 0}
        aria-valuetext={row.label}
        className={`player-panel-row${focused ? ' tv-focus' : ''}`}
      >
        <span>{row.label}</span>
        <span className="player-panel-row-hint" aria-hidden="true">
          {t('subtitles.syncHint')}
        </span>
      </button>
    )
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel player-panel no-scrollbar" role="dialog" aria-modal="true" aria-label={t('player.tracks.title')}>
        <h2 className="modal-title">{t('player.tracks.title')}</h2>

        <h3 className="player-panel-heading">{t('player.tracks.audio')}</h3>
        <div role="radiogroup" aria-label={t('player.tracks.audio')} className="player-panel-group">
          {model.audioRows.map((row) => renderRow(row, 'radio'))}
        </div>
        {model.noAudioNote && <p className="player-panel-note">{model.noAudioNote}</p>}
        {renderRow(model.adRow, 'button')}

        <h3 className="player-panel-heading">{t('player.tracks.subtitles')}</h3>
        <div role="radiogroup" aria-label={t('player.tracks.subtitles')} className="player-panel-group">
          {model.textRows.map((row) => renderRow(row, 'radio'))}
        </div>
        {model.noTextNote && <p className="player-panel-note">{model.noTextNote}</p>}
        {model.externalSearchRow && renderRow(model.externalSearchRow, 'action')}

        {model.delayRows[0]?.key === 'delay:external' ? (
          <>
            <h3 className="player-panel-heading">{t('player.tracks.sync')}</h3>
            {renderExternalDelay(model.delayRows[0])}
          </>
        ) : model.delayRows.length > 0 && (
          <>
            <h3 className="player-panel-heading">{t('player.tracks.sync')}</h3>
            <div role="radiogroup" aria-label={t('player.tracks.sync')} className="player-panel-group">
              {model.delayRows.map((row) => renderRow(row, 'radio'))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
