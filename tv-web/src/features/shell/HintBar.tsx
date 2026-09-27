import type { ReactNode } from 'react'

export interface HintItem {
  /** Rótulo da tecla, ex.: `OK`, `RETURN`. */
  keyLabel: string
  /** O que a tecla faz neste contexto, ex.: `Selecionar`. */
  action: string
}

export interface HintBarProps {
  hints: HintItem[]
}

/**
 * Faixa inferior com as teclas úteis do contexto (feature 023, FR-021, DS
 * V14 "hint bar"). Só informa: não é focável, e o texto é legível por
 * tecnologia assistiva (`role="note"`), nunca escondido com `aria-hidden`.
 */
export function HintBar({ hints }: HintBarProps): ReactNode {
  return (
    <div className="hint-bar" role="note" aria-label="Teclas do controle remoto">
      {hints.map((hint) => (
        <span className="hint-bar-item" key={`${hint.keyLabel}-${hint.action}`}>
          <kbd className="hint-bar-key">{hint.keyLabel}</kbd>
          <span className="hint-bar-action">{hint.action}</span>
        </span>
      ))}
    </div>
  )
}
