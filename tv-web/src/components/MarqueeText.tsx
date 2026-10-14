import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export interface MarqueeTextProps {
  text: string
  /** Item focado: só então o nome que não cabe rola até o fim (feature 068, FR-005). */
  active?: boolean
}

/** Velocidade da rolagem (px/s) — devagar o bastante para ler de longe. */
const MARQUEE_SPEED = 60

/**
 * Nome de item numa linha (feature 068, FR-005, `logic/escala-e-auditoria.md` §4): fora de foco, reticências; no item
 * focado, se não couber, rola de um lado ao outro em `transform` depois de ~1 s parado (uma animação por vez — só o
 * item focado). Nunca muda a altura da linha. Com "Reduzir movimento" a regra global zera a animação e o CSS mantém as
 * reticências: o nome inteiro fica no destaque/título da tela.
 */
export function MarqueeText({ text, active }: MarqueeTextProps): ReactNode {
  const outerRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    const outer = outerRef.current
    setShift(active && outer ? Math.max(0, Math.ceil(outer.scrollWidth - outer.clientWidth)) : 0)
  }, [active, text])

  const running = active === true && shift > 0
  const style = running
    ? ({ '--marquee-shift': `${-shift}px`, '--marquee-duration': `${(2 + shift / MARQUEE_SPEED).toFixed(2)}s` } as CSSProperties)
    : undefined
  return (
    <span ref={outerRef} className={`marquee${running ? ' is-running' : ''}`} style={style}>
      <span className="marquee-inner">{text}</span>
    </span>
  )
}
