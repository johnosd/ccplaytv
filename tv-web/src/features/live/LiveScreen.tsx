import { useMemo, useState } from 'react'
import { useChannels, type CatalogItemOut } from '../catalog/catalogApi'
import { groupChannels, type ChannelGroup } from './groupChannels'
import { PlayerOverlay } from './PlayerOverlay'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'

export interface LiveScreenProps {
  sourceId: string
  onBack: () => void
}

/** Identidade do item em foco — o que sobrevive a uma troca de catálogo em
 * segundo plano (feature 004, atualização por idade). É a fonte da verdade
 * guardada em estado; `groupIdx`/`channelIdx` são sempre DERIVADOS dela a
 * cada render (nunca o contrário), então não existe um frame em que o
 * índice aponta para dado antigo — se o catálogo mudou, a identidade é
 * relocalizada no mesmo cálculo que descobre onde ela está agora. */
interface FocusIdentity {
  groupName: string | null
  channelId: string | null
}

function identityAt(groups: ChannelGroup[], groupIdx: number, channelIdx: number): FocusIdentity {
  const group = groups[groupIdx]
  return {
    groupName: group?.name ?? null,
    channelId: group?.channels[channelIdx]?.id ?? null,
  }
}

/** Índice da identidade em `groups`, ou 0 se ela não existir mais (grupo/
 * canal removido do catálogo novo) — cai no início em vez de adivinhar. */
function locate<T>(items: T[], matches: (item: T) => boolean): number {
  const idx = items.findIndex(matches)
  return idx === -1 ? 0 : idx
}

export function LiveScreen({ sourceId, onBack }: LiveScreenProps) {
  const [col, setCol] = useState<0 | 1>(0)
  const [playing, setPlaying] = useState<CatalogItemOut | null>(null)
  const { toastMessage, showToast } = useToast()

  const query = useChannels(sourceId)
  const groups = useMemo(() => groupChannels(query.data?.items ?? []), [query.data])

  const [focusedIdentity, setFocusedIdentity] = useState<FocusIdentity>(() =>
    identityAt(groups, 0, 0),
  )

  const groupIdx = locate(groups, (g) => g.name === focusedIdentity.groupName)
  const activeGroup = groups[groupIdx]
  const channelIdx = locate(activeGroup?.channels ?? [], (c) => c.id === focusedIdentity.channelId)
  const activeChannel = activeGroup?.channels[channelIdx]

  // Quando a camada de reprodução está aberta, ela é dona do teclado
  // (`modal: true`), então esta tela ignora as teclas — nada de navegar a
  // lista por trás do player.
  useRemoteNav({
    onDirection: (dir) => {
      if (playing) return
      if (dir === 'left') setCol(0)
      if (dir === 'right') setCol(1)

      if (col === 0) {
        if (dir === 'up' || dir === 'down') {
          const next = clamp(groupIdx + (dir === 'down' ? 1 : -1), 0, groups.length - 1)
          if (next !== groupIdx) {
            // Trocar de grupo recomeça no primeiro canal — o item anterior de
            // OUTRO grupo não é uma posição significativa.
            setFocusedIdentity(identityAt(groups, next, 0))
          }
        }
      } else {
        const total = activeGroup?.channels.length ?? 0
        if (dir === 'up' || dir === 'down') {
          const next = clamp(channelIdx + (dir === 'down' ? 1 : -1), 0, Math.max(0, total - 1))
          setFocusedIdentity(identityAt(groups, groupIdx, next))
        }
      }
    },
    onSelect: () => {
      if (playing || col !== 1 || !activeChannel) return
      if (!activeChannel.playable) {
        // Canal existe no catálogo mas não tem fonte de reprodução: explica,
        // não tenta abrir o player (FR-012).
        showToast('Este canal não tem uma fonte de reprodução disponível.')
        return
      }
      setPlaying(activeChannel)
    },
    onBack: () => {
      if (playing) return
      onBack()
    },
  })

  if (query.isLoading) {
    return (
      <div className="screen">
        <div className="screen-title">Live TV</div>
        <div className="live-state">
          <div className="live-state-copy">Carregando canais…</div>
          {/* Todo estado precisa de saída focável, ou o controle fica preso
              (constitution, "Foco Visível e Sem Becos Sem Saída"). */}
          <button type="button" className="live-state-action tv-focus">
            Voltar
          </button>
        </div>
        <Toast message={toastMessage} />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="screen">
        <div className="screen-title">Live TV</div>
        <div className="live-state">
          <div className="live-state-title">Não foi possível carregar os canais</div>
          <div className="live-state-copy">
            Verifique a conexão com o servidor e tente novamente.
          </div>
          <div className="live-state-actions">
            <button
              type="button"
              className="live-state-action tv-focus"
              onClick={() => void query.refetch()}
            >
              Tentar de novo
            </button>
            <button type="button" className="live-state-action">
              Voltar
            </button>
          </div>
        </div>
        <Toast message={toastMessage} />
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="screen">
        <div className="screen-title">Live TV</div>
        <div className="live-state">
          <div className="live-state-title">Nenhum canal nesta lista</div>
          <div className="live-state-copy">
            A importação pode não ter encontrado canais nesta fonte, ou ainda estar em
            andamento.
          </div>
          <button type="button" className="live-state-action tv-focus">
            Voltar
          </button>
        </div>
        <Toast message={toastMessage} />
      </div>
    )
  }

  return (
    <div className="screen screen-row">
      <div className="live-column live-column-groups">
        <div className="live-column-title">Grupos</div>
        {groups.map((group, i) => (
          <button
            key={group.name}
            type="button"
            className={`live-item${col === 0 && groupIdx === i ? ' tv-focus' : ''}`}
          >
            {group.name}
          </button>
        ))}
      </div>

      <div className="live-column live-column-channels">
        <div className="live-column-title">{activeGroup?.name}</div>
        {activeGroup?.channels.length === 0 && (
          <div className="live-state-copy">Este grupo está vazio.</div>
        )}
        {activeGroup?.channels.map((channel, i) => (
          <button
            key={channel.id}
            type="button"
            className={`live-item${col === 1 && channelIdx === i ? ' tv-focus' : ''}${
              channel.playable ? '' : ' live-item-unavailable'
            }`}
          >
            <span className="live-item-logo" aria-hidden="true" />
            <span className="live-item-name">{channel.name}</span>
            {!channel.playable && <span className="live-item-badge">Indisponível</span>}
          </button>
        ))}
        {activeGroup?.truncated && (
          // Fala do limite de exibição, não do tamanho da fonte — a distinção
          // importa porque o catálogo publicado pode ser parcial (FR-016).
          <div className="live-truncated-note">
            Mostrando os primeiros {activeGroup.channels.length} de {activeGroup.totalCount}{' '}
            canais deste grupo.
          </div>
        )}
      </div>

      <div className="live-preview-panel">
        <div className="live-preview-box">
          <div className="live-preview-logo" aria-hidden="true" />
        </div>
        <div className="live-channel-name">{activeChannel?.name ?? 'Selecione um canal'}</div>
        <div className="live-channel-meta">{activeGroup?.name}</div>
        {/* Slot de EPG: nasce vazio e sem rótulo até existir fonte de dados
            (item 44 do backlog). Reservar a área evita o layout pular depois. */}
        <div className="live-channel-now" />
      </div>

      {playing && (
        <PlayerOverlay
          itemId={playing.id}
          channelName={playing.name}
          onClose={() => setPlaying(null)}
        />
      )}

      <Toast message={toastMessage} />
    </div>
  )
}
