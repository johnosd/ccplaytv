import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCatalogItem, useUserState, invalidateUserState, useToggleWatched, groupLabel } from '../catalog/catalogApi'
import { useRemoteNav, clamp } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { PlayerLayer } from '../../components/PlayerLayer'
import { PosterArt } from '../../components/PosterArt'
import { Tabs, type TabItem } from '../../components/Tabs'
import { buildStableId } from '../../lib/catalog/userStateRepository'
import { isResumable } from '../../lib/player/resumePolicy'
import { formatTime } from '../../lib/player/formatTime'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import { getComingSoon } from '../../lib/comingSoon'

export interface MovieDetailScreenProps {
  movieId: string
  onBack: () => void
}

type MovieAction =
  | { id: 'watch' }
  | { id: 'resume'; progressSeconds: number }
  | { id: 'restart' }
  | { id: 'favorite'; isFavorite: boolean }
  | { id: 'trailer' }
  | { id: 'toggle-watched'; watched: boolean }

type DetailTab = 'details' | 'cast' | 'similar'

const TABS: TabItem[] = [
  { id: 'details', label: 'Detalhes' },
  { id: 'cast', label: 'Elenco', softDisabled: true },
  { id: 'similar', label: 'Semelhantes', softDisabled: true },
]

/**
 * As ações do detalhe, na ordem de foco (feature 025, `logic/detalhe-vod.md`
 * §3, FR-033): `[Continuar|Assistir] [Reiniciar?] [Minha Lista] [Trailer]
 * [Marcar assistido]`. A ação PRIMÁRIA é sempre o índice 0 — diferente da
 * versão anterior à 025, que usava o índice 1 porque "Trailer" vinha
 * primeiro; "Trailer" virou soft-disabled e saiu do topo.
 */
function buildActions(progressSeconds: number | undefined, watched: boolean, isFavorite: boolean): MovieAction[] {
  const primary: MovieAction[] = isResumable(progressSeconds)
    ? [{ id: 'resume', progressSeconds: progressSeconds as number }, { id: 'restart' }]
    : [{ id: 'watch' }]
  return [...primary, { id: 'favorite', isFavorite }, { id: 'trailer' }, { id: 'toggle-watched', watched }]
}

function actionLabel(action: MovieAction): string {
  switch (action.id) {
    case 'watch':
      return '▶ Assistir'
    case 'resume':
      return `▶ Continuar de ${formatTime(action.progressSeconds * 1000)}`
    case 'restart':
      return '↺ Reiniciar'
    case 'favorite':
      return action.isFavorite ? '✓ Na Minha Lista' : '+ Minha Lista'
    case 'trailer':
      return '▶ Trailer'
    case 'toggle-watched':
      return action.watched ? '✗ Desmarcar assistido' : '✓ Marcar como assistido'
  }
}

/**
 * "23/09/2024" — nunca hora, só a data (§4 do `logic/detalhe-vod.md`).
 *
 * `timeZone: 'UTC'` é deliberado (bug pré-existente achado durante a feature
 * 026, corrigido como desvio pequeno aprovado): `added_at` é uma DATA
 * declarada pela fonte, sem componente de hora — formatá-la no fuso local
 * fazia a exibição recuar um dia inteiro em qualquer fuso atrás de UTC
 * (ex.: America/Sao_Paulo, UTC-3).
 */
function formatShortDate(epochMs: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(epochMs))
}

interface MovieIdentity {
  stableId: string
  sourceId: string
}

/**
 * A mesma identidade que `PlayerLayer`/`progressRecorder` usam pra gravar —
 * calculada aqui a partir dos mesmos três campos (`source_id`,
 * `provider_stream_id`, `original_name`), pro `stableId` bater exatamente
 * com o que fica gravado no `userStateRepository`. Nunca lança até a tela:
 * item sem identidade estável simplesmente não oferece retomada (D-010).
 */
function computeIdentity(movie: {
  source_id?: string
  provider_stream_id?: string | null
  original_name?: string
}): MovieIdentity {
  const stableId = buildStableId({
    sourceId: movie.source_id ?? '',
    kind: 'movie',
    providerStreamId: movie.provider_stream_id ?? undefined,
    originalName: movie.original_name ?? '',
  })
  return { stableId, sourceId: movie.source_id ?? '' }
}

/**
 * Detalhe de filme no layout V14 (feature 025, US5): hero com capa real,
 * meta só com o que a fonte declarou, ações em pill e abas
 * Detalhes/Elenco/Semelhantes (`logic/detalhe-vod.md`). Sem topbar
 * (FR-004) — raiz `.screen`, coberta pela regra de transparência do plano
 * de hardware.
 */
export function MovieDetailScreen({ movieId, onBack }: MovieDetailScreenProps) {
  const queryClient = useQueryClient()
  // Pelo id, direto na chave primária. Carregar a lista de filmes inteira só
  // para procurar um item dentro dela custava o catálogo todo — e deixava de
  // encontrar qualquer filme além do teto de leitura da listagem.
  const query = useCatalogItem(movieId)
  const movie = query.data ?? undefined

  let identity: MovieIdentity | null = null
  if (movie) {
    try {
      identity = computeIdentity(movie)
    } catch {
      identity = null // D-010/R-010: sem identificador nem nome — sem retomada, mas sem quebrar a tela
    }
  }

  const userStateQuery = useUserState(identity?.stableId ?? null)
  const watched = userStateQuery.data?.completedAt != null
  const isFavorite = userStateQuery.data?.isFavorite ?? false
  const actions = buildActions(userStateQuery.data?.progressSeconds ?? undefined, watched, isFavorite)
  const toggleWatched = useToggleWatched()
  const { toastMessage, toastKey, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  const [row, setRow] = useState<'actions' | 'tabs'>('actions')
  const [actionFocus, setActionFocus] = useState(0) // ação primária — sempre índice 0
  const safeActionFocus = clamp(actionFocus, 0, actions.length - 1)
  const [activeTab, setActiveTab] = useState<DetailTab>('details')
  const [focusedTabId, setFocusedTabId] = useState<string>('details')

  // Guarda de sessão única (FR-010): `{playing && <PlayerLayer/>}` já impede
  // duas camadas montadas ao mesmo tempo, e o `if (playing) return` abaixo
  // cobre o instante entre um SELECT repetido e o re-render que monta a
  // camada (mesmo padrão de `LiveScreen.tsx`).
  const [playing, setPlaying] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | undefined>(undefined)

  function openPlayer(action: MovieAction) {
    if (playing) return
    // `undefined` (motor decide) e `0` (força o início) não são a mesma
    // coisa — "Reiniciar" precisa do zero explícito (`logic/
    // reproducao-vod.md` §5).
    if (action.id === 'resume') setStartAtMs(action.progressSeconds * 1000)
    else if (action.id === 'restart') setStartAtMs(0)
    else setStartAtMs(undefined)
    setPlaying(true)
  }

  /** Troca a aba real (Detalhes) ou anuncia "Em breve" pra Elenco/Semelhantes (mock). */
  function activateTab(id: string) {
    if (id === 'details') {
      setActiveTab('details')
      return
    }
    showToast(`Em breve — ${getComingSoon(id).message}`)
  }

  useRemoteNav({
    onDirection: (dir) => {
      if (!movie) return
      if (row === 'actions') {
        if (dir === 'left') setActionFocus((f) => clamp(f - 1, 0, actions.length - 1))
        if (dir === 'right') setActionFocus((f) => clamp(f + 1, 0, actions.length - 1))
        if (dir === 'down') {
          setFocusedTabId(activeTab)
          setRow('tabs')
        }
        return
      }
      // row === 'tabs'
      if (dir === 'left' || dir === 'right') {
        const idx = TABS.findIndex((t) => t.id === focusedTabId)
        const next = clamp(idx + (dir === 'left' ? -1 : 1), 0, TABS.length - 1)
        setFocusedTabId(TABS[next].id)
      }
      if (dir === 'up') setRow('actions')
    },
    onSelect: () => {
      // Estado de carregando/erro tem uma única saída ("Voltar") — sem isto,
      // OK do controle físico não a ativa, só o mouse (achado R-005, feature
      // 010; corrigido aqui localmente, sem tocar `useRemoteNav` global).
      if (!movie) {
        onBack()
        return
      }
      if (row === 'tabs') {
        activateTab(focusedTabId)
        return
      }
      const action = actions[safeActionFocus]
      if (!action) return
      if (action.id === 'trailer') {
        showToast(`Em breve — ${getComingSoon('trailer').message}`)
        return
      }
      if (action.id === 'favorite') {
        void favoriteToggle.toggle(movie)
        return
      }
      if (action.id === 'toggle-watched') {
        if (identity) toggleWatched.mutate({ ...identity, watched: !action.watched })
        return
      }
      openPlayer(action)
    },
    onBack,
  })

  if (!movie) {
    // Carregando e "não existe mais" precisam dos dois de uma saída focável.
    return (
      <div className="screen">
        <div className="live-state">
          <div className="live-state-copy">
            {query.isLoading ? 'Carregando…' : 'Este filme não está mais no catálogo.'}
          </div>
          <button type="button" className="live-state-action tv-focus" onClick={onBack}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const metaParts: string[] = []
  if (movie.year != null) metaParts.push(String(movie.year))
  metaParts.push(groupLabel(movie.original_group ?? undefined))
  if (watched) metaParts.push('✓ Assistido')

  return (
    <div className="screen vod-detail">
      <div className="vod-detail-hero">
        <div className="vod-detail-poster">
          <PosterArt url={movie.icon_url ?? undefined} title={movie.name} />
        </div>
        <div className="vod-detail-info">
          <div className="vod-detail-eyebrow">FILME</div>
          <div className="vod-detail-title">{movie.name}</div>
          <div className="vod-detail-meta">{metaParts.join(' · ')}</div>
          <div className="vod-detail-actions">
            {actions.map((action, i) => (
              <div
                key={action.id}
                className={`vod-detail-action${row === 'actions' && i === safeActionFocus ? ' tv-focus' : ''}${action.id === 'trailer' ? ' is-soft-disabled' : ''}`}
              >
                {actionLabel(action)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Tabs items={TABS} activeId={activeTab} focusedId={row === 'tabs' ? focusedTabId : undefined} onSelect={activateTab} />

      <div className="vod-detail-panel">
        {activeTab === 'details' && (
          <dl className="vod-detail-facts">
            <div className="vod-detail-fact">
              <dt>Tipo</dt>
              <dd>Filme</dd>
            </div>
            <div className="vod-detail-fact">
              <dt>Categoria</dt>
              <dd>{groupLabel(movie.original_group ?? undefined)}</dd>
            </div>
            {movie.year != null && (
              <div className="vod-detail-fact">
                <dt>Ano</dt>
                <dd>{movie.year}</dd>
              </div>
            )}
            {movie.added_at != null && (
              <div className="vod-detail-fact">
                <dt>Adicionado em</dt>
                <dd>{formatShortDate(movie.added_at)}</dd>
              </div>
            )}
            <div className="vod-detail-fact">
              <dt>Disponível</dt>
              <dd>{movie.playable ? 'Sim' : 'Não'}</dd>
            </div>
          </dl>
        )}
      </div>

      <Toast message={toastMessage} messageKey={toastKey} />
      {playing && (
        <PlayerLayer
          itemId={movieId}
          title={movie.name}
          startAtMs={startAtMs}
          onClose={() => {
            setPlaying(false)
            // Sem isto, o detalhe continuaria com a leitura de quando montou
            // — um filme assistido por 20 min voltaria anunciando "Assistir"
            // (`logic/reproducao-vod.md` §5.1). A invalidação fica aqui, que
            // detém a consulta e o estado `playing`; a camada não conhece
            // chaves de consulta do catálogo.
            if (identity) invalidateUserState(queryClient, identity.stableId)
          }}
        />
      )}
    </div>
  )
}
