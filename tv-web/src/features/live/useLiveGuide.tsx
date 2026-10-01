import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { groupLabel, type CatalogItemOut } from '../catalog/catalogApi'
import type { PlayerLayerTopLayer } from '../../components/PlayerLayer'
import type { MediaKey } from '../../lib/tizenMediaKeys'
import { EpgGuide, type EpgGuideHandle } from './guide/EpgGuide'
import type { EnteredKey, TrailKey } from './liveTrail'
import type { LiveChannels, LiveTrail } from './useLiveCatalog'
import type { LiveSearch } from './useLiveSearch'
import type { LiveZappingState } from './useLiveZapping'

/**
 * Guia completo aberto (feature 031): a lista e o canal de origem. Vive na
 * tela porque o guia pode estar no lugar do conteúdo (parado) ou no
 * `topLayer` do player (tocando) — nunca nos dois. Estado no topo da
 * `LiveScreen`; o comportamento vem em `useLiveGuide` (feature 040).
 */
export function useLiveGuideState() {
  const [guide, setGuide] = useState<{ list: EnteredKey; originId: string | null } | null>(null)
  const guideRef = useRef<EpgGuideHandle>(null)
  /** `true` entre "OK num programa" com o guia aberto no player e o canal escolhido começar a tocar. */
  const guideWatchPendingRef = useRef(false)
  return { guide, setGuide, guideRef, guideWatchPendingRef }
}

export type LiveGuideState = ReturnType<typeof useLiveGuideState>

export interface LiveGuideParams {
  guide: LiveGuideState
  zap: LiveZappingState
  trail: LiveTrail
  channels: LiveChannels
  search: LiveSearch
  setCol: Dispatch<SetStateAction<0 | 1 | 2>>
  sourceId: string
  onOpenEpgSettings: (() => void) | undefined
  showToast: (message: string) => void
}

/**
 * Abrir/assistir pelo guia completo (feature 031) e o próprio guia: o
 * elemento `<EpgGuide>` (um só, desenhado parado no lugar do conteúdo OU
 * tocando como `topLayer` do player — nunca nos dois) e o encaminhamento de
 * teclas para ele. Extraído da `LiveScreen` na feature 040 sem mudar nada.
 */
export function useLiveGuide({
  guide,
  zap,
  trail,
  channels,
  search,
  setCol,
  sourceId,
  onOpenEpgSettings,
  showToast,
}: LiveGuideParams) {
  const { guide: openGuide, setGuide, guideRef, guideWatchPendingRef } = guide
  const { playing, setPlaying, lastGoodChannelRef, zapSequenceRef, zapKeyRef } = zap
  const { categories, entered, setEntered, setFocusedIdentity } = trail
  const { activeChannel } = channels

  /**
   * "Guia completo" do preview (feature 031, FR-009): abre o guia na lista de
   * origem, com o foco no canal de origem. `setCol(1)` devolve o foco de
   * volta à lista de canais — assim, ao voltar (RETURN), o foco cai no canal
   * de origem (FR-012), e não no preview.
   */
  function openGuideFromPreview() {
    if (!activeChannel || !entered) return
    setCol(1)
    setGuide({ list: entered, originId: activeChannel.id })
  }

  /**
   * OK num programa/bloco vazio do guia (feature 031, FR-020, D-007): a lista
   * exibida vira a vizinhança de zapping e o foco da Live TV vai para o canal
   * escolhido (assim RETURN do player cai nele — FR-012). Mesmo canal: só
   * fecha. Aberto do player o guia fica até `onEnteredPlaying` (FR-022); parado,
   * o player cobre tudo e o guia fecha na hora.
   */
  function watchFromGuide(channel: CatalogItemOut, list: CatalogItemOut[], listKey: EnteredKey) {
    zapSequenceRef.current = list
    zapKeyRef.current = listKey
    const category = listKey.kind === 'category' ? categories.find((candidate) => candidate.id === listKey.id) : undefined
    if (listKey.kind === 'category' && !category) {
      // Categoria que já não existe: não mexe na entrada, só no canal focado.
      setFocusedIdentity((prev) => ({ ...prev, channelId: channel.id }))
    } else {
      const trailKey: TrailKey = category ? { kind: 'category', name: groupLabel(category.name) } : { kind: listKey.kind === 'all' ? 'all' : 'favorites' }
      setEntered(listKey)
      setFocusedIdentity({ trailKey, channelId: channel.id })
    }
    setCol(1)
    search.resetSearchState()
    if (playing?.id === channel.id) {
      setGuide(null) // mesmo canal: só fecha, sem trocar a sessão
      return
    }
    lastGoodChannelRef.current = playing // D-008 da 027: fallback de erro
    setPlaying(channel)
    if (!playing) setGuide(null)
    else guideWatchPendingRef.current = true // player: o guia só fecha em `onEnteredPlaying`
  }

  /** "Guia" do chrome do player (feature 031, FR-010): abre na lista de origem do canal, com o foco nele; a sessão segue tocando. */
  function openGuideFromPlayer() {
    if (!playing) return
    guideWatchPendingRef.current = false
    setGuide({ list: zapKeyRef.current ?? { kind: 'all' }, originId: playing.id })
  }

  /**
   * CH±/ChannelUp/Down (feature 031, FR-015): pagina o guia — parado (teclado
   * da tela) ou tocando (`topLayer` do player). Mesma convenção do player:
   * ChannelUp = anterior.
   */
  function pageGuide(key: MediaKey) {
    if (key === 'ChannelUp') guideRef.current?.onPage('previous')
    else if (key === 'ChannelDown') guideRef.current?.onPage('next')
  }

  /** O guia aberto, ou `null` — o mesmo elemento serve parado e sobre o player. */
  const guideElement = openGuide ? (
    <EpgGuide
      handleRef={guideRef}
      sourceId={sourceId}
      categories={categories}
      initialList={openGuide.list}
      initialChannelId={openGuide.originId}
      onWatch={watchFromGuide}
      onClose={() => setGuide(null)}
      onOpenEpgSettings={onOpenEpgSettings}
      onNotify={showToast}
    />
  ) : null

  /**
   * Guia completo com o canal tocando (feature 031, D-001/D-002): a sessão
   * segue viva atrás dele; o `PlayerLayer` encaminha as teclas por aqui (o
   * guia não registra teclado próprio). Retorna `null` quando não há guia
   * aberto — `LiveScreen` passa direto ao `topLayer` do `PlayerLayer`.
   * O `\u003cEpgGuide\u003e` vem de `guideElement` (gerado uma vez só) para não
   * duplicar a montagem (feature 040, C-01).
   */
  function guideTopLayer(): PlayerLayerTopLayer | null {
    if (!guideElement) return null
    return {
      content: guideElement,
      onDirection: (dir) => guideRef.current?.onDirection(dir),
      onSelect: () => guideRef.current?.onSelect(),
      onBack: () => guideRef.current?.onBack(),
      onMediaKey: pageGuide,
    }
  }

  return { openGuideFromPreview, watchFromGuide, openGuideFromPlayer, pageGuide, guideElement, guideTopLayer }
}

export type LiveGuide = ReturnType<typeof useLiveGuide>
