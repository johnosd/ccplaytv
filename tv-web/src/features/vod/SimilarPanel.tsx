import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { ContentCard } from '../../components/ContentCard'
import type { KindCoverage, ResolvedTitle, SimilarTabStatus } from '../../lib/metadata/types'
import { OriginTag } from './DetailMetadata'

export const NOT_FOUND_LABEL = 'Não encontrado na sua lista'
/** Marcador dos títulos que existem na lista (pedido do usuário, 2026-09-30) — abrem o detalhe local. */
export const FOUND_LABEL = '✓ Na sua lista'

/** Textos exatos de `logic/aba-semelhantes.md` §2 — alguns contratos dependem deles. */
const STATE_TEXT: Record<Exclude<SimilarTabStatus, 'ready'>, string> = {
  loading: 'Buscando títulos semelhantes…',
  no_key: 'Semelhantes vêm do TMDB. Configure uma chave do TMDB para ver títulos parecidos com este.',
  no_match: 'Não foi possível identificar este título no TMDB, então não há semelhantes para mostrar.',
  empty: 'O TMDB não tem títulos semelhantes a este.',
  unavailable: 'Semelhantes está indisponível agora. Veja o estado do TMDB em Configurações › Integrações & BYOK.',
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

function coverageText(coverage: KindCoverage, kind: 'movie' | 'series'): string {
  return `Procurado em ${coverage.covered} de ${coverage.total} categorias de ${kind === 'movie' ? 'filmes' : 'séries'}`
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
  if (status !== 'ready') {
    return (
      <div className="similar-panel" aria-live="polite">
        {coverage !== undefined && status === 'empty' && <p className="similar-coverage">{coverageText(coverage, kind)}</p>}
        <p className="similar-state">{STATE_TEXT[status]}</p>
        {status === 'no_key' && (
          <button
            type="button"
            className={`button-secondary${configureFocused ? ' tv-focus' : ''}`}
            onClick={onConfigure}
          >
            Configurar TMDB
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="similar-panel">
      {coverage !== undefined && <p className="similar-coverage">{coverageText(coverage, kind)}</p>}
      <SimilarRow titles={titles} focusedKey={focusedKey} onSelectTitle={onSelectTitle} />
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
            badge={
              title.localItemId === undefined ? (
                <span className="similar-chip">{NOT_FOUND_LABEL}</span>
              ) : (
                <span className="similar-chip similar-chip--found">{FOUND_LABEL}</span>
              )
            }
            onSelect={() => onSelectTitle(title)}
          />
        </div>
      ))}
    </div>
  )
}
