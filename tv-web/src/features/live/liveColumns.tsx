import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import { groupLabel, stableIdOf } from '../catalog/catalogApi'
import { nowNextForChannel } from '../../lib/epg/nowNext'
import { formatEpgTimeRange } from '../../lib/epg/formatEpgTime'
import { FavoriteHint, FavoritesEmptyState, FavoritesUnresolvedNote } from '../favorites/FavoritesState'
import { AppShell } from '../shell/AppShell'
import { TopBar } from '../shell/TopBar'
import type { TopbarItem } from '../../navigation/appNav'
import { SideCategoryNav, type SideCategoryNavEntry } from '../../components/SideCategoryNav'
import { ChannelRow } from '../../components/ChannelRow'
import { PosterArt } from '../../components/PosterArt'
import { ErrorState } from '../../components/ErrorState'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { Icon } from '../../components/Icon'
import { describeError } from '../../lib/errors/errorCatalog'
import { channelNumberOf, knownCategoryCount } from './channelNumber'
import { LIVE_HINTS, trailEntryId, type TrailEntry } from './liveTrail'
import type { LiveShellProps } from './LiveScreen'
import type { LiveChannels, LiveTrail } from './useLiveCatalog'
import type { LiveSearch } from './useLiveSearch'

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
  previewAction: number
  setCol: Dispatch<SetStateAction<0 | 1 | 2>>
  enterTrailEntry: (entry: TrailEntry) => void
  onResync: () => void
  /** Feature 042 (FR-004): sem conexão, "Ressincronizar lista" fica soft disabled com o motivo. */
  offline: boolean
  channelListRef: RefObject<HTMLDivElement | null>
  channelVirtualizer: Virtualizer<HTMLDivElement, Element>
}

export function renderLiveColumns(model: LiveColumnsModel, withPreview: boolean): ReactNode {
  const { trail, search, channels, zapOpen, contentActive, previewAction, setCol, enterTrailEntry, onResync } = model
  const { channelListRef, channelVirtualizer } = model
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
  const { searchActive, searchTerm, setSearchTerm, topFocused, setTopFocused, searchInputRef, belowMinimum } = search
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
    activeChannelIsFavorite,
    epgNow,
    epgLookup,
    activeNowNext,
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
      : groupLabel(focusedCategory?.name)

  const sideEntries: SideCategoryNavEntry[] = entries.map((entry) => {
    if (entry.key.kind === 'favorites') {
      return {
        id: trailEntryId(entry),
        label: 'Favoritos',
        icon: 'favorite',
        count: favoriteIds.size,
        pinned: true,
        pinnedBadge: false,
      }
    }
    if (entry.key.kind === 'all') {
      return { id: trailEntryId(entry), label: 'Todos', pinned: true, pinnedBadge: false }
    }
    return {
      id: trailEntryId(entry),
      label: groupLabel(entry.category?.name),
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

      <div className="live-column live-column-channels">
        <div className="category-title-row">
          <div className="live-column-title">{entryLabel}</div>
          {/* Ícone de busca (feature 018, FR-001): só quando há itens
              carregados (D-006) e nunca dentro do zapping (FR-018).
              `!contentUnavailable` evita o ícone aparecer sobre um
              `baseItems` obsoleto — `loadCategoryContent` sempre lê
              `channels`, que pode reter registros de uma geração
              anterior mesmo com outcome `source_missing`/`failed`
              (achado durante o gate final da feature 018, T029). */}
          {!zapOpen && !searchActive && !contentUnavailable && baseItems.length > 0 && (
            <button
              type="button"
              className={`search-icon-button${effectiveCol === 1 && topFocused ? ' tv-focus' : ''}`}
              aria-label="Buscar"
            >
              <Icon name="search" />
            </button>
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
          <>
            <FavoriteHint />
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
                      className={`live-channel-row${
                        effectiveCol === 1 && !topFocused && channelIdx === virtualRow.index ? ' tv-focus' : ''
                      }`}
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
                      />
                      {enteredAll && (
                        <span className="live-item-group">{groupLabel(channel.original_group ?? undefined)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
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
              <PosterArt url={activeChannel.icon_url ?? undefined} title={activeChannel.name} variant="logo" />
              <div className="live-channel-name">{activeChannel.name}</div>
              {channelNumberOf(activeChannel, categories) && (
                <div className="live-channel-number">{channelNumberOf(activeChannel, categories)}</div>
              )}
              <div className="live-channel-meta">{groupLabel(activeChannel.original_group ?? undefined)}</div>
              {/* EPG (feature 030, FR-025): "Agora" e "A seguir" só com dado
                  real — sem programação, a área fica vazia e sem rótulo
                  solto. Reservar a área evita o layout pular quando o dado
                  chega. */}
              <div className="live-channel-now">
                {activeNowNext.now && (
                  <div className="live-epg-block">
                    <span className="live-epg-label">Agora</span>
                    <span className="live-epg-title">{activeNowNext.now.title}</span>
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
                {activeNowNext.next && (
                  <div className="live-epg-block">
                    <span className="live-epg-label">A seguir</span>
                    <span className="live-epg-title">{activeNowNext.next.title}</span>
                    <span className="live-epg-time">
                      {formatEpgTimeRange(activeNowNext.next.start, activeNowNext.next.end)}
                    </span>
                  </div>
                )}
              </div>
              <div className="live-preview-actions">
                <button
                  type="button"
                  className={`live-preview-action${effectiveCol === 2 && previewAction === 0 ? ' tv-focus' : ''}${
                    !activeChannel.playable ? ' is-soft-disabled' : ''
                  }`}
                  // Achado real (feature 028, FR-016): sem sinal estático da indisponibilidade quando o canal não é reproduzível.
                  aria-disabled={!activeChannel.playable ? 'true' : undefined}
                >
                  Assistir
                </button>
                <button
                  type="button"
                  className={`live-preview-action${effectiveCol === 2 && previewAction === 1 ? ' tv-focus' : ''}`}
                >
                  {activeChannelIsFavorite ? 'Favorito' : 'Favoritar'}
                </button>
                <button
                  type="button"
                  className={`live-preview-action${effectiveCol === 2 && previewAction === 2 ? ' tv-focus' : ''}`}
                >
                  Guia completo
                </button>
              </div>
            </>
          ) : (
            <div className="live-preview-empty">
              {showingContent ? 'Selecione um canal' : 'Nenhum canal selecionado.'}
            </div>
          )}
        </div>
      )}
    </>
  )
}
