import { useState } from 'react'
import {
  groupLabel,
  useCategoryContent,
  useCategoryFocusPrefetch,
  useCategoryList,
  type CatalogItemOut,
} from '../catalog/catalogApi'
import { PlayerOverlay } from './PlayerOverlay'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'

export interface LiveScreenProps {
  sourceId: string
  onBack: () => void
}

/**
 * Identidade do que está em foco — o que sobrevive a uma troca de catálogo
 * em segundo plano (feature 004) e a uma revalidação de categoria (feature
 * 010, FR-019). `categoryIdx`/`channelIdx` são sempre DERIVADOS dela a cada
 * render, nunca o contrário: não existe um frame em que o índice aponta
 * para dado antigo.
 */
interface FocusIdentity {
  categoryName: string | null
  channelId: string | null
}

/** Índice da identidade na lista, ou 0 se ela não existir mais — cai no início em vez de adivinhar. */
function locate<T>(items: T[], matches: (item: T) => boolean): number {
  const idx = items.findIndex(matches)
  return idx === -1 ? 0 : idx
}

export function LiveScreen({ sourceId, onBack }: LiveScreenProps) {
  const [col, setCol] = useState<0 | 1>(0)
  const [playing, setPlaying] = useState<CatalogItemOut | null>(null)
  const { toastMessage, showToast } = useToast()

  // Estrutura: rápida, sempre segura de ler — nunca toca rede (FR-004).
  const categoriesQuery = useCategoryList(sourceId, 'channel')
  const categories = categoriesQuery.data ?? []

  const [focusedIdentity, setFocusedIdentity] = useState<FocusIdentity>({
    categoryName: null,
    channelId: null,
  })
  const categoryIdx =
    focusedIdentity.categoryName === null
      ? 0
      : locate(categories, (c) => groupLabel(c.name) === focusedIdentity.categoryName)
  const focusedCategory = categories[categoryIdx]

  // Pré-busca a categoria em foco depois que o cursor para nela por um
  // instante (amortecido — ver `useCategoryFocusPrefetch`). Desvio
  // deliberado de FR-004, pedido pelo usuário em 23/09/2026 ao ver a
  // entrada sempre parecer "primeira vez" na TV física; registrado em
  // `plan.md` R-013.
  useCategoryFocusPrefetch(sourceId, focusedCategory)

  /**
   * "Entrada" na categoria — o que a pessoa comprometeu-se a ver (coluna de
   * canais) troca de coluna e exibe o conteúdo. Como a categoria em foco já
   * costuma estar pré-buscada (acima), isto raramente dispara rede de novo
   * — mas quem decide se a exibição depende de categoria "entrada" ou só
   * "focada" é aqui, não o pré-fetch.
   */
  const [enteredCategoryId, setEnteredCategoryId] = useState<number | null>(null)
  const enteredCategory = categories.find((c) => c.id === enteredCategoryId)
  const content = useCategoryContent(sourceId, enteredCategory)
  const items = content.data?.items ?? []

  const channelIdx = locate(items, (c) => c.id === focusedIdentity.channelId)
  const activeChannel = items[channelIdx]

  function enter(category: (typeof categories)[number]) {
    if (enteredCategoryId !== category.id) {
      setEnteredCategoryId(category.id)
      // Trocar de categoria recomeça no primeiro canal — o item anterior de
      // OUTRA categoria não é uma posição significativa.
      setFocusedIdentity({ categoryName: groupLabel(category.name), channelId: null })
    }
    setCol(1)
  }

  // Quando a camada de reprodução está aberta, ela é dona do teclado
  // (`modal: true`), então esta tela ignora as teclas — nada de navegar a
  // lista por trás do player.
  useRemoteNav({
    onDirection: (dir) => {
      if (playing) return
      if (dir === 'left') {
        setCol(0)
        return
      }
      if (dir === 'right') {
        if (focusedCategory) enter(focusedCategory)
        return
      }

      if (col === 0) {
        if (dir === 'up' || dir === 'down') {
          const next = clamp(categoryIdx + (dir === 'down' ? 1 : -1), 0, categories.length - 1)
          if (next !== categoryIdx) {
            setFocusedIdentity({ categoryName: groupLabel(categories[next]?.name), channelId: null })
          }
        }
      } else {
        const total = items.length
        if (dir === 'up' || dir === 'down') {
          const next = clamp(channelIdx + (dir === 'down' ? 1 : -1), 0, Math.max(0, total - 1))
          setFocusedIdentity((prev) => ({ ...prev, channelId: items[next]?.id ?? null }))
        }
      }
    },
    onSelect: () => {
      if (playing) return
      if (col === 0) {
        if (focusedCategory) enter(focusedCategory)
        return
      }
      if (!activeChannel) return
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
      if (col === 1) {
        setCol(0)
        return
      }
      onBack()
    },
  })

  if (categoriesQuery.isLoading) {
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

  if (categoriesQuery.isError) {
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
              onClick={() => void categoriesQuery.refetch()}
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

  if (categories.length === 0) {
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

  const showingContent = col === 1
  const contentFailed = showingContent && content.data?.outcome === 'failed'
  const contentStale = showingContent && content.data?.outcome === 'stale-served'
  /**
   * O que o provedor prometeu e o que ele de fato entregou são fatos
   * distintos (D-005) — quando os dois existem e divergem, a tela declara
   * a diferença em vez de escondê-la (FR-015). Hoje isso quase nunca
   * dispara contra um painel real (Xtream não declara contagem por
   * categoria), mas o campo existe pronto para quando algum declarar.
   */
  const declaredCount = focusedCategory?.declaredCount
  const realCount = content.data?.totalCount
  const countsDiverge =
    showingContent &&
    !content.isLoading &&
    declaredCount !== undefined &&
    realCount !== undefined &&
    declaredCount !== realCount

  return (
    <div className="screen screen-row">
      <div className="live-column live-column-groups">
        <div className="live-column-title">Grupos</div>
        {categories.map((category, i) => (
          <button
            key={category.id}
            type="button"
            className={`live-item${col === 0 && categoryIdx === i ? ' tv-focus' : ''}`}
          >
            {groupLabel(category.name)}
          </button>
        ))}
      </div>

      <div className="live-column live-column-channels">
        <div className="live-column-title">{groupLabel(focusedCategory?.name)}</div>

        {!showingContent && (
          <div className="live-state-copy">Aponte para uma categoria e pressione OK para ver os canais.</div>
        )}

        {showingContent && content.isLoading && (
          <div className="live-state">
            <div className="live-state-copy">Carregando canais…</div>
            <button type="button" className="live-state-action tv-focus">
              Voltar
            </button>
          </div>
        )}

        {showingContent && contentFailed && (
          <div className="live-state">
            <div className="live-state-title">Não foi possível carregar esta categoria</div>
            <button
              type="button"
              className="live-state-action tv-focus"
              onClick={() => void content.refetch()}
            >
              Tentar de novo
            </button>
          </div>
        )}

        {showingContent && !content.isLoading && !contentFailed && items.length === 0 && (
          <div className="live-state-copy">Este grupo está vazio.</div>
        )}

        {showingContent && !content.isLoading && !contentFailed && contentStale && (
          <div className="live-truncated-note">
            Não foi possível atualizar agora — mostrando o que já estava salvo.
          </div>
        )}

        {countsDiverge && (
          <div className="live-truncated-note">
            O provedor declarou {declaredCount} canais nesta categoria, mas entregou {realCount}.
          </div>
        )}

        {showingContent &&
          !content.isLoading &&
          !contentFailed &&
          items.map((channel, i) => (
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

        {showingContent && !content.isLoading && !contentFailed && content.data && (
          // Fala do limite de exibição, não do tamanho da fonte — a distinção
          // importa porque o catálogo publicado pode ser parcial (FR-016).
          content.data.totalCount > items.length && (
            <div className="live-truncated-note">
              Mostrando os primeiros {items.length} de {content.data.totalCount} canais deste grupo.
            </div>
          )
        )}
      </div>

      <div className="live-preview-panel">
        <div className="live-preview-box">
          <div className="live-preview-logo" aria-hidden="true" />
        </div>
        <div className="live-channel-name">{activeChannel?.name ?? 'Selecione um canal'}</div>
        <div className="live-channel-meta">{groupLabel(focusedCategory?.name)}</div>
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
