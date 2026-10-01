import { useState } from 'react'
import type { ReactNode } from 'react'
import { ContentCard } from '../../components/ContentCard'
import { Rail } from '../../components/Rail'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import type { ResolvedTitle } from '../../lib/metadata/types'
import { usePersonCredits, usePersonTitles } from '../catalog/catalogApi'
import { OriginTag, PersonPhoto } from '../vod/DetailMetadata'
import type { OpenTitleTarget } from '../vod/detailSnapshot'
import { NOT_FOUND_LABEL } from '../vod/SimilarPanel'
import { TitleSummaryModal } from '../vod/TitleSummaryModal'
import type { PersonSnapshot } from './personSnapshot'

/** Cartão retrato + folga entre cartões / altura com título e meta (mesma medida do Início). */
const CARD_WIDTH = 229
const CARD_HEIGHT = 370

export interface PersonScreenProps {
  personId: number
  /** Nome já conhecido pelo elenco — o cabeçalho aparece antes de a filmografia carregar. */
  personName: string
  /** Fonte ativa — o cruzamento é sempre com o catálogo dela. */
  sourceId: string
  restore?: PersonSnapshot
  /** OK num título "encontrado": abre o detalhe local. `from` = onde o foco estava aqui. */
  onOpenTitle: (target: OpenTitleTarget, from: PersonSnapshot) => void
  onBack: () => void
}

type ActionId = 'retry' | 'back'

function coverageText(coverage: { movie?: { covered: number; total: number }; series?: { covered: number; total: number } }): string | null {
  if (!coverage.movie || !coverage.series) return null
  return `Procurado em ${coverage.movie.covered} de ${coverage.movie.total} categorias de filmes e ${coverage.series.covered} de ${coverage.series.total} de séries`
}

/**
 * Página de ator (feature 035, US4, `logic/pagina-de-ator.md` §5): foto, nome e
 * a filmografia cruzada com o catálogo guardado, em dois rails — "Na sua lista"
 * e "Fora da sua lista". Sem biografia, sem topbar. Cada estado (carregando,
 * erro, sem chave, vazio) tem ao menos um focável; o foco dos rails é uma
 * chave (`tmdb:<kind>:<id>`), nunca um índice.
 */
export function PersonScreen({ personId, personName, sourceId, restore, onOpenTitle, onBack }: PersonScreenProps): ReactNode {
  const creditsQuery = usePersonCredits(personId)
  const result = creditsQuery.data
  const credits = result?.status === 'ok' ? result.person.credits : undefined
  const titlesQuery = usePersonTitles(personId, sourceId, credits)
  const view = titlesQuery.data

  const found = (view?.titles ?? []).filter((title) => title.localItemId !== undefined)
  const missing = (view?.titles ?? []).filter((title) => title.localItemId === undefined)
  const rails = [found, missing].filter((rail) => rail.length > 0)

  const [rawKey, setFocusKey] = useState<string | undefined>(restore?.focusKey)
  const [summaryTitle, setSummaryTitle] = useState<ResolvedTitle | null>(null)
  const [actionIdx, setActionIdx] = useState(0)

  // Chave ausente da lista atual → primeiro item do primeiro rail (nunca foco invisível).
  const allKeys = rails.flatMap((rail) => rail.map((title) => title.key))
  const focusKey = rawKey !== undefined && allKeys.includes(rawKey) ? rawKey : allKeys[0]
  const railIdx = Math.max(0, rails.findIndex((rail) => rail.some((title) => title.key === focusKey)))
  const itemIdx = Math.max(0, (rails[railIdx] ?? []).findIndex((title) => title.key === focusKey))

  const loading = creditsQuery.isLoading || (credits !== undefined && titlesQuery.isLoading)
  const errorReason = result?.status === 'error' ? result.reason : undefined
  const isEmpty = credits !== undefined && credits.length === 0
  const hasRails = !loading && rails.length > 0

  // Ações focáveis do estado atual (todo estado tem ao menos "Voltar").
  const actions: ActionId[] =
    !loading && errorReason !== undefined && errorReason !== 'no_key' ? ['retry', 'back'] : ['back']
  const safeActionIdx = clamp(actionIdx, 0, actions.length - 1)

  function runAction(id: ActionId) {
    if (id === 'back') onBack()
    else void creditsQuery.refetch()
  }

  function open(title: ResolvedTitle) {
    if (title.localItemId !== undefined) {
      onOpenTitle({ kind: title.kind, itemId: title.localItemId }, { focusKey: title.key })
    } else {
      setSummaryTitle(title)
    }
  }

  useRemoteNav({
    onDirection: (dir) => {
      if (hasRails) {
        const rail = rails[railIdx]
        if (dir === 'left' || dir === 'right') {
          const next = clamp(itemIdx + (dir === 'left' ? -1 : 1), 0, rail.length - 1)
          setFocusKey(rail[next].key)
        } else {
          const nextRail = rails[clamp(railIdx + (dir === 'up' ? -1 : 1), 0, rails.length - 1)]
          setFocusKey(nextRail[Math.min(itemIdx, nextRail.length - 1)].key)
        }
        return
      }
      if (actions.length > 1) setActionIdx((current) => clamp(current + (dir === 'left' || dir === 'up' ? -1 : 1), 0, actions.length - 1))
    },
    onSelect: () => {
      if (hasRails) {
        const title = rails[railIdx]?.[itemIdx]
        if (title) open(title)
        return
      }
      runAction(actions[safeActionIdx])
    },
    onBack,
  })

  const photoUrl = result?.status === 'ok' ? result.person.photoUrl : undefined
  const name = result?.status === 'ok' && result.person.name !== '' ? result.person.name : personName
  const coverage = view ? coverageText(view.coverage) : null

  return (
    <div className="screen person-screen no-scrollbar">
      <div className="person-header">
        <PersonPhoto url={photoUrl} name={name} />
        <div className="person-header-info">
          <div className="person-name">{name}</div>
          <OriginTag origin="tmdb" />
        </div>
      </div>

      {loading && <p className="person-state">Carregando a filmografia…</p>}
      {!loading && errorReason === 'no_key' && <p className="person-state">A chave do TMDB foi removida.</p>}
      {!loading && errorReason !== undefined && errorReason !== 'no_key' && (
        <p className="person-state">Não foi possível carregar a filmografia agora.</p>
      )}
      {!loading && isEmpty && <p className="person-state">O TMDB não tem filmes nem séries com esta pessoa.</p>}
      {!loading && !isEmpty && credits !== undefined && rails.length === 0 && (
        <p className="person-state">O TMDB não tem filmes nem séries com esta pessoa.</p>
      )}

      {hasRails && coverage && <p className="person-coverage">{coverage}</p>}

      {hasRails &&
        [
          { label: 'Na sua lista', titles: found },
          { label: 'Fora da sua lista', titles: missing },
        ]
          .filter((group) => group.titles.length > 0)
          .map((group) => (
            <section key={group.label} className="person-rail" aria-label={group.label}>
              <h2 className="person-rail-title">
                {group.label} ({group.titles.length})
              </h2>
              <Rail
                items={group.titles}
                focusedIndex={Math.max(0, group.titles.findIndex((title) => title.key === focusKey))}
                itemWidth={CARD_WIDTH}
                itemHeight={CARD_HEIGHT}
                renderItem={(title) => (
                  <ContentCard
                    variant="portrait"
                    title={title.title}
                    meta={title.year !== undefined ? String(title.year) : undefined}
                    iconUrl={title.posterUrl}
                    focused={focusKey === title.key}
                    badge={title.localItemId === undefined ? <span className="similar-chip">{NOT_FOUND_LABEL}</span> : undefined}
                    onSelect={() => open(title)}
                  />
                )}
              />
            </section>
          ))}

      {!hasRails && (
        <div className="person-actions">
          {actions.includes('retry') && (
            <button type="button" className={`button-secondary${actions[safeActionIdx] === 'retry' ? ' tv-focus' : ''}`} onClick={() => runAction('retry')}>
              Tentar de novo
            </button>
          )}
          <button type="button" className={`button-secondary${actions[safeActionIdx] === 'back' ? ' tv-focus' : ''}`} onClick={onBack}>
            Voltar
          </button>
        </div>
      )}

      {summaryTitle && <TitleSummaryModal title={summaryTitle} onClose={() => setSummaryTitle(null)} />}
    </div>
  )
}
