import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCatalogItem, useUserState, invalidateUserState, useToggleWatched } from '../catalog/catalogApi'
import { useRemoteNav, clamp } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { PlayerLayer } from '../../components/PlayerLayer'
import { buildStableId } from '../../lib/catalog/userStateRepository'
import { isResumable } from '../../lib/player/resumePolicy'
import { formatTime } from '../../lib/player/formatTime'

export interface MovieDetailScreenProps {
  movieId: string
  onBack: () => void
}

type MovieAction =
  | { id: 'trailer' }
  | { id: 'watch' }
  | { id: 'resume'; progressSeconds: number }
  | { id: 'restart' }
  | { id: 'toggle-watched'; watched: boolean }

/**
 * As ações do detalhe, na ordem de foco. Trailer é sempre a primeira — fora
 * de escopo desta feature (item 32 do backlog), preservado como já estava.
 * A ação PRIMÁRIA (Assistir, ou Retomar quando há posição salva) é sempre a
 * segunda: é o que FR-015 e `logic/reproducao-vod.md` §5 chamam de "foco
 * inicial na ação primária" — nesta estrutura isso é sempre o índice 1,
 * então o foco não precisa ser recalculado quando o array muda de tamanho.
 *
 * `toggle-watched` (feature 019, D-005) entra **sempre por último** — nunca
 * desloca o índice 1 da ação primária, esteja o array com 2 ou 3 ações
 * antes dela.
 */
function buildActions(progressSeconds: number | undefined, watched: boolean): MovieAction[] {
  const base: MovieAction[] = isResumable(progressSeconds)
    ? [{ id: 'trailer' }, { id: 'resume', progressSeconds: progressSeconds as number }, { id: 'restart' }]
    : [{ id: 'trailer' }, { id: 'watch' }]
  return [...base, { id: 'toggle-watched', watched }]
}

function actionLabel(action: MovieAction): string {
  switch (action.id) {
    case 'trailer':
      return '▶ Trailer'
    case 'watch':
      return '▶ Assistir'
    case 'resume':
      return `▶ Retomar (${formatTime(action.progressSeconds * 1000)})`
    case 'restart':
      return '↺ Reiniciar'
    case 'toggle-watched':
      return action.watched ? '✗ Desmarcar assistido' : '✓ Marcar como assistido'
  }
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
  const actions = buildActions(userStateQuery.data?.progressSeconds ?? undefined, watched)
  const toggleWatched = useToggleWatched()

  const [focus, setFocus] = useState(1) // ação primária — ver buildActions
  const safeFocus = clamp(focus, 0, actions.length - 1)
  // Guarda de sessão única (FR-010): `{playing && <PlayerLayer/>}` já impede
  // duas camadas montadas ao mesmo tempo, e o `if (playing) return` abaixo
  // cobre o instante entre um SELECT repetido e o re-render que monta a
  // camada (mesmo padrão de `LiveScreen.tsx`).
  const [playing, setPlaying] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | undefined>(undefined)
  const { toastMessage, showToast } = useToast()

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

  useRemoteNav({
    onDirection: (dir) => {
      if (!movie) return
      if (dir === 'left') setFocus(clamp(safeFocus - 1, 0, actions.length - 1))
      if (dir === 'right') setFocus(clamp(safeFocus + 1, 0, actions.length - 1))
    },
    onSelect: () => {
      // Estado de carregando/erro tem uma única saída ("Voltar") — sem isto,
      // OK do controle físico não a ativa, só o mouse (achado R-005, feature
      // 010; corrigido aqui localmente, sem tocar `useRemoteNav` global).
      if (!movie) {
        onBack()
        return
      }
      const action = actions[safeFocus]
      if (!action) return
      if (action.id === 'trailer') {
        // Trailer não é escopo desta feature (item 32 do backlog) — placeholder
        // mantido como já estava, intocado.
        showToast('Reproduzindo trailer...')
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

  return (
    <div className="movie-detail-layout">
      <div className="movie-detail-backdrop">
        <div className="backdrop-noise" />
        <span className="backdrop-caption">backdrop / still do filme</span>
      </div>
      <div className="movie-detail-body">
        <div className="movie-detail-title">{movie.name}</div>
        <div className="movie-detail-meta">
          {movie.original_group ?? 'VOD'} - {movie.playable ? 'Disponível' : 'Indisponível'}
        </div>
        <p className="movie-detail-synopsis">Resumo não disponível na extração M3U/Xtream nativa.</p>
        <div className="movie-detail-cast">Elenco: Desconhecido</div>
        <div className="movie-detail-actions">
          {actions.map((action, i) => (
            <div key={action.id} className={`detail-button${i === safeFocus ? ' tv-focus' : ''}`}>
              {actionLabel(action)}
            </div>
          ))}
        </div>
      </div>
      <Toast message={toastMessage} />
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
