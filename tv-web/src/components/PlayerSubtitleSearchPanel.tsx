import { useEffect, useRef } from 'react'
import { useT } from '../lib/i18n/I18nProvider'
import type { SubtitleLanguage } from '../lib/subtitles/types'
import type { SearchPanelModel, SearchRow } from './player/subtitleSearchModel'

export interface PlayerSubtitleSearchPanelProps {
  model: SearchPanelModel
  /** Idioma da busca atual (marcado no grupo Idioma). */
  language: SubtitleLanguage
  /** Chave focada (estado do `PlayerLayer`, ADR-009) — nunca foco DOM. */
  focusedKey: string
}

/**
 * Diálogo "Buscar legenda online" (feature 090, `logic/legenda-externa.md` §5.2) — desenho puro, no mesmo molde do
 * `PlayerTracksPanel`: vive dentro do `.player-overlay`, e quem decide foco e SELECT é o `PlayerLayer`. Todo estado
 * (buscando, vazio, erro) tem uma linha focável.
 */
export function PlayerSubtitleSearchPanel({ model, language, focusedKey }: PlayerSubtitleSearchPanelProps) {
  const t = useT()
  const focusedRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    focusedRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [focusedKey])

  /** `checked` só nos idiomas: marca "●/○" além da cor (o estado nunca só por cor). */
  function renderRow(row: SearchRow, checked?: boolean) {
    const focused = row.key === focusedKey
    const radio = checked === undefined ? {} : { role: 'radio' as const, 'aria-checked': checked }
    return (
      <button
        key={row.key}
        ref={focused ? focusedRef : undefined}
        type="button"
        className={`player-panel-row${focused ? ' tv-focus' : ''}${checked ? ' is-selected' : ''}`}
        {...radio}
      >
        {checked !== undefined && (
          <span className="player-panel-row-mark" aria-hidden="true">
            {checked ? '●' : '○'}
          </span>
        )}
        <span>{row.label}</span>
      </button>
    )
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel player-panel no-scrollbar" role="dialog" aria-modal="true" aria-label={t('subtitles.search')}>
        <h2 className="modal-title">{t('subtitles.search')}</h2>

        <div role="radiogroup" aria-label={t('subtitles.language')} className="player-panel-group player-panel-group--inline">
          {model.languages.map((row) => renderRow(row, row.language === language))}
        </div>

        {model.notes.map((note) => (
          <p key={note} className="player-panel-note">
            {note}
          </p>
        ))}
        {model.message && (
          <p className="player-panel-note" role="status">
            {model.message}
          </p>
        )}

        <div className="player-panel-group">{model.items.map((row) => renderRow(row))}</div>
      </div>
    </div>
  )
}
