import type { ReactNode } from 'react'

export interface SpinnerProps {
  size: 20 | 32 | 48
}

/** Indicador de ocupado, nunca percentual (feature 022, D-013 do plan.md). */
export function Spinner({ size }: SpinnerProps): ReactNode {
  return (
    <div className="spinner" role="status" style={{ width: size, height: size }}>
      <span className="sr-only">Carregando</span>
    </div>
  )
}
