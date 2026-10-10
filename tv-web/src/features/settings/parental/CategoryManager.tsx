import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { CategoryKind } from '../../../lib/catalog/db'
import { useT } from '../../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../../lib/i18n/messages/pt'
import { controlActions, managedKeyOf, PARENTAL_SECTIONS, sameParentalFocus, type ManagedCategory, type ParentalControlAction, type ParentalFocus } from './parentalModel'

const SECTION_LABEL: Record<CategoryKind, MessageKey> = {
  channel: 'parental.section.channel',
  movie: 'parental.section.movie',
  series: 'parental.section.series',
}

export interface CategoryManagerProps {
  section: CategoryKind
  /** `undefined` enquanto lê. */
  categories: ManagedCategory[] | undefined
  failed: boolean
  pinActive: boolean
  /** Com PIN e a aba ainda não liberada: só o pedido de PIN (FR-017). */
  gated: boolean
  /** `undefined` = a aba não tem o foco agora (zona `tabs`). */
  focus?: ParentalFocus
  onOpenGate: () => void
  onControl: (action: ParentalControlAction) => void
  onSelectSection: (section: CategoryKind) => void
  onToggleHidden: (category: ManagedCategory) => void
  onToggleLocked: (category: ManagedCategory) => void
  onRetry: () => void
}


/**
 * Gestão de categorias (feature 066, FR-002): controle parental, seções Canais/Filmes/Séries e, por categoria,
 * Visível/Escondida e Livre/Bloqueada. Nomes e ordem são os da lista (FR-033); nome ausente vira "Sem categoria".
 */
export function CategoryManager(props: CategoryManagerProps): ReactNode {
  const { section, categories, failed, pinActive, gated, focus } = props
  const t = useT()
  const focusedRef = useRef<HTMLButtonElement>(null)
  const focusKey = JSON.stringify(focus ?? null)

  useEffect(() => {
    focusedRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [focusKey])

  const on = (target: ParentalFocus) => sameParentalFocus(focus, target)
  const focusClass = (target: ParentalFocus) => (on(target) ? ' tv-focus' : '')

  if (gated) {
    return (
      <div className="parental-panel">
        <h2 className="parental-panel-heading">{t('parental.tab.title')}</h2>
        <p className="parental-panel-note">{t('parental.tab.gate')}</p>
        <button type="button" ref={on({ row: 'gate' }) ? focusedRef : undefined} className={`button-secondary parental-gate-button${focusClass({ row: 'gate' })}`} onClick={props.onOpenGate}>
          {t('parental.tab.gateAction')}
        </button>
      </div>
    )
  }

  return (
    <div className="parental-panel">
      <h2 className="parental-panel-heading">{t('parental.tab.title')}</h2>
      <p className="parental-panel-note">{t('parental.tab.subtitle')}</p>
      <div className="parental-control">
        {controlActions(pinActive).map((action, col) => {
          const target: ParentalFocus = { row: 'control', col }
          const ref = on(target) ? focusedRef : undefined
          if (action === 'change') {
            return (
              <button key={action} type="button" ref={ref} className={`button-secondary${focusClass(target)}`} onClick={() => props.onControl(action)}>
                {t('parental.control.changePin')}
              </button>
            )
          }
          // O interruptor: mostra o estado e alterna (ligar cria o PIN; desligar pede o PIN).
          const state = t(pinActive ? 'parental.control.stateOn' : 'parental.control.stateOff')
          return (
            <button
              key={action}
              type="button"
              ref={ref}
              className={`parental-toggle parental-control-toggle no-scale${pinActive ? ' is-on' : ''}${focusClass(target)}`}
              aria-pressed={pinActive}
              aria-label={`${t('parental.control.label')}: ${state}`}
              onClick={() => props.onControl(action)}
            >
              <span>{t('parental.control.label')}</span>
              <span className="parental-control-state">{state}</span>
            </button>
          )
        })}
      </div>
      <div className="parental-sections" role="tablist">
        {PARENTAL_SECTIONS.map((kind, col) => {
          const target: ParentalFocus = { row: 'sections', col }
          return (
            <button
              key={kind}
              ref={on(target) ? focusedRef : undefined}
              type="button"
              role="tab"
              aria-selected={kind === section}
              className={`chip${kind === section ? ' chip-selected' : ''}${focusClass(target)}`}
              onClick={() => props.onSelectSection(kind)}
            >
              {t(SECTION_LABEL[kind])}
            </button>
          )
        })}
      </div>
      {failed ? (
        <div className="parental-state">
          <p>{t('parental.error')}</p>
          <button type="button" ref={on({ row: 'retry' }) ? focusedRef : undefined} className={`button-secondary${focusClass({ row: 'retry' })}`} onClick={props.onRetry}>
            {t('parental.retry')}
          </button>
        </div>
      ) : categories === undefined ? (
        <p className="parental-state" role="status">{t('parental.loading')}</p>
      ) : categories.length === 0 ? (
        <p className="parental-state">{t('parental.empty')}</p>
      ) : (
        <ul className="parental-list">
          {categories.map((category) => {
            const key = managedKeyOf(category)
            const name = category.name?.trim() || t('live.ungrouped')
            const visibility = t(category.hidden ? 'parental.row.hidden' : 'parental.row.visible')
            const lock = t(category.locked ? 'parental.row.locked' : 'parental.row.free')
            const hiddenCell: ParentalFocus = { row: 'category', key, col: 0 }
            const lockCell: ParentalFocus = { row: 'category', key, col: 1 }
            return (
              <li key={key} className={`parental-row${category.hidden ? ' is-hidden' : ''}`}>
                <span className="parental-row-name">{name}</span>
                {category.suggested && !category.locked && <span className="parental-row-tag">{t('parental.row.suggested')}</span>}
                <button
                  ref={on(hiddenCell) ? focusedRef : undefined}
                  type="button"
                  className={`parental-toggle no-scale${category.hidden ? '' : ' is-on'}${focusClass(hiddenCell)}`}
                  aria-pressed={!category.hidden}
                  aria-label={`${name}: ${visibility}`}
                  onClick={() => props.onToggleHidden(category)}
                >
                  {visibility}
                </button>
                <button
                  ref={on(lockCell) ? focusedRef : undefined}
                  type="button"
                  className={`parental-toggle no-scale${category.locked ? ' is-on is-locked' : ''}${focusClass(lockCell)}`}
                  aria-pressed={category.locked}
                  aria-label={`${name}: ${lock}`}
                  onClick={() => props.onToggleLocked(category)}
                >
                  {lock}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
