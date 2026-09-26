import { useEffect, useState } from 'react'
import { useRemoteNav } from '../../lib/useRemoteNav'

export interface NextEpisodeCountdownProps {
  /** Título do próximo episódio. */
  title: string
  /** Presente só quando o próximo episódio está numa temporada diferente da atual (D-010). */
  seasonLabel?: string
  /** A contagem chegou a zero sem cancelamento — hora de tocar o próximo. */
  onExpire: () => void
  /** SELECT ou RETURN, em qualquer instante — fecha sem iniciar o próximo. */
  onCancel: () => void
  /** Segundos iniciais (D-009). Injetável só para teste — produção usa o padrão. */
  seconds?: number
}

/** Feature 012, D-009: contagem fixa, tempo real restante — nunca um percentual. */
const DEFAULT_SECONDS = 10

/**
 * Camada modal entre um episódio e o próximo (feature 012, `logic/
 * episodios-autoplay.md` §7, D-008/D-009). Monta só depois que `PlayerLayer`
 * do episódio concluído já desmontou (a tela é quem garante isso, nunca duas
 * sessões de reprodução ao mesmo tempo — FR-013).
 *
 * Reusa `.player-overlay`/`.player-message`/`.player-action` de
 * `PlayerLayer.tsx` — mesma linguagem visual de diálogo sobre a tela, sem
 * CSS novo.
 */
export function NextEpisodeCountdown({
  title,
  seasonLabel,
  onExpire,
  onCancel,
  seconds = DEFAULT_SECONDS,
}: NextEpisodeCountdownProps) {
  const [remaining, setRemaining] = useState(seconds)

  // Um só `setInterval`, criado na montagem — não um `setTimeout`
  // reagendado a cada render. Sob relógio falso (testes), um intervalo
  // dispara todos os seus ticks dentro da MESMA chamada de
  // `advanceTimersByTime`, sem depender do React re-renderizar entre um
  // tick e o próximo; uma cadeia de `setTimeout` recriado por efeito
  // (tentativa anterior) exigia isso e perdia ticks sob relógio falso.
  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (remaining <= 0) onExpire()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onExpire é prop de configuração, estável na prática (mesmo padrão de PlayerLayer.tsx)
  }, [remaining])

  // Modal: intercepta a tecla antes da tela por baixo — mesmo padrão de
  // `ConfirmDialog`/`PlayerLayer`. Único alvo focável é "Cancelar"; SELECT e
  // RETURN fazem a mesma coisa (D-009).
  useRemoteNav({ onSelect: onCancel, onBack: onCancel }, { modal: true })

  return (
    <div className="player-overlay" role="dialog" aria-label="Próximo episódio">
      <div className="player-message">
        <div className="player-message-title">
          {seasonLabel ? `${seasonLabel} — ${title}` : title}
        </div>
        <div className="player-message-copy">{`Próximo episódio em ${remaining}s`}</div>
        <div className="player-actions">
          <button type="button" className="player-action tv-focus" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
