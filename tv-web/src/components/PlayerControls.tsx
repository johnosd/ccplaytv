import type { PlayerCapabilities, PlayerProgress, PlayerState } from '../lib/player/PlayerService'
import { formatTime } from '../lib/player/formatTime'

export interface PlayerControlsAction {
  id: 'jumpBack' | 'playPause' | 'jumpForward'
}

/**
 * Quais ações a barra oferece, na ordem de foco (`logic/reproducao-vod.md`
 * §4: `[ ⏪ 10s ] [ ▶/⏸ ] [ ⏩ 10s ]`). Ação cuja capacidade seja `false` NÃO
 * é incluída — não existe botão desabilitado (D-003). Com nenhuma
 * capacidade, a lista vem vazia e a barra inteira não existe: é o caso do
 * canal ao vivo, que preserva o comportamento de hoje (FR-022).
 */
export function playerControlsActions(capabilities: PlayerCapabilities): PlayerControlsAction[] {
  const actions: PlayerControlsAction[] = []
  if (capabilities.canSeek) actions.push({ id: 'jumpBack' })
  if (capabilities.canPause) actions.push({ id: 'playPause' })
  if (capabilities.canSeek) actions.push({ id: 'jumpForward' })
  return actions
}

export interface PlayerControlsProps {
  capabilities: PlayerCapabilities
  state: PlayerState
  progress: PlayerProgress | null
  /** Índice dentro do array de `playerControlsActions(capabilities)`. */
  focusedIndex: number
}

const LABEL: Record<PlayerControlsAction['id'], string> = {
  jumpBack: '⏪ 10s',
  jumpForward: '⏩ 10s',
  playPause: '', // dinâmico — depende do estado atual (pausado ou não)
}

/**
 * Barra de controles de reprodução: tempo decorrido/total e as ações que a
 * capacidade da sessão permitir. Nunca renderiza um controle que o motor não
 * suporta (FR-002/FR-003) — é o contrato de capacidades em forma de UI.
 */
export function PlayerControls({ capabilities, state, progress, focusedIndex }: PlayerControlsProps) {
  const actions = playerControlsActions(capabilities)
  if (actions.length === 0) return null

  // Duração confiável só quando o motor a reporta E de fato a informou nesta
  // sessão — sem isso, indicação indeterminada: tempo decorrido, sem barra e
  // sem percentual (FR-004). Nada aqui é estimado.
  const hasDuration = capabilities.reportsDuration && progress?.durationMs !== undefined
  const elapsed = progress ? formatTime(progress.positionMs) : null
  const total = hasDuration && progress?.durationMs !== undefined ? formatTime(progress.durationMs) : null
  const ratio =
    hasDuration && progress?.durationMs && progress.durationMs > 0
      ? Math.min(1, Math.max(0, progress.positionMs / progress.durationMs))
      : null

  return (
    <div className="player-controls">
      {elapsed !== null && (
        <div className="player-time">
          <span>{elapsed}</span>
          {total !== null && (
            <>
              <div className="player-time-bar" role="presentation">
                <div className="player-time-bar-fill" style={{ width: `${(ratio ?? 0) * 100}%` }} />
              </div>
              <span>{total}</span>
            </>
          )}
        </div>
      )}
      <div className="player-buttons">
        {actions.map((action, i) => (
          <button
            key={action.id}
            type="button"
            className={`player-control-button${i === focusedIndex ? ' tv-focus' : ''}`}
          >
            {action.id === 'playPause' ? (state === 'paused' ? '▶' : '⏸') : LABEL[action.id]}
          </button>
        ))}
      </div>
    </div>
  )
}
