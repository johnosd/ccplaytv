import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { PlayerLayer } from '../../components/PlayerLayer'
import { useToast } from '../../lib/useToast'
import { useOnlineStatus } from '../../lib/onlineStatus'
import { useT } from '../../lib/i18n/I18nProvider'
import { Toast } from '../../components/Toast'
import { useVirtualFocusSync } from '../../lib/focus/useVirtualFocusSync'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import type { TopbarItem } from '../../navigation/appNav'
import { ErrorState } from '../../components/ErrorState'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { Chip } from '../../components/Chip'
import { channelNumberOf, knownCategoryCount } from './channelNumber'
import { useOverflowEdges } from '../../lib/focus/useOverflowEdges'
import {
  LIVE_EDGE_SCROLL_PADDING_END,
  LIVE_EDGE_SCROLL_PADDING_START,
  LIVE_ITEM_OVERSCAN,
  LIVE_ITEM_ROW_HEIGHT,
  liveGroupDisplay,
} from './liveTrail'
import { useLiveChannels, useLiveTrail } from './useLiveCatalog'
import { useLiveSearch } from './useLiveSearch'
import { useLiveZapping, useLiveZappingState } from './useLiveZapping'
import { useLiveGuide, useLiveGuideState } from './useLiveGuide'
import { useLiveKeyboard } from './useLiveKeyboard'
import { useLiveArchive, useLiveArchiveState } from './useLiveArchive'
import { renderLiveColumns, renderLiveShell, type LiveColumnsModel } from './liveColumns'

/**
 * Moldura V14 da Live (feature 024, FR-001..FR-004): topbar persistente por
 * cima das colunas. Opcional — sem ela, a tela funciona sozinha como antes
 * (é assim que os testes de comportamento e o contrato travado da 018 a
 * montam). `logic/foco-live-shell.md` da 024.
 */
export interface LiveShellProps {
  /** Nome da lista ativa, para o indicador da topbar. */
  sourceName: string
  /** OK em "Início" na topbar. */
  onGoHome: () => void
  /** OK em Filmes/Séries na topbar — troca de destino sem empilhar a Live (D-004). */
  onSwitchTop: (destination: 'movies' | 'series') => void
  /** OK no indicador da lista ativa. */
  onOpenProfiles: () => void
  /**
   * OK na lupa/engrenagem da topbar (feature 026, D-001 — opcional: o
   * contrato travado da 024 monta este objeto com 4 campos, e o `tsc -b`
   * compila esse arquivo). Ausente = soft disabled.
   */
  onOpenSearch?: () => void
  onOpenSettings?: () => void
}

export interface LiveScreenProps {
  sourceId: string
  onBack: () => void
  /** Feature 014, D-008: ressincroniza a fonte quando o arquivo guardado de uma categoria sumiu do aparelho. */
  onResync: () => void
  /** Feature 042: "Editar lista" do erro de fonte no player (credencial recusada/conta expirada). */
  onEditSource?: (sourceId: string) => void
  /** Feature 024. */
  shell?: LiveShellProps
  /**
   * Entra tocando este canal, uma única vez (feature 026, `logic/
   * navegacao.md` §3) — do Início (card de "Canais favoritos") ou da Busca
   * global (resultado de canal). `entry: 'favorites'` entra em
   * `★ Favoritos`; `entry: 'category'` lê a categoria do canal
   * (`useCatalogItem`) e entra nela. Canal não encontrado: fica na entrada
   * padrão, sem reprodução nem mensagem de erro inventada.
   */
  initialChannel?: { channelId: string; entry: 'favorites' | 'category' }
  /** Entra direto em `★ Favoritos`, sem canal específico ("Ver todos" do Início). */
  openFavorites?: boolean
  /** Remonta com a topbar ativa neste item — volta de Busca/Configurações (FR-034/FR-044). */
  initialTopbarItem?: TopbarItem
}

/**
 * TV ao vivo. Desde a feature 040 este arquivo só COMPÕE
 * (`sdd/specs/040-dividir-player-live/logic/divisao.md` §3): trilha e lista
 * (`useLiveCatalog`), busca (`useLiveSearch`), zapping (`useLiveZapping`),
 * guia (`useLiveGuide`), teclado (`useLiveKeyboard`) e desenho
 * (`liveColumns`, como funções). Os hooks são chamados na ordem em que os
 * efeitos sempre rodaram: toast → favoritar → trilha → busca → lista/EPG →
 * entrar tocando → lista virtualizada → teclado.
 */
const noop = (): void => {}

export function LiveScreen({
  sourceId,
  onBack,
  onResync: onResyncRequested,
  onEditSource,
  shell,
  initialChannel,
  openFavorites,
  initialTopbarItem,
}: LiveScreenProps) {
  const t = useT()
  // Feature 042 (FR-004): ressincronizar precisa de internet. Offline a ação é soft
  // disabled na tela e o OK do teclado (que chama a mesma função) também não a dispara.
  const online = useOnlineStatus()
  const onResync = online ? onResyncRequested : noop
  // Entra direto em ★ Favoritos quando pedido pelo Início/Busca (feature
  // 026) — `openFavorites` ou qualquer `initialChannel` com `entry:
  // 'favorites'`; `entry: 'category'` precisa de um efeito (a categoria só
  // se sabe depois de ler o registro do canal), tratado em `useLiveChannels`.
  const startsInFavorites = openFavorites || initialChannel?.entry === 'favorites'
  const [col, setCol] = useState<0 | 1>(startsInFavorites ? 1 : 0)
  const zap = useLiveZappingState()
  const guide = useLiveGuideState()
  // Feature 058: programa de arquivo em reprodução (nunca persistido).
  const archiveState = useLiveArchiveState()
  const { toastMessage, toastKey, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  // Composição de foco topbar ↔ conteúdo (feature 024, D-003 do plan.md —
  // `logic/foco-live-shell.md` §2), mesmo mecanismo da feature 023. Só
  // existe de fato com `shell`; sem ele, `zone` nunca sai de 'content'.
  // `initialTopbarItem` (feature 026, FR-034/FR-044) começa com a topbar já
  // ativa nesse item, em vez do conteúdo.
  const [zone, setZone] = useState<'topbar' | 'content'>(initialTopbarItem ? 'topbar' : 'content')
  const [topbarItem, setTopbarItem] = useState<TopbarItem>(initialTopbarItem ?? 'live')
  const contentActive = !shell || zone === 'content'

  const trail = useLiveTrail({ sourceId, startsInFavorites, initialChannelId: initialChannel?.channelId ?? null })
  // Alterna entre "Tentar de novo" (0) e "Voltar" (1) no estado de erro de
  // topo — os outros dois (loading/empty) têm uma ação só, sempre focada.
  const [topErrorActionIndex, setTopErrorActionIndex] = useState(0)

  const search = useLiveSearch()
  const channels = useLiveChannels({
    sourceId,
    initialChannelCategoryLookup: initialChannel?.entry === 'category' ? initialChannel.channelId : null,
    trail,
    search,
    col,
    setCol,
    playing: zap.playing,
    zapOpen: zap.zapOpen,
    favoriteToggle,
  })
  const zapping = useLiveZapping({ zap, guide, trail, channels, search, setCol, showToast, initialChannel })

  // Só o painel de conteúdo (col 1) é virtualizado — nunca a trilha de
  // categorias (D-004). Uma única lane: lista 1D de canais, sem `lanes`.
  const channelListRef = useRef<HTMLDivElement>(null)
  const channelVirtualizer = useVirtualizer({
    count: channels.items.length,
    // Rajadas de scroll e Live ↔ zapping não podem empilhar flushSync do virtualizador com
    // as atualizações dos indicadores de borda. O React agrupa as notificações da lista.
    useFlushSync: false,
    getScrollElement: () => channelListRef.current,
    estimateSize: () => LIVE_ITEM_ROW_HEIGHT,
    overscan: LIVE_ITEM_OVERSCAN,
    // O item focado nunca fica sob o degradê de continuação (feature 048, FR-021).
    scrollPaddingStart: LIVE_EDGE_SCROLL_PADDING_START,
    scrollPaddingEnd: LIVE_EDGE_SCROLL_PADDING_END,
  })
  const trailScrollRef = useRef<HTMLDivElement>(null)
  const channelEdges = useOverflowEdges(channelListRef, channels.items.length)
  const trailEdges = useOverflowEdges(trailScrollRef, trail.trail.length)

  const channelsNavigable =
    channels.effectiveCol === 1 && !channels.contentIsLoading && !channels.contentUnavailable && channels.items.length > 0
  useVirtualFocusSync({
    focusedIndex: channels.channelIdx,
    scrollToIndex: channelVirtualizer.scrollToIndex,
    enabled: channelsNavigable,
  })

  const liveGuide = useLiveGuide({ guide, zap, trail, channels, search, setCol, sourceId, showToast, archive: archiveState })
  const { enterTrailEntry, handleTrailDirection, handleTrailSelect } = useLiveKeyboard({
    sourceId,
    contentActive,
    hasShell: shell !== undefined,
    setZone,
    setTopbarItem,
    setCol,
    channelListRef,
    trailScrollRef,
    topErrorActionIndex,
    setTopErrorActionIndex,
    onBack,
    onResync,
    trail,
    search,
    channels,
    zap,
    zapping,
    guide,
    liveGuide,
  })
  // Feature 058 (`logic/arquivo.md` §7): depois do teclado, para não mudar a ordem dos efeitos existentes (040).
  const liveArchive = useLiveArchive({ sourceId, archiveState, zap, zapping, guide })

  const shellModel = { shell, zone, setZone, topbarItem, setTopbarItem, onBack, t }
  const { categoriesQuery, categories, topPhase, focusedCategory, isFavoritesFocused, isAllFocused, enteredFavorites, enteredAll } = trail
  const { playing, zapOpen } = zap

  if (topPhase === 'loading') {
    return renderLiveShell(
      shellModel,
      <div className="screen live-screen">
        <div className="live-state-wrapper">
          <Spinner size={48} />
          <EmptyState title={t('live.loading')} action={{ label: t('common.back'), onSelect: onBack }} focused />
        </div>
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  if (topPhase === 'error') {
    return renderLiveShell(
      shellModel,
      <div className="screen live-screen">
        <ErrorState
          title={t('live.topError.title')}
          description={t('live.topError.description')}
          actions={[
            { label: t('guide.retry'), onSelect: () => void categoriesQuery.refetch() },
            { label: t('common.back'), onSelect: onBack },
          ]}
          focusedActionIndex={topErrorActionIndex}
        />
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  if (topPhase === 'empty') {
    return renderLiveShell(
      shellModel,
      <div className="screen live-screen">
        <EmptyState
          title={t('live.topEmpty.title')}
          description={t('live.topEmpty.description')}
          action={{ label: t('common.back'), onSelect: onBack }}
          focused
        />
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  const columnsModel: LiveColumnsModel = {
    trail,
    search,
    channels,
    zapOpen,
    contentActive,
    setCol,
    enterTrailEntry,
    onResync,
    offline: !online,
    channelListRef,
    channelVirtualizer,
    trailScrollRef,
    trailEdges,
    channelEdges,
    playingId: zap.playing?.id,
    t,
  }

  // Contagem conhecida da entrada exibida no cabeçalho (FR-006) — a mesma
  // regra do trilho (FR-008): nunca inventada, ausente quando desconhecida.
  const headerCount = isFavoritesFocused || enteredFavorites
    ? channels.favoriteIds.size
    : focusedCategory
      ? knownCategoryCount(focusedCategory)
      : undefined
  const headerLabel = isAllFocused || enteredAll
    ? t('live.all')
    : isFavoritesFocused || enteredFavorites
      ? t('live.favoritesStar')
      : liveGroupDisplay(focusedCategory?.name, t)

  return (
    <>
      {/* Guia completo parado (feature 031, FR-001): tela cheia, sem topbar, no lugar do conteúdo. */}
      {!playing && guide.guide && (
        <div className="screen epg-guide-screen">
          {liveGuide.guideElement}
        </div>
      )}

      {!playing &&
        !guide.guide &&
        renderLiveShell(
          shellModel,
          <div className="screen live-screen">
            <div className="live-header">
              <div className="live-header-titles">
                <h1 className="screen-title">{t('live.title')}</h1>
                <p className="live-header-sub">{t('live.subtitle')}</p>
              </div>
              <div className="live-header-chips">
                <Chip selected>{headerLabel}</Chip>
                {headerCount !== undefined && <Chip selected={false}>{t('live.channelCount', { n: headerCount })}</Chip>}
              </div>
            </div>
            <div className="live-body">{renderLiveColumns(columnsModel, true)}</div>
          </div>,
        )}

      {playing && (
        <PlayerLayer
          itemId={playing.id}
          title={playing.name}
          identity={{
            title: playing.name,
            channelNumber: channelNumberOf(playing, categories),
            logoUrl: playing.icon_url ?? undefined,
            // Feature 030 (FR-026): programa atual do canal em reprodução;
            // acompanha a troca de canal (zapping/CH±) porque `playing` muda.
            now: channels.playingNow,
          }}
          onChannelStep={liveArchive.onChannelStep}
          onEditSource={onEditSource}
          onClose={liveArchive.onPlayerClose}
          onIdleSelect={zapping.openZapping}
          onGuide={liveGuide.openGuideFromPlayer}
          onEnteredPlaying={zapping.onEnteredPlaying}
          onSessionError={liveArchive.onSessionError}
          archive={liveArchive.playerArchive}
          onArchiveEnded={liveArchive.onArchiveEnded}
          onGoLive={liveArchive.onGoLive}
          startOver={liveArchive.startOver}
          topLayer={
            zapOpen
              ? zapping.zapTopLayer(
                  <div className="player-zap-columns">{renderLiveColumns(columnsModel, false)}</div>,
                  handleTrailDirection,
                  handleTrailSelect,
                )
              : liveGuide.guideTopLayer()
          }
          unavailableMessage={t('live.unavailableChannel')}
          genericErrorMessage={t('live.playError')}
        />
      )}

      <Toast message={toastMessage} messageKey={toastKey} />
    </>
  )
}
