import { Fragment, useEffect, useRef, useState } from 'react'
import type { PlayerSession } from '../lib/player/PlayerService'

export interface SubtitleOverlayProps {
  session: PlayerSession
  /** Atraso escolhido (0 = imediato). Valores negativos nunca chegam aqui (D-006). */
  delayMs: number
  /** Pausado: a última linha fica na tela até retomar (edge case da spec). */
  paused: boolean
  /** Chrome visível: a legenda sobe para não ficar sob a linha de controles. */
  raised: boolean
}

/** Texto vindo do stream — tags viram nada, quebras viram `<br/>`; nunca HTML (logic §5). */
function plainLines(text: string): string[] {
  return text.replace(/<[^>]+>/g, '').split(/\r?\n/)
}

/**
 * Legenda embutida desenhada pelo app (feature 029, `logic/faixas-e-legendas.md`
 * §5, D-004): o AVPlay entrega cada linha no instante de exibi-la
 * (`onsubtitlechange`) e o app decide o resto — atraso, duração, pausa. Tem
 * assinatura própria na sessão, então uma linha nunca re-renderiza o
 * `PlayerLayer` inteiro. Estilo fixo (item 56 torna configurável).
 */
export function SubtitleOverlay({ session, delayMs, paused, raised }: SubtitleOverlayProps) {
  const [text, setText] = useState<string | null>(null)

  // Refs para o efeito de assinatura ler o valor atual sem reassinar a cada
  // mudança de atraso/pausa (uma reassinatura perderia cues em voo).
  const delayRef = useRef(delayMs)
  const pausedRef = useRef(paused)
  const hideOnResumeRef = useRef(false)
  useEffect(() => {
    delayRef.current = delayMs
    pausedRef.current = paused
  })

  useEffect(() => {
    const pending = new Set<ReturnType<typeof setTimeout>>()
    let hideTimer: ReturnType<typeof setTimeout> | null = null

    function clearAll() {
      for (const timer of pending) clearTimeout(timer)
      pending.clear()
      if (hideTimer !== null) clearTimeout(hideTimer)
      hideTimer = null
      hideOnResumeRef.current = false
    }

    function apply(content: string, durationMs: number) {
      if (hideTimer !== null) clearTimeout(hideTimer)
      hideTimer = null
      hideOnResumeRef.current = false
      if (content.trim() === '') {
        setText(null)
        return
      }
      setText(content)
      // Sem duração conhecida, a linha fica até a próxima cue substituí-la.
      if (durationMs <= 0) return
      hideTimer = setTimeout(() => {
        hideTimer = null
        if (pausedRef.current) {
          hideOnResumeRef.current = true
          return
        }
        setText(null)
      }, durationMs)
    }

    const unsubscribe = session.subscribeSubtitles((cue) => {
      if (cue === null) {
        // Troca/desativação de faixa: some agora, e nada agendado da faixa
        // anterior pode aparecer depois.
        clearAll()
        setText(null)
        return
      }
      const delay = delayRef.current
      if (delay <= 0) {
        apply(cue.text, cue.durationMs)
        return
      }
      // Cada cue tem o próprio atraso, independente das demais: as anteriores
      // continuam valendo até a sua vez (a linha exibida só some no fim da
      // duração dela, que também já foi atrasada).
      const timer = setTimeout(() => {
        pending.delete(timer)
        apply(cue.text, cue.durationMs)
      }, delay)
      pending.add(timer)
    })

    return () => {
      unsubscribe()
      clearAll()
    }
  }, [session])

  // Retomar depois de uma linha que expirou durante a pausa: some agora.
  useEffect(() => {
    if (!paused && hideOnResumeRef.current) {
      hideOnResumeRef.current = false
      setText(null)
    }
  }, [paused])

  if (text === null) return null

  return (
    <div className={`player-subtitle${raised ? ' player-subtitle--raised' : ''}`} aria-hidden="true">
      <span className="player-subtitle-text">
        {plainLines(text).map((line, index) => (
          <Fragment key={index}>
            {index > 0 && <br />}
            {line}
          </Fragment>
        ))}
      </span>
    </div>
  )
}
