import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { ContentCard } from '../../components/ContentCard'
import type { KindCoverage, ResolvedTitle, SimilarTabStatus } from '../../lib/metadata/types'
import { OriginTag } from './DetailMetadata'
import { splitSimilar } from './detailPanelGrid'
import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import type { Translator } from '../../lib/i18n/translate'

/** Chaves do catálogo (feature 054): "Não encontrado na sua lista" e o marcador dos títulos que existem na lista. */
export const NOT_FOUND_KEY = 'detail.notFound'
export const FOUND_KEY = 'detail.found'

/** Textos exatos de `logic/aba-semelhantes.md` §2 (em pt, no catálogo) — alguns contratos dependem deles. */
const STATE_TEXT_KEY: Record<Exclude<SimilarTabStatus, 'ready'>, MessageKey> = {
  loading: 'detail.similar.loading',
  no_key: 'detail.similar.no_key',
  no_match: 'detail.similar.no_match',
  empty: 'detail.similar.empty',
  unavailable: 'detail.similar.unavailable',
}

export interface SimilarPanelProps {
  status: SimilarTabStatus
  titles: ResolvedTitle[]
  coverage?: KindCoverage
  /** Tipo do título de origem — decide "filmes"/"séries" na cobertura. */
  kind: 'movie' | 'series'
  /** Chave do cartão focado (`tmdb:<kind>:<id>`); ausente = foco não está no painel. */
  focusedKey?: string
  /** "Configurar TMDB" está focado (só em `no_key`). */
  configureFocused: boolean
  onSelectTitle: (title: ResolvedTitle) => void
  onConfigure: () => void
}

function coverageText(coverage: KindCoverage, kind: 'movie' | 'series', t: Translator): string {
  return t(kind === 'movie' ? 'detail.similar.coverageMovies' : 'detail.similar.coverageSeries', {
    covered: coverage.covered,
    total: coverage.total,
  })
}

/**
 * Painel da aba Semelhantes (feature 035, US1/US2). Só apresentação: os
 * estados e a lista chegam de `useSimilarTitles`. Sem cartão o foco continua
 * na fileira de abas; `Configurar TMDB` é o único focável extra (`no_key`).
 */
export function SimilarPanel({
  status,
  titles,
  coverage,
  kind,
  focusedKey,
  configureFocused,
  onSelectTitle,
  onConfigure,
}: SimilarPanelProps): ReactNode {
  const t = useT()
  if (status !== 'ready') {
    return (
      <div className="similar-panel" aria-live="polite">
        {coverage !== undefined && status === 'empty' && <p className="similar-coverage">{coverageText(coverage, kind, t)}</p>}
        <p className="similar-state">{t(STATE_TEXT_KEY[status])}</p>
        {status === 'no_key' && (
          <button
            type="button"
            className={`button-secondary${configureFocused ? ' tv-focus' : ''}`}
            onClick={onConfigure}
          >
            {t('detail.similar.configure')}
          </button>
        )}
      </div>
    )
  }

  // Feature 059 (D-007, `logic/semelhantes-duas-linhas.md` §1): o que já está na
  // lista e o que só o TMDB conhece, em duas linhas tituladas. A 1ª nunca some
  // (vazia, vira uma frase NÃO focável); a 2ª só existe com algum título.
  const { found, missing } = splitSimilar(titles)
  return (
    <div className="similar-panel">
      {coverage !== undefined && <p className="similar-coverage">{coverageText(coverage, kind, t)}</p>}
      <section className="similar-section" aria-label={t('person.inList')}>
        <h3 className="similar-section-title">{t('person.inList')}</h3>
        {found.length > 0 ? (
          <SimilarRow titles={found} focusedKey={focusedKey} onSelectTitle={onSelectTitle} />
        ) : (
          <p className="similar-empty">{t('detail.similar.noneInList')}</p>
        )}
      </section>
      {missing.length > 0 && (
        <section className="similar-section similar-section--missing" aria-label={t('detail.similar.missingRow')}>
          <h3 className="similar-section-title">{t('detail.similar.missingRow')}</h3>
          <SimilarRow titles={missing} focusedKey={focusedKey} onSelectTitle={onSelectTitle} />
        </section>
      )}
      <OriginTag origin="tmdb" />
    </div>
  )
}

/**
 * Fileira horizontal simples (no máximo 20 cartões, D-004): sem virtualização,
 * porque a lista é curta e o `Rail` mede layout — os cartões precisam existir
 * no DOM mesmo sem layout. O cartão focado é trazido à vista por rolagem.
 */
function SimilarRow({
  titles,
  focusedKey,
  onSelectTitle,
}: {
  titles: ResolvedTitle[]
  focusedKey: string | undefined
  onSelectTitle: (title: ResolvedTitle) => void
}): ReactNode {
  const t = useT()
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusedKey === undefined) return
    const cards = rowRef.current?.querySelectorAll<HTMLElement>('[data-similar-key]')
    for (const card of cards ?? []) {
      if (card.dataset.similarKey === focusedKey) card.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    }
  }, [focusedKey])

  return (
    <div ref={rowRef} className="similar-row no-scrollbar">
      {titles.map((title) => (
        <div key={title.key} className="similar-card" data-similar-key={title.key}>
          <ContentCard
            variant="portrait"
            title={title.title}
            meta={title.year !== undefined ? String(title.year) : undefined}
            iconUrl={title.posterUrl}
            focused={focusedKey === title.key}
            // Feature 059 (D-007): sem selo visível — o título da linha já diz. O não
            // encontrado guarda o texto como nome acessível (e o contrato da 035 o conta).
            badge={title.localItemId === undefined ? <span className="sr-only">{t(NOT_FOUND_KEY)}</span> : undefined}
            onSelect={() => onSelectTitle(title)}
          />
        </div>
      ))}
    </div>
  )
}
