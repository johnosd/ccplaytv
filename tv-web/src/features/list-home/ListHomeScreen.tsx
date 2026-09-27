import { useEffect, useRef, useState } from 'react'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { useCatalogCounts, useContinueWatchingContent, type CatalogItemOut, type SectionCount } from '../catalog/catalogApi'
import type { SourceOut } from '../import/importApi'
import { LimitedModeNotice } from './LimitedModeNotice'
import { PosterArt } from '../../components/PosterArt'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/iconPaths'
import { useScrollFocusedIntoView } from '../../lib/focus/useScrollFocusedIntoView'
import type { HomeFocus, TopDestination } from '../../navigation/appNav'

export type ListDestination = TopDestination

/** Foco de origem que o Início sabe restaurar dentro do conteúdo (a topbar é do `HomeScreen`). */
export type HomeContentFocus = Exclude<HomeFocus, { zone: 'topbar' }>

export interface ListHomeScreenProps {
  source: SourceOut
  onSelect: (destination: ListDestination) => void
  /**
   * Feature 019, D-009/D-011: SELECT num item da seção "Continuar assistindo" —
   * sempre `kind: 'movie'` ou `kind: 'series'` (`resolveContinueWatching` já
   * troca episódio pela série-pai), nunca `'episode'`. Quem decide para onde
   * navegar é o chamador (mesmo padrão de `onOpenMovie`/`onOpenSeries` de
   * `MoviesScreen`/`SeriesScreen`).
   */
  onOpenContinueWatching: (item: CatalogItemOut) => void
  onBack: () => void
  /**
   * Feature 023 (D-004, `logic/foco-shell.md`): este conteúdo é um dos dois
   * escopos do Início (o outro é a topbar). Só o escopo ativo reage ao
   * teclado e desenha o foco — o estado interno (qual atalho, qual item)
   * permanece quando a topbar está ativa, e é o que faz DOWN devolver o foco
   * ao mesmo lugar. Padrão `true`: quem monta sem topbar continua como era.
   */
  active?: boolean
  /** UP na linha mais alta do conteúdo — o Início leva o foco à topbar (FR-015). */
  onExitUp?: () => void
  /** Foco a restaurar ao voltar de um destino (FR-029). "Continuar assistindo" por **id**, nunca por índice. */
  initialFocus?: HomeContentFocus
}

const TILES: { key: ListDestination; icon: IconName; label: string }[] = [
  { key: 'live', icon: 'live', label: 'TV ao vivo' },
  { key: 'movies', icon: 'play', label: 'Filmes' },
  { key: 'series', icon: 'menu', label: 'Séries' },
]

/** As duas linhas navegáveis desta tela — "topo"/conteúdo, mesmo mecanismo já usado noutras telas (D-010). */
type FocusRow = 'continue-watching' | 'tiles'

/** Referência estável enquanto a consulta não trouxe dados — um `[]` novo a cada render desestabilizaria o efeito de restauração. */
const NO_ITEMS: CatalogItemOut[] = []

/**
 * Conteúdo do Início provisório (feature 023, D-002 do plan.md) — o antigo hub
 * da lista, agora sob a topbar do shell. Mesmo conteúdo e mesmas regras de
 * antes (contagens honestas, "Continuar assistindo", Modo limitado); a única
 * mudança de comportamento é a composição de foco com a topbar. O cabeçalho
 * próprio saiu: o nome da lista já mora no indicador da topbar.
 */
export function ListHomeScreen({
  source,
  onSelect,
  onOpenContinueWatching,
  onBack,
  active = true,
  onExitUp,
  initialFocus,
}: ListHomeScreenProps) {
  const sourceId = source.id
  const [focusCol, setFocusCol] = useState(() =>
    initialFocus?.zone === 'shortcuts' ? Math.max(0, TILES.findIndex((tile) => tile.key === initialFocus.destination)) : 0,
  )
  const [continueIdx, setContinueIdx] = useState(0)
  // Foco inicial continua nos atalhos, mesmo comportamento de hoje (D-010) —
  // "Continuar assistindo" é alcançável com UP, nunca o ponto de partida
  // (salvo restauração ao voltar de um item dela, abaixo).
  const [row, setRow] = useState<FocusRow>('tiles')
  const counts = useCatalogCounts(sourceId)
  const continueWatchingQuery = useContinueWatchingContent(sourceId)
  const continueWatchingItems = continueWatchingQuery.data ?? NO_ITEMS
  const hasContinueWatching = continueWatchingItems.length > 0
  // O item em foco na rail pode sumir sem a pessoa mexer em nada — ela concluiu
  // o item na tela de reprodução, voltou, e a consulta revalida e esvazia a
  // rail com o Início já montado (achado no E2E da feature 023, cenário
  // "Arrival concluído some de Continuar assistindo"). Sem isto, `row` fica
  // preso em 'continue-watching' com a seção já não renderizada — nenhum foco
  // visível em lugar nenhum (constitution, "Foco Visível e Sem Becos Sem
  // Saída"). `effectiveRow`, nunca `row` cru, decide teclado e classe de foco.
  const effectiveRow: FocusRow = row === 'continue-watching' && !hasContinueWatching ? 'tiles' : row
  const safeContinueIdx = clamp(continueIdx, 0, Math.max(0, continueWatchingItems.length - 1))
  // A linha não tem limite de itens: o card focado acompanha o scroll, em vez
  // de o foco parar num card cortado pela borda (constitution, "Foco Visível").
  const focusedContinueRef = useScrollFocusedIntoView<HTMLDivElement>(safeContinueIdx)

  // Restauração por id (constitution, "Voltar Restaura Foco e Posição"): a
  // lista de "Continuar assistindo" chega depois da montagem, então o id só
  // pode ser procurado quando a consulta termina. Id que sumiu (o item foi
  // concluído enquanto se assistia) deixa o foco no padrão — atalho "TV ao
  // vivo" (FR-024) — em vez de apontar para outro item.
  const pendingRestoreIdRef = useRef<string | null>(initialFocus?.zone === 'continue' ? initialFocus.itemId : null)
  const settled = continueWatchingQuery.isSuccess || continueWatchingQuery.isError
  useEffect(() => {
    const itemId = pendingRestoreIdRef.current
    if (itemId === null || !settled) return
    pendingRestoreIdRef.current = null
    const idx = continueWatchingItems.findIndex((item) => item.id === itemId)
    if (idx === -1) return
    setContinueIdx(idx)
    setRow('continue-watching')
  }, [settled, continueWatchingItems])

  useRemoteNav(
    active
      ? {
          onDirection: (dir) => {
            if (dir === 'up') {
              if (effectiveRow === 'tiles' && hasContinueWatching) {
                setRow('continue-watching')
                return
              }
              // Linha mais alta do conteúdo: a topbar é o próximo escopo.
              onExitUp?.()
              return
            }
            if (dir === 'down' && effectiveRow === 'continue-watching') {
              setRow('tiles')
              return
            }
            if (effectiveRow === 'continue-watching') {
              if (dir === 'left') setContinueIdx((c) => clamp(c - 1, 0, continueWatchingItems.length - 1))
              if (dir === 'right') setContinueIdx((c) => clamp(c + 1, 0, continueWatchingItems.length - 1))
              return
            }
            if (dir === 'left') setFocusCol((c) => clamp(c - 1, 0, TILES.length - 1))
            if (dir === 'right') setFocusCol((c) => clamp(c + 1, 0, TILES.length - 1))
          },
          onSelect: () => {
            if (effectiveRow === 'continue-watching') {
              const item = continueWatchingItems[safeContinueIdx]
              if (item) onOpenContinueWatching(item)
              return
            }
            onSelect(TILES[focusCol].key)
          },
          onBack,
        }
      : {},
  )

  /**
   * Número só aparece quando é o número real desta lista. `items` é a soma
   * mais concreta que existe (itens já gravados, ou o que a fonte
   * declarou); na ausência dele, o número de categorias já é conhecido
   * desde a importação da estrutura e é honesto — diferente de mostrar
   * "0", que diria que a seção está vazia quando na verdade só não foi
   * aberta ainda (feature 010).
   */
  const sectionLabel = (section: SectionCount | undefined): string => {
    if (!section) return ''
    if (section.items !== undefined) {
      return `${section.items} ${section.items === 1 ? 'título' : 'títulos'}`
    }
    if (section.categories > 0) {
      return `${section.categories} ${section.categories === 1 ? 'categoria' : 'categorias'}`
    }
    return ''
  }

  const tileMeta: Record<ListDestination, string> = {
    live: sectionLabel(counts.data?.channels),
    movies: sectionLabel(counts.data?.movies),
    series: sectionLabel(counts.data?.series),
  }

  return (
    <div className="home-content">
      {hasContinueWatching && (
        <section className="home-section" aria-label="Continuar assistindo">
          <h2 className="home-section-title">Continuar assistindo</h2>
          <div className="continue-watching-row">
            {continueWatchingItems.map((item, i) => (
              <div
                key={item.id}
                className="continue-watching-card"
                ref={i === safeContinueIdx ? focusedContinueRef : undefined}
              >
                <PosterArt
                  url={item.icon_url ?? undefined}
                  title={item.name}
                  focused={active && effectiveRow === 'continue-watching' && safeContinueIdx === i}
                />
                <div className="continue-watching-title">{item.name}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="tiles-row" role="group" aria-label="Atalhos">
        {TILES.map((tile, i) => (
          <button
            key={tile.key}
            type="button"
            tabIndex={-1}
            className={`tile${active && effectiveRow === 'tiles' && focusCol === i ? ' tv-focus' : ''}`}
            onClick={() => onSelect(tile.key)}
          >
            <Icon name={tile.icon} className="tile-icon" />
            <span className="tile-label">{tile.label}</span>
            <span className="tile-meta">{tileMeta[tile.key]}</span>
          </button>
        ))}
      </div>
      {/* Cobertura parcial é o normal de operação, não uma falha a esconder
          (feature 010, R-007): o catálogo é obtido por categoria, conforme
          cada uma é aberta — não tudo de uma vez na sincronização. */}
      <p className="home-coverage-note">Cada categoria é obtida quando você entra nela.</p>
      {/* Feature 014, US2 (FR-021): o selo já diz QUE a fonte está em Modo
          limitado (cartão da lista); aqui é ONDE se explica o motivo, o que
          se perde e o que fazer — só quando a última importação de fato caiu
          nesse caminho. */}
      {source.provider_import_mode === 'legacy_m3u' && (
        <LimitedModeNotice
          reason={source.limited_reason ?? ''}
          discardedCount={source.last_discarded_by_type}
        />
      )}
    </div>
  )
}
