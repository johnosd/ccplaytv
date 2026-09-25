import { useState } from 'react'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { useCatalogCounts, type SectionCount } from '../catalog/catalogApi'
import type { SourceOut } from '../import/importApi'
import { LimitedModeNotice } from './LimitedModeNotice'

export type ListDestination = 'live' | 'movies' | 'series'

export interface ListHomeScreenProps {
  source: SourceOut
  onSelect: (destination: ListDestination) => void
  onBack: () => void
}

const TILES: { key: ListDestination; icon: string; label: string }[] = [
  { key: 'live', icon: '📡', label: 'Live TV' },
  { key: 'movies', icon: '🎬', label: 'Filmes' },
  { key: 'series', icon: '🎞️', label: 'Séries' },
]

export function ListHomeScreen({ source, onSelect, onBack }: ListHomeScreenProps) {
  const sourceId = source.id
  const sourceName = source.display_name
  const [focusCol, setFocusCol] = useState(0)
  const counts = useCatalogCounts(sourceId)

  useRemoteNav({
    onDirection: (dir) => {
      if (dir === 'left') setFocusCol((c) => clamp(c - 1, 0, TILES.length - 1))
      if (dir === 'right') setFocusCol((c) => clamp(c + 1, 0, TILES.length - 1))
    },
    onSelect: () => onSelect(TILES[focusCol].key),
    onBack,
  })

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
    <div className="screen">
      <p className="screen-eyebrow">{sourceName}</p>
      <h1 className="screen-title" style={{ marginBottom: 64 }}>
        O que você quer assistir?
      </h1>
      <div className="tiles-row">
        {TILES.map((tile, i) => (
          <div key={tile.key} className={`tile${focusCol === i ? ' tv-focus' : ''}`}>
            <div className="tile-icon">{tile.icon}</div>
            <div className="tile-label">{tile.label}</div>
            <div className="tile-meta">{tileMeta[tile.key]}</div>
          </div>
        ))}
      </div>
      {/* Cobertura parcial é o normal de operação, não uma falha a esconder
          (feature 010, R-007): o catálogo é obtido por categoria, conforme
          cada uma é aberta — não tudo de uma vez na sincronização. */}
      <p className="screen-subtitle" style={{ marginTop: 32, marginBottom: 0 }}>
        Cada categoria é obtida quando você entra nela.
      </p>
      {/* Feature 014, US2 (FR-021): o selo já diz QUE a fonte está em Modo
          limitado (Home); aqui é ONDE se explica o motivo, o que se perde e
          o que fazer — só quando a última importação de fato caiu nesse
          caminho. */}
      {source.provider_import_mode === 'legacy_m3u' && (
        <LimitedModeNotice
          reason={source.limited_reason ?? ''}
          discardedCount={source.last_discarded_by_type}
        />
      )}
    </div>
  )
}
