import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import { stableIdOf } from '../catalog/catalogApi'
import { nowNextForChannel } from '../../lib/epg/nowNext'
import { formatEpgClock, formatEpgTimeRange } from '../../lib/epg/formatEpgTime'
import { FavoritesEmptyState, FavoritesUnresolvedNote } from '../favorites/FavoritesState'
import { AppShell } from '../shell/AppShell'
import { TopBar } from '../shell/TopBar'
import type { TopbarItem } from '../../navigation/appNav'
import { SideCategoryNav, type SideCategoryNavEntry } from '../../components/SideCategoryNav'
import { ChannelRow } from '../../components/ChannelRow'
import { ErrorState } from '../../components/ErrorState'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { Icon } from '../../components/Icon'
import { describeError } from '../../lib/errors/errorCatalog'
import { channelNumberOf, knownCategoryCount } from './channelNumber'
import { LIVE_HINTS, liveGroupDisplay, trailEntryId, type TrailEntry } from './liveTrail'
import type { LiveShellProps } from './LiveScreen'
import type { LiveChannels, LiveTrail } from './useLiveCatalog'
import type { LiveSearch } from './useLiveSearch'
import type { OverflowEdges } from '../../lib/focus/useOverflowEdges'
import { listInitials } from '../../lib/initials'
import { LiveHeroArt } from './LiveHeroArt'

/** Rótulos dos cartões de programação, na ordem (feature 048, D-004). */
const SCHEDULE_LABELS = ['A seguir', 'Depois', 'Mais tarde']

/**
 * Desenho da TV ao vivo. Extraído da `LiveScreen` na feature 040 sem mudar
 * nada — e de propósito como **funções**, não componentes: um componente
 * novo seria uma fronteira de reconciliação (pode remontar a subárvore,
 * trocar a identidade dos refs de DOM e perder o scroll)
 * (`sdd/specs/040-dividir-player-live/logic/divisao.md` §1.4).
 */

export interface LiveShellModel {
  shell: LiveShellProps | undefined
  zone: 'topbar' | 'content'
  setZone: Dispatch<SetStateAction<'topbar' | 'content'>>
  topbarItem: TopbarItem
  setTopbarItem: Dispatch<SetStateAction<TopbarItem>>
  onBack: () => void
}

/**
 * Envolve `children` na moldura V14 (feature 024, D-002) quando `shell`
 * existe — topbar persistente, com "TV ao vivo" como destino atual (D-004).
 * Sem `shell`, devolve `children` sozinho: é assim que a tela funciona
 * quando ninguém a monta com moldura (contrato travado da 018, testes de
 * comportamento existentes).
 */
export function renderLiveShell(model: LiveShellModel, children: ReactNode): ReactNode {
  const { shell, zone, setZone, topbarItem, setTopbarItem, onBack } = model
  if (!shell) return children
  return (
    <AppShell
      hints={LIVE_HINTS}
      topBar={
        <TopBar
          sourceName={shell.sourceName}
          active={zone === 'topbar'}
          focusedItem={topbarItem}
          currentItem="live"
          onFocusItem={setTopbarItem}
          onExitDown={() => setZone('content')}
          onNavigate={(destination) => {
            if (destination === 'movies' || destination === 'series') shell.onSwitchTop(destination)
          }}
          onGoHome={shell.onGoHome}
          onOpenProfiles={shell.onOpenProfiles}
          onOpenSearch={shell.onOpenSearch}
          onOpenSettings={shell.onOpenSettings}
          onBack={onBack}
        />
      }
    >
      {children}
    </AppShell>
  )
}

export interface LiveColumnsModel {
  trail: LiveTrail
  search: LiveSearch
  channels: LiveChannels
  zapOpen: boolean
  contentActive: boolean
  setCol: Dispatch<SetStateAction<0 | 1>>
  enterTrailEntry: (entry: TrailEntry) => void
  onResync: () => void
  /** Feature 042 (FR-004): sem conexão, "Ressincronizar lista" fica soft disabled com o motivo. */
  offline: boolean
  channelListRef: RefObject<HTMLDivElement | null>
  channelVirtualizer: Virtualizer<HTMLDivElement, Element>
  /** Contêiner rolável da trilha (feature 048, FR-021) e os lados com itens ocultos de cada lista. */
  trailScrollRef: RefObject<HTMLDivElement | null>
  trailEdges: OverflowEdges
  channelEdges: OverflowEdges
  /** Canal em reprodução, para marcar a linha no zapping (feature 048, FR-014). */
  playingId?: string
}

function scrollFrameClass(edges: OverflowEdges): string {
  return `live-scroll-frame${edges.above ? ' is-more-above' : ''}${edges.below ? ' is-more-below' : ''}`
}

export function renderLiveColumns(model: LiveColumnsModel, withPreview: boolean): ReactNode {
  const { trail, search, channels, zapOpen, contentActive, setCol, enterTrailEntry, onResync } = model
  const { channelListRef, channelVirtualizer, trailScrollRef, trailEdges, channelEdges, playingId } = model
  const {
    categories,
    trail: entries,
    focusedTrailEntry,
    focusedCategory,
    isFavoritesFocused,
    isAllFocused,
    focusedCategoryRef,
    entered,
    enteredFavorites,
    enteredAll,
    setFocusedIdentity,
  } = trail
  const { searchActive, searchTerm, setSearchTerm, topFocused, setTopFocused, topIcon, searchInputRef, belowMinimum } = search
  const {
    content,
    favoriteIds,
    aggregated,
    baseItems,
    contentIsLoading,
    contentFailed,
    contentErrorCode,
    contentMissing,
    contentUnavailable,
    items,
    channelIdx,
    activeChannel,
    effectiveCol,
    epgNow,
    epgLookup,
    activeNowNext,
    activeUpcoming,
    retryContent,
    searchNoResults,
    searchCoveragePartial,
    showResultsList,
    showingContent,
    contentStale,
    declaredCount,
    realCount,
    countsDiverge,
    unresolvedFavorites,
  } = channels

  // Rótulo da entrada atualmente focada/entrada — Favoritos, Todos ou o
  // nome da categoria real (feature 018).
  const entryLabel = isAllFocused || enteredAll
    ? 'Todos'
    : isFavoritesFocused || enteredFavorites
      ? '★ Favoritos'
      : liveGroupDisplay(focusedCategory?.name)

  // Rótulo do destaque (feature 048, §1.1): grupo declarado pela fonte, com a entrada quando não é uma categoria.
  const activeGroup = liveGroupDisplay(activeChannel?.original_group ?? undefined)
  const heroEyebrow = isAllFocused || enteredAll ? `Todos • ${activeGroup}` : isFavoritesFocused || enteredFavorites ? `★ Favoritos • ${activeGroup}` : activeGroup

  const sideEntries: SideCategoryNavEntry[] = entries.map((entry) => {
    if (entry.key.kind === 'favorites') {
      return {
        id: trailEntryId(entry),
        label: 'Favoritos',
        tile: '★',
        count: favoriteIds.size,
        pinned: true,
        pinnedBadge: false,
      }
    }
    if (entry.key.kind === 'all') {
      return { id: trailEntryId(entry), label: 'Todos', tile: '∞', pinned: true, pinnedBadge: false }
    }
    return {
      id: trailEntryId(entry),
      label: liveGroupDisplay(entry.category?.name),
      tile: listInitials(liveGroupDisplay(entry.category?.name)),
      count: entry.category ? knownCategoryCount(entry.category) : undefined,
    }
  })
  const selectedTrailId = entered
    ? entered.kind === 'category'
      ? `cat-${entered.id}`
      : entered.kind
    : ''
  // Sem foco visual na trilha enquanto a topbar estiver ativa (feature
  // 024, D-003) — o estado interno (`categoryIdx`) continua o mesmo, só
  // a marcação `.tv-focus` some, exatamente como a topbar da 023 faz com
  // o conteúdo do Início.
  const focusedTrailId = contentActive && effectiveCol === 0 && focusedTrailEntry ? trailEntryId(focusedTrailEntry) : undefined

  return (
    <>
      <div className="live-column live-column-groups">
        <div className="live-panel-head">
          <div className="live-column-title">Categorias</div>
          <div className="live-panel-sub">Grupos</div>
        </div>
        {/* Moldura com degradê de continuação (feature 048, FR-021): overlay,
            nunca máscara no contêiner rolável (esmaeceria o anel de foco). */}
        <div className={scrollFrameClass(trailEdges)}>
          <div ref={trailScrollRef} className="live-scroll-area no-scrollbar">
            <SideCategoryNav
              entries={sideEntries}
              selectedId={selectedTrailId}
              focusedId={focusedTrailId}
              focusedRef={focusedCategoryRef}
              onSelect={(id) => {
                const target = entries.find((entry) => trailEntryId(entry) === id)
                if (target) enterTrailEntry(target)
              }}
            />
          </div>
        </div>
      </div>

      <div className="live-column live-column-channels">
        <div className="category-title-row">
          <div className="live-panel-titles">
            <div className="live-column-title">{entryLabel}</div>
            <div className="live-panel-sub">Canais</div>
          </div>
          {/* Ícone de busca (feature 018, FR-001): só quando há itens
              carregados (D-006) e nunca dentro do zapping (FR-018).
              `!contentUnavailable` evita o ícone aparecer sobre um
              `baseItems` obsoleto — `loadCategoryContent` sempre lê
              `channels`, que pode reter registros de uma geração
              anterior mesmo com outcome `source_missing`/`failed`
              (achado durante o gate final da feature 018, T029). */}
          {!zapOpen && !searchActive && !contentUnavailable && baseItems.length > 0 && (
            <div className="live-top-icons">
              <button
                type="button"
                className={`search-icon-button${effectiveCol === 1 && topFocused && topIcon === 'search' ? ' tv-focus' : ''}`}
                aria-label="Buscar"
              >
                <Icon name="search" />
              </button>
              {/* Guia completo (feature 049, FR-008): ícone focável ao lado da lupa — o destaque não tem mais botões. */}
              <button
                type="button"
                className={`live-guide-button${effectiveCol === 1 && topFocused && topIcon === 'guide' ? ' tv-focus' : ''}`}
                aria-label="Guia completo"
              >
                <Icon name="guide" />
              </button>
            </div>
          )}
        </div>

        {!showingContent && (
          <div className="live-state-copy">Aponte para uma categoria e pressione OK para ver os canais.</div>
        )}

        {searchActive && (
          <div className="search-field-row">
            <input
              ref={searchInputRef}
              type="text"
              className="search-field field-box"
              // Achado real (feature 028, FR-015): sem aria-label nem <label>, o campo não tinha nome acessível.
              aria-label="Pesquisar nesta categoria"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                // Tecla "Done" do teclado do sistema da TV — mesmo efeito
                // de ↓ a partir do campo (`logic/busca-por-categoria.md` §3).
                if (event.keyCode !== 65376) return
                event.preventDefault()
                if (items.length > 0) {
                  setTopFocused(false)
                  setFocusedIdentity((prev) => ({ ...prev, channelId: items[0].id }))
                }
              }}
              placeholder="Buscar canais"
            />
            <div className="search-status">
              {belowMinimum && <span>Digite pelo menos 3 letras</span>}
              {!belowMinimum && <span>{items.length === 1 ? '1 resultado' : `${items.length} resultados`}</span>}
              {searchCoveragePartial && (
                <span className="search-coverage">
                  Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
                </span>
              )}
            </div>
          </div>
        )}

        {searchNoResults && (
          // Sem botão "ação" aqui de propósito: o campo continua com foco
          // DOM real neste estado (só se sai dele quando há resultado pra
          // focar), então RETURN já garante saída — nenhum beco sem saída
          // (constitution). Um botão redundante mostraria dois elementos
          // com aparência de foco ao mesmo tempo.
          <div className="live-state">
            <div className="live-state-title">Nenhum resultado para "{searchTerm}"</div>
            {searchCoveragePartial && (
              <div className="live-state-copy">
                Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
              </div>
            )}
          </div>
        )}

        {enteredAll && !searchActive && searchCoveragePartial && (
          <div className="live-truncated-note">
            Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
          </div>
        )}

        {showingContent && !searchActive && contentIsLoading && (
          <div className="live-state-wrapper">
            <Spinner size={32} />
            <EmptyState title="Carregando canais…" action={{ label: 'Voltar', onSelect: () => setCol(0) }} focused />
          </div>
        )}

        {showingContent && !searchActive && !contentIsLoading && contentFailed && (
          <ErrorState
            title="Não foi possível carregar esta categoria"
            description={contentErrorCode ? describeError(contentErrorCode).title : undefined}
            code={contentErrorCode}
            actions={[{ label: 'Tentar de novo', onSelect: retryContent }]}
            focusedActionIndex={0}
          />
        )}

        {showingContent && !searchActive && !contentIsLoading && contentMissing && (
          <ErrorState
            title="O conteúdo desta lista não está mais no aparelho"
            description={model.offline ? 'Sem conexão: ressincronizar precisa de internet.' : undefined}
            actions={[
              {
                label: 'Ressincronizar lista',
                onSelect: onResync,
                softDisabledReason: model.offline ? 'indisponível sem conexão' : undefined,
              },
            ]}
            focusedActionIndex={0}
          />
        )}

        {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredFavorites && items.length === 0 && (
          <FavoritesEmptyState kind="channel" focused onBack={() => setCol(0)} />
        )}

        {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredAll && items.length === 0 && (
          <EmptyState
            title="Nenhuma categoria foi obtida ainda"
            description='Entre numa categoria para trazê-la para "Todos".'
            action={{ label: 'Voltar', onSelect: () => setCol(0) }}
            focused
          />
        )}

        {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && entered?.kind === 'category' && items.length === 0 && (
          <EmptyState title="Este grupo está vazio." action={{ label: 'Voltar', onSelect: () => setCol(0) }} focused />
        )}

        {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && contentStale && (
          <div className="live-truncated-note">
            Não foi possível atualizar agora — mostrando o que já estava salvo.
          </div>
        )}

        {countsDiverge && (
          <div className="live-truncated-note">
            O provedor declarou {declaredCount} canais nesta categoria, mas entregou {realCount}.
          </div>
        )}

        {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredFavorites && (
          <FavoritesUnresolvedNote unresolved={unresolvedFavorites} />
        )}

        {showResultsList && (
          <div className={scrollFrameClass(channelEdges)}>
            {/* Achado real (feature 028, FR-006): rolava com a barra nativa visível. */}
            <div ref={channelListRef} className="live-channel-list no-scrollbar">
              <div
                className="live-channel-list-inner"
                style={{ height: channelVirtualizer.getTotalSize() }}
              >
                {channelVirtualizer.getVirtualItems().map((virtualRow) => {
                  const channel = items[virtualRow.index]
                  if (!channel) return null
                  const isFavorite = favoriteIds.has(stableIdOf(channel) ?? '')
                  const { now: onAir } = nowNextForChannel(epgLookup, channel.epg_channel_id, epgNow)
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      className={`live-channel-row no-scale${
                        effectiveCol === 1 && !topFocused && channelIdx === virtualRow.index ? ' tv-focus' : ''
                      }${playingId !== undefined && channel.id === playingId ? ' is-playing' : ''}`}
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <ChannelRow
                        number={channelNumberOf(channel, categories) ?? undefined}
                        logoUrl={channel.icon_url ?? undefined}
                        name={channel.name}
                        nameClassName="live-item-name"
                        nowPlaying={onAir?.title}
                        progress={onAir?.progress}
                        favorite={isFavorite}
                        unavailable={!channel.playable}
                        group={enteredAll ? liveGroupDisplay(channel.original_group ?? undefined) : undefined}
                        groupClassName="live-item-group"
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && entered?.kind === 'category' && content.data && (
          // Fala do limite de exibição, não do tamanho da fonte — a distinção
          // importa porque o catálogo publicado pode ser parcial (FR-016).
          content.data.totalCount > items.length && (
            <div className="live-truncated-note">
              Mostrando os primeiros {items.length} de {content.data.totalCount} canais deste grupo.
            </div>
          )
        )}
      </div>

      {withPreview && (
        <div className="live-preview-panel">
          {activeChannel ? (
            <>
              <div className="live-hero">
                <LiveHeroArt url={activeChannel.icon_url ?? undefined} />
                <div className="live-hero-copy">
                  <div className="live-hero-eyebrow">{heroEyebrow}</div>
                  <div className="live-hero-name">{activeChannel.name}</div>
                  {channelNumberOf(activeChannel, categories) && (
                    <div className="live-hero-number">{channelNumberOf(activeChannel, categories)}</div>
                  )}
                  {/* EPG (feature 030, FR-025): só com dado real. Sem programa
                      atual, apenas "Ao vivo" — nunca título inventado. */}
                  <div className="live-hero-live">
                    <i className="live-hero-dot" aria-hidden="true" />
                    {activeNowNext.now ? (
                      <>
                        <b>{activeNowNext.now.title}</b>
                        <span> • ao vivo agora</span>
                      </>
                    ) : (
                      <span>Ao vivo</span>
                    )}
                  </div>
                  {activeNowNext.now && (
                    <div className="live-epg-block">
                      <span className="live-epg-time">
                        {formatEpgTimeRange(activeNowNext.now.start, activeNowNext.now.end)}
                      </span>
                      <div className="live-epg-progress" aria-hidden="true">
                        <div
                          className="live-epg-progress-fill"
                          style={{ transform: `scaleX(${activeNowNext.now.progress})` }}
                        />
                      </div>
                      {activeNowNext.now.description && (
                        <p className="live-epg-description">{activeNowNext.now.description}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Próximos programas reais (feature 048, FR-009): sem EPG, sem faixa. */}
              {activeUpcoming.length > 0 && (
                <div className="live-schedule">
                  {activeUpcoming.map((slot, index) => (
                    <div key={`${slot.start}-${index}`} className="live-schedule-card">
                      <span className="live-schedule-label">{SCHEDULE_LABELS[index]}</span>
                      <span className="live-schedule-title">{slot.title}</span>
                      <span className="live-schedule-time">{formatEpgClock(slot.start)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="live-preview-empty">
              {showingContent ? 'Selecione um canal' : 'Nenhum canal selecionado.'}
            </div>
          )}
        </div>
      )}    </>
  )
}
