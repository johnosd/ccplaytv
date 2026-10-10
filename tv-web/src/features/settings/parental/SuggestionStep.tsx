import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '../../../components/Modal'
import { listManagedCategories } from '../../../lib/catalog/categoryAccess'
import type { CategoryKind } from '../../../lib/catalog/db'
import { useT } from '../../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../../lib/i18n/messages/pt'
import { managedKeyOf, PARENTAL_SECTIONS, type ManagedCategory } from './parentalModel'

const SECTION_LABEL: Record<CategoryKind, MessageKey> = {
  channel: 'parental.section.channel',
  movie: 'parental.section.movie',
  series: 'parental.section.series',
}

/** Uma categoria sugerida e se a pessoa a manteve marcada para bloquear. */
export interface SuggestionDecision {
  category: ManagedCategory
  locked: boolean
}

export interface SuggestionStepProps {
  sourceId: string
  /** Confirmado: as decisões (marcadas → bloquear; desmarcadas → recusa lembrada, FR-024). */
  onConfirm: (decisions: SuggestionDecision[]) => void
  onCancel: () => void
}

/**
 * Sugestão de categorias adultas ao ligar o controle parental (feature 066, US3 — FR-022, FR-024, FR-026): as de nome
 * adulto de todas as seções da lista ativa vêm marcadas; a pessoa desmarca e confirma. Nada é gravado aqui — quem chama
 * grava tudo junto com o PIN (D-007). Sem nenhuma, diz que não achou, com "Confirmar" focado.
 */
export function SuggestionStep({ sourceId, onConfirm, onCancel }: SuggestionStepProps): ReactNode {
  const t = useT()
  const query = useQuery({
    queryKey: ['parental-suggestions', sourceId],
    queryFn: async () => (await Promise.all(PARENTAL_SECTIONS.map((kind) => listManagedCategories(sourceId, kind)))).flat().filter((category) => category.suggested),
  })
  const suggestions = query.data
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set())
  // Linhas = sugestões, e por último "Confirmar".
  const [row, setRow] = useState(0)
  const focusedRef = useRef<HTMLButtonElement>(null)
  const confirmRow = suggestions?.length ?? 0

  useEffect(() => {
    focusedRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [row])

  const keyOf = (category: ManagedCategory) => `${category.kind}|${managedKeyOf(category)}`
  const toggle = (category: ManagedCategory) =>
    setUnchecked((current) => {
      const next = new Set(current)
      if (!next.delete(keyOf(category))) next.add(keyOf(category))
      return next
    })
  const confirm = () => {
    if (suggestions) onConfirm(suggestions.map((category) => ({ category, locked: !unchecked.has(keyOf(category)) })))
  }

  return (
    <Modal
      ariaLabel={t('parental.suggest.title')}
      onBack={onCancel}
      onDirection={(direction) => {
        if (direction === 'up' || direction === 'down') setRow((current) => Math.min(Math.max(current + (direction === 'down' ? 1 : -1), 0), confirmRow))
      }}
      onSelect={() => {
        if (!suggestions) onCancel()
        else if (row === confirmRow) confirm()
        else toggle(suggestions[row])
      }}
    >
      <div className="parental-suggest">
        <p className="modal-title">{t('parental.suggest.title')}</p>
        {suggestions === undefined ? (
          <>
            <p className="modal-description" role="status">{t('parental.loading')}</p>
            <button type="button" className="button-secondary tv-focus" onClick={onCancel}>
              {t('parental.pin.cancel')}
            </button>
          </>
        ) : (
          <>
            <p className="modal-description">{t(suggestions.length === 0 ? 'parental.suggest.none' : 'parental.suggest.text')}</p>
            <ul className="parental-suggest-list">
              {suggestions.map((category, index) => {
                const name = category.name?.trim() || t('live.ungrouped')
                const checked = !unchecked.has(keyOf(category))
                return (
                  <li key={keyOf(category)}>
                    <button
                      ref={row === index ? focusedRef : undefined}
                      type="button"
                      className={`parental-suggest-row no-scale${row === index ? ' tv-focus' : ''}`}
                      aria-pressed={checked}
                      onClick={() => toggle(category)}
                    >
                      <span className="parental-suggest-check" aria-hidden="true">
                        {checked ? '✓' : ''}
                      </span>
                      <span className="parental-row-name">{name}</span>
                      <span className="parental-suggest-section">{t(SECTION_LABEL[category.kind])}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <button ref={row === confirmRow ? focusedRef : undefined} type="button" className={`button-accent${row === confirmRow ? ' tv-focus' : ''}`} onClick={confirm}>
              {t('parental.suggest.confirm')}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
