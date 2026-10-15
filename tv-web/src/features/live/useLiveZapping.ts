import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { groupLabel, type CatalogItemOut } from '../catalog/catalogApi'
import { useT } from '../../lib/i18n/I18nProvider'
import type { PlayerLayerTopLayer } from '../../components/PlayerLayer'
import { trailKeyOf, type EnteredKey } from './liveTrail'
import type { LiveChannels, LiveTrail } from './useLiveCatalog'
import type { LiveGuideState } from './useLiveGuide'
import type { LiveSearch } from './useLiveSearch'

/**
 * Estado do zapping (features 016/027). Chamado no topo da `LiveScreen`
 * porque `playing` entra na leitura de EPG da lista; o comportamento vem
 * depois, em `useLiveZapping` (feature 040, `logic/divisao.md` §1.2/§3).
 */
export function useLiveZappingState() {
  const [playing, setPlaying] = useState<CatalogItemOut | null>(null)
  const [zapOpen, setZapOpen] = useState(false)
  const lastGoodChannelRef = useRef<CatalogItemOut | null>(null)
  /**
   * Vizinhança de canal do chrome (feature 027, D-008, `logic/chrome-player.md`
   * §7) — um SNAPSHOT da lista exibida no momento em que o canal começou a
   * tocar pela lista (inclusive a partir do zapping), nunca o `items`
   * corrente: `openZapping` troca `entered` para a categoria de
   * `original_group`, então ler `items` ao vivo mudaria a sequência debaixo
   * do pé de ↑/↓ no meio de uma sessão.
   */
  const zapSequenceRef = useRef<CatalogItemOut[]>([])
  /** Lista de onde o canal começou a tocar — par de `zapSequenceRef`; o "Guia" do player abre nela (feature 031, FR-010). */
  const zapKeyRef = useRef<EnteredKey | null>(null)
  /**
   * Bug `zapping-rapido-por-ch-setas-no` (016 SC-003): durante uma rajada de ↑/↓/CH±, `playing` é o canal
   * escolhido (faixa, número, EPG, foco) e `heldChannel` o que o player continua tocando; só o canal em que
   * a pessoa para é aberto, `ZAP_SETTLE_MS` depois do último toque.
   */
  const [heldChannel, setHeldChannel] = useState<CatalogItemOut | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => clearTimeout(settleTimerRef.current ?? undefined), [])
  return { playing, setPlaying, zapOpen, setZapOpen, lastGoodChannelRef, zapSequenceRef, zapKeyRef, heldChannel, setHeldChannel, settleTimerRef }
}

export type LiveZappingState = ReturnType<typeof useLiveZappingState>

/** Espera depois do último ↑/↓/CH± antes de abrir o canal escolhido (afinar na TV física). */
export const ZAP_SETTLE_MS = 600

export interface LiveZappingParams {
  zap: LiveZappingState
  guide: LiveGuideState
  trail: LiveTrail
  channels: LiveChannels
  search: LiveSearch
  setCol: Dispatch<SetStateAction<0 | 1>>
  showToast: (message: string) => void
  initialChannel: { channelId: string; entry: 'favorites' | 'category' } | undefined
}

/**
 * Zapping: tocar o canal focado, ↑/↓/CH± no player, a lista por cima do
 * vídeo e os retornos do `PlayerLayer`. Extraído da `LiveScreen` na feature
 * 040 sem mudar nada; o efeito de "entrar tocando" fica na mesma posição de
 * antes entre os efeitos da tela.
 */
export function useLiveZapping({ zap, guide, trail, channels, search, setCol, showToast, initialChannel }: LiveZappingParams) {
  const t = useT()
  const { playing, setPlaying, zapOpen, setZapOpen, lastGoodChannelRef, zapSequenceRef, zapKeyRef, heldChannel, setHeldChannel, settleTimerRef } = zap
  const { setGuide, guideWatchPendingRef } = guide
  const { categories, entered, setEntered, focusedIdentity, setFocusedIdentity } = trail
  const { items, activeChannel, contentIsLoading } = channels

  // Reproduz o canal pedido (feature 026, `logic/navegacao.md` §3) uma
  // única vez, assim que ele aparecer na lista exibida — nunca antes
  // (carregando ainda não tem `items`), nunca de novo (trocar de canal
  // depois é decisão da pessoa, não deste efeito). Mesmo caminho do OK
  // (`playActiveChannel`, abaixo) — inclusive o aviso de "sem fonte de
  // reprodução" se for o caso.
  const autoPlayedInitialChannelRef = useRef(false)
  useEffect(() => {
    if (!initialChannel || autoPlayedInitialChannelRef.current) return
    if (contentIsLoading) return
    if (!activeChannel || activeChannel.id !== initialChannel.channelId) return
    autoPlayedInitialChannelRef.current = true
    playActiveChannel()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `playActiveChannel` é recriada a cada render (lê refs/estado), mas o guard `autoPlayedInitialChannelRef` já impede qualquer segunda chamada
  }, [initialChannel, contentIsLoading, activeChannel])

  /** Encerra a espera da rajada: o player passa a abrir `playing` já. */
  function settleNow() {
    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = null
    setHeldChannel(null)
  }

  /** OK/Assistir sobre o canal focado — mesmo caminho a partir da lista ou do preview (feature 024). */
  function playActiveChannel() {
    if (!activeChannel) return
    settleNow()
    if (!activeChannel.playable) {
      // Canal existe no catálogo mas não tem fonte de reprodução: explica,
      // não tenta abrir o player (FR-012/FR-019).
      showToast(t('live.unavailableChannel'))
      return
    }

    if (zapOpen) {
      if (activeChannel.id === playing?.id) {
        setZapOpen(false) // D-007: mesmo canal — só fecha, sem trocar
        return
      }
      // feature 027, D-008: novo início pela lista — recaptura a vizinhança.
      zapSequenceRef.current = items
      zapKeyRef.current = entered
      lastGoodChannelRef.current = playing // D-008: guarda ANTES da troca
      setPlaying(activeChannel) // troca a sessão — topLayer continua aberto
      return
    }

    zapSequenceRef.current = items // feature 027, D-008
    zapKeyRef.current = entered
    setPlaying(activeChannel)
  }

  /**
   * ↑/↓ e CH± do chrome (feature 027, US2, `logic/chrome-player.md` §7):
   * troca para o canal anterior/seguinte REPRODUZÍVEL da vizinhança
   * capturada, sem voltar nas pontas (FR-011). Devolve `false` no limite —
   * `PlayerLayer` avisa e não altera a sessão. Com `hold` (padrão), o canal só
   * é aberto quando a pessoa para de trocar (ver `heldChannel`).
   */
  function stepChannel(direction: 'previous' | 'next', { hold = true }: { hold?: boolean } = {}): boolean {
    if (!playing) return false
    const seq = zapSequenceRef.current
    let i = seq.findIndex((c) => c.id === playing.id)
    if (i === -1) return false
    const delta = direction === 'next' ? 1 : -1
    do {
      i += delta
    } while (seq[i] && !seq[i].playable)
    const target = seq[i]
    if (!target) return false
    // D-008: mesmo fallback de erro da 016 — o canal que tocava antes da rajada, nunca um intermediário.
    if (!heldChannel) lastGoodChannelRef.current = playing
    if (hold) {
      if (!heldChannel) setHeldChannel(playing)
      if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current)
      settleTimerRef.current = setTimeout(settleNow, ZAP_SETTLE_MS)
    } else settleNow()
    setPlaying(target)
    setFocusedIdentity((prev) => ({ ...prev, channelId: target.id })) // FR-014
    return true
  }

  function openZapping() {
    if (!playing) return
    const targetName = groupLabel(playing.original_group ?? undefined)
    const targetCategory = categories.find((c) => groupLabel(c.name) === targetName)
    if (targetCategory && (entered?.kind !== 'category' || entered.id !== targetCategory.id)) {
      setEntered({ kind: 'category', id: targetCategory.id })
    }
    setFocusedIdentity({
      trailKey: targetCategory ? { kind: 'category', name: targetName } : (focusedIdentity.trailKey ?? { kind: 'favorites' }),
      channelId: playing.id,
    })
    setCol(1)
    setZapOpen(true)
    // O zapping nunca mostra ícone/campo de busca (feature 018, FR-018) —
    // reseta caso a busca tivesse ficado aberta antes de abrir o zap.
    search.resetSearchState()
  }

  /**
   * Fecha o player (feature 046, FR-011, `logic/memoria-foco-live.md` §4): o foco volta ao canal que
   * tocava por último, na entrada de ONDE a sessão começou (`zapKeyRef`). Sem isto, o zapping já
   * trocou a entrada exibida para a categoria do canal, e ↑/↓/CH± caminharam por outra vizinhança
   * ("Todos"/"★ Favoritos"): o canal que tocava não está na lista exibida e o foco caía no topo.
   * A memória da entrada é gravada pelo efeito de `useLiveChannels` assim que o canal está em `items`.
   */
  function onPlayerClosed() {
    const last = playing
    const origin = zapKeyRef.current
    settleNow()
    // Sessão encerrada: o fallback de erro da troca anterior (D-008 da 027) não vale para uma reprodução nova —
    // sem isto, um canal inválido iniciado depois voltava ao canal antigo em vez de mostrar o erro.
    lastGoodChannelRef.current = null
    setPlaying(null)
    if (!last || !origin) return
    // O canal que tocava já está na lista exibida: nada a restaurar — o foco fica onde a pessoa o
    // deixou (inclusive a trilha, que ela pode ter movido de propósito dentro do zapping).
    if (items.some((item) => item.id === last.id)) return
    const trailKey = trailKeyOf(origin, categories)
    if (!trailKey) return // categoria de origem sumiu: fica como está (vizinho pela 038)
    setEntered(origin)
    setFocusedIdentity({ trailKey, channelId: last.id })
  }

  function onEnteredPlaying() {
    setZapOpen(false)
    // O guia aberto do player só fecha quando o canal ESCOLHIDO nele está de fato
    // tocando (FR-022) — nunca num "voltou a tocar" qualquer da sessão atual.
    if (guideWatchPendingRef.current) {
      guideWatchPendingRef.current = false
      setGuide(null)
    }
  }

  function onSessionError() {
    const fallback = lastGoodChannelRef.current
    if (!fallback) return
    settleNow()
    lastGoodChannelRef.current = null
    setPlaying(fallback)
    showToast(t('live.zapFailed', { name: fallback.name }))
  }

  /**
   * A lista de zapping por cima do vídeo (feature 016): `content` é a trilha +
   * lista desenhadas sem preview; a navegação é a mesma da tela parada
   * (`onDirection`/`onSelect` do teclado da Live). RETURN: canais → trilha → fecha a lista.
   * Segurar OK/tecla amarela favoritam o canal focado (edge case da 016).
   */
  function zapTopLayer(content: ReactNode, onDirection: PlayerLayerTopLayer['onDirection'], onSelect: () => void): PlayerLayerTopLayer {
    return {
      content,
      onDirection,
      onSelect,
      // RETURN em camadas (feature 049, FR-006): da lista de canais volta à trilha (→/← paginam, não trocam de
      // coluna); da trilha fecha só a lista de zapping.
      onBack: () => {
        if (channels.effectiveCol === 1) setCol(0)
        else setZapOpen(false)
      },
      onLongSelect: channels.canToggleFavoriteInZap ? channels.toggleFocusedFavorite : undefined,
      onFavoriteKey: channels.canToggleFavoriteInZap ? channels.toggleFocusedFavorite : undefined,
    }
  }

  return { playActiveChannel, stepChannel, openZapping, onPlayerClosed, onEnteredPlaying, onSessionError, zapTopLayer }
}

export type LiveZapping = ReturnType<typeof useLiveZapping>
