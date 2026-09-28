import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useGlobalSearchResult, type CatalogItemOut } from '../catalog/catalogApi'
import { GLOBAL_SEARCH_MIN_CHARS } from '../../lib/catalog/globalSearch'
import { normalizeForSearch } from '../../lib/catalog/catalogSearch'
import type { SearchSnapshot } from './searchSnapshot'
import type { TopbarItem, TopDestination } from '../../navigation/appNav'
import { useIdFocus } from '../../lib/focus/useIdFocus'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { AppShell } from '../shell/AppShell'
import { TopBar } from '../shell/TopBar'
import type { HintItem } from '../shell/HintBar'
import { TextField } from '../../components/TextField'
import { ComingSoon } from '../../components/ComingSoon'
import { ContentCard } from '../../components/ContentCard'
import { ChannelRow } from '../../components/ChannelRow'
import { Rail } from '../../components/Rail'
import { EmptyState } from '../../components/EmptyState'

/** Moldura V14 — mesmo padrão de `LiveShellProps`/`VodShellProps`/`SettingsShellProps`. */
export interface SearchShellProps {
  sourceName: string
  onGoHome: () => void
  onSwitchTop: (destination: TopDestination) => void
  onOpenProfiles: () => void
  onOpenSettings: () => void
}

export interface SearchScreenProps {
  sourceId: string
  shell?: SearchShellProps
  /** Estado a restaurar ao voltar de um resultado (feature 026, FR-042). */
  restore?: SearchSnapshot
  onOpenItem: (item: CatalogItemOut, snapshot: SearchSnapshot) => void
  onOpenChannel: (channel: CatalogItemOut, snapshot: SearchSnapshot) => void
  /** RETURN com o teclado fechado (FR-044). */
  onBack: () => void
}

type ResultKind = 'channel' | 'movie' | 'series'
type Row = 'field' | ResultKind
const RESULT_ORDER: ResultKind[] = ['channel', 'movie', 'series']

const CARD_WIDTH = 205
const CARD_HEIGHT = 370
const CHANNEL_WIDTH = 340
const CHANNEL_HEIGHT = 100

const HINTS: HintItem[] = [
  { keyLabel: 'OK', action: 'Selecionar' },
  { keyLabel: 'RETURN', action: 'Voltar' },
]

function resultLabel(kind: ResultKind, count: number): string {
  if (kind === 'channel') return `Canais (${count})`
  if (kind === 'movie') return `Filmes (${count})`
  return `Séries (${count})`
}

/**
 * Busca global (feature 026, US3 — FR-035..FR-044), conforme `logic/
 * busca-global.md` §3–§5. Pesquisa só o que já foi lido da lista ativa
 * (`useGlobalSearchResult`, nunca rede) — a partir de `GLOBAL_SEARCH_MIN_CHARS`
 * (2), sem debounce, sempre com o aviso de cobertura visível.
 */
export function SearchScreen({ sourceId, shell, restore, onOpenItem, onOpenChannel, onBack }: SearchScreenProps): ReactNode {
  const [zone, setZone] = useState<'topbar' | 'content'>('content')
  const [topbarItem, setTopbarItem] = useState<TopbarItem>('search')
  const contentActive = !shell || zone === 'content'

  const [term, setTerm] = useState(restore?.term ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const [imeOpen, setImeOpen] = useState(false)

  const { data: result } = useGlobalSearchResult(sourceId, term)
  const belowMinimum = normalizeForSearch(term).length < GLOBAL_SEARCH_MIN_CHARS

  const itemsByKind: Record<ResultKind, CatalogItemOut[]> = {
    channel: result.channels,
    movie: result.movies,
    series: result.series,
  }
  const presentKinds = RESULT_ORDER.filter((kind) => !belowMinimum && itemsByKind[kind].length > 0)
  const noResults = !belowMinimum && presentKinds.length === 0

  const initialRow: Row = restore?.focus.row === 'results' ? restore.focus.kind : 'field'
  const [row, setRow] = useState<Row>(initialRow)
  const effectiveRow: Row = row === 'field' || presentKinds.includes(row) ? row : 'field'
  const [fieldCol, setFieldCol] = useState<0 | 1>(0)

  const channelFocus = useIdFocus(
    itemsByKind.channel,
    restore?.focus.row === 'results' && restore.focus.kind === 'channel' ? restore.focus.itemId : null,
  )
  const movieFocus = useIdFocus(
    itemsByKind.movie,
    restore?.focus.row === 'results' && restore.focus.kind === 'movie' ? restore.focus.itemId : null,
  )
  const seriesFocus = useIdFocus(
    itemsByKind.series,
    restore?.focus.row === 'results' && restore.focus.kind === 'series' ? restore.focus.itemId : null,
  )
  const focusByKind: Record<ResultKind, ReturnType<typeof useIdFocus<CatalogItemOut>>> = {
    channel: channelFocus,
    movie: movieFocus,
    series: seriesFocus,
  }

  // Campo real (feature 017, guarda de alvo editável do `useRemoteNav`): o
  // foco DOM em si é quem decide se o teclado está aberto — nunca reaberto
  // sozinho ao restaurar o termo (FR-036, D-010 do plan.md).
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const handleFocus = () => setImeOpen(true)
    const handleBlur = () => setImeOpen(false)
    el.addEventListener('focus', handleFocus)
    el.addEventListener('blur', handleBlur)
    return () => {
      el.removeEventListener('focus', handleFocus)
      el.removeEventListener('blur', handleBlur)
    }
  }, [])

  function currentSnapshot(): SearchSnapshot {
    if (effectiveRow === 'field') return { term, focus: { row: 'field' } }
    const focus = focusByKind[effectiveRow]
    const item = itemsByKind[effectiveRow][focus.index]
    return { term, focus: { row: 'results', kind: effectiveRow, itemId: item?.id ?? '' } }
  }

  function moveToFirstResultOrField() {
    const first = presentKinds[0]
    setRow(first ?? 'field')
  }

  function goToTopbar() {
    if (!shell) return
    setZone('topbar')
  }

  /** Enter/Done do IME com o campo focado — mesmo padrão de RETURN (FR-036), mas descendo em vez de saindo. */
  function handleFieldKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!imeOpen || event.key !== 'Enter') return
    event.preventDefault()
    inputRef.current?.blur()
    moveToFirstResultOrField()
  }

  function selectResult(kind: ResultKind) {
    const focus = focusByKind[kind]
    const item = itemsByKind[kind][focus.index]
    if (!item) return
    const snapshot = currentSnapshot()
    if (kind === 'channel') onOpenChannel(item, snapshot)
    else onOpenItem(item, snapshot)
  }

  useRemoteNav(
    contentActive
      ? {
          onDirection: (direction) => {
            // Com o campo focado (teclado aberto), só ↑/↓ chegam aqui — ←/→
            // ficam com o cursor de texto, via a guarda de alvo editável do
            // próprio `useRemoteNav` (FR-036, `logic/busca-global.md` §4).
            if (imeOpen) {
              inputRef.current?.blur()
              if (direction === 'down') moveToFirstResultOrField()
              if (direction === 'up') goToTopbar()
              return
            }
            if (effectiveRow === 'field') {
              if (direction === 'up') {
                goToTopbar()
                return
              }
              if (direction === 'left') setFieldCol(0)
              if (direction === 'right') setFieldCol(1)
              if (direction === 'down') moveToFirstResultOrField()
              return
            }
            if (direction === 'up') {
              const idx = presentKinds.indexOf(effectiveRow)
              if (idx <= 0) setRow('field')
              else setRow(presentKinds[idx - 1])
              return
            }
            if (direction === 'down') {
              const idx = presentKinds.indexOf(effectiveRow)
              if (idx !== -1 && idx < presentKinds.length - 1) setRow(presentKinds[idx + 1])
              return
            }
            const focus = focusByKind[effectiveRow]
            focus.moveTo(focus.index + (direction === 'left' ? -1 : 1))
          },
          onSelect: () => {
            if (effectiveRow === 'field') {
              if (fieldCol === 0) inputRef.current?.focus()
              // voz (col 1): o próprio `ComingSoon` já anuncia "Em breve".
              return
            }
            if (noResults) {
              inputRef.current?.focus()
              return
            }
            selectResult(effectiveRow)
          },
          onBack: () => {
            if (imeOpen) {
              inputRef.current?.blur()
              return
            }
            onBack()
          },
        }
      : {},
  )

  const coverageText = `Busca em ${result.coveredCategories} de ${result.totalCategories} categorias`

  const body = (
    // Achado real (feature 028, FR-006): rolava com a barra nativa visível.
    <div className="search-body no-scrollbar">
      <div className="search-field-row" onKeyDown={handleFieldKeyDown}>
        <TextField
          id="search-field"
          label="Buscar nesta lista"
          purpose="search"
          value={term}
          onChange={setTerm}
          inputRef={inputRef}
          focused={contentActive && effectiveRow === 'field' && fieldCol === 0}
        />
        <ComingSoon id="voice-search" focused={contentActive && effectiveRow === 'field' && fieldCol === 1} />
      </div>

      <p className="search-coverage">{coverageText}</p>
      {result.coveredCategories < result.totalCategories && (
        <p className="search-coverage-hint">
          Abra outras categorias em TV ao vivo, Filmes ou Séries para incluí-las.
        </p>
      )}

      {noResults && (
        <EmptyState
          title={`Nada encontrado para "${term}"`}
          description={coverageText}
          action={{ label: 'Editar busca', onSelect: () => inputRef.current?.focus() }}
          focused={contentActive}
        />
      )}

      {presentKinds.includes('channel') && (
        <section className="search-row" aria-label="Canais">
          <h2 className="search-row-title">{resultLabel('channel', itemsByKind.channel.length)}</h2>
          <Rail
            items={itemsByKind.channel}
            itemWidth={CHANNEL_WIDTH}
            itemHeight={CHANNEL_HEIGHT}
            focusedIndex={effectiveRow === 'channel' ? channelFocus.index : -1}
            renderItem={(item, index) => (
              <ChannelRow
                logoUrl={item.icon_url ?? undefined}
                name={item.name}
                focused={contentActive && effectiveRow === 'channel' && index === channelFocus.index}
              />
            )}
          />
        </section>
      )}
      {presentKinds.includes('movie') && (
        <section className="search-row" aria-label="Filmes">
          <h2 className="search-row-title">{resultLabel('movie', itemsByKind.movie.length)}</h2>
          <Rail
            items={itemsByKind.movie}
            itemWidth={CARD_WIDTH}
            itemHeight={CARD_HEIGHT}
            focusedIndex={effectiveRow === 'movie' ? movieFocus.index : -1}
            renderItem={(item, index) => (
              <ContentCard
                variant="portrait"
                title={item.name}
                iconUrl={item.icon_url ?? undefined}
                focused={contentActive && effectiveRow === 'movie' && index === movieFocus.index}
              />
            )}
          />
        </section>
      )}
      {presentKinds.includes('series') && (
        <section className="search-row" aria-label="Séries">
          <h2 className="search-row-title">{resultLabel('series', itemsByKind.series.length)}</h2>
          <Rail
            items={itemsByKind.series}
            itemWidth={CARD_WIDTH}
            itemHeight={CARD_HEIGHT}
            focusedIndex={effectiveRow === 'series' ? seriesFocus.index : -1}
            renderItem={(item, index) => (
              <ContentCard
                variant="portrait"
                title={item.name}
                iconUrl={item.icon_url ?? undefined}
                focused={contentActive && effectiveRow === 'series' && index === seriesFocus.index}
              />
            )}
          />
        </section>
      )}
    </div>
  )

  return (
    <div className="screen search-screen">
      {shell ? (
        <AppShell
          hints={HINTS}
          topBar={
            <TopBar
              sourceName={shell.sourceName}
              active={zone === 'topbar'}
              focusedItem={topbarItem}
              currentItem="search"
              onFocusItem={setTopbarItem}
              onExitDown={() => setZone('content')}
              onNavigate={(destination) => shell.onSwitchTop(destination)}
              onGoHome={shell.onGoHome}
              onOpenProfiles={shell.onOpenProfiles}
              onOpenSettings={shell.onOpenSettings}
              onBack={onBack}
            />
          }
        >
          {body}
        </AppShell>
      ) : (
        <>
          <h1 className="screen-title">Buscar</h1>
          {body}
        </>
      )}
    </div>
  )
}
