import type { ReactNode } from 'react'

export interface SkeletonProps {
  width: number | string
  height: number | string
  variant?: 'rect' | 'text'
}

/**
 * Placeholder com a mesma geometria do item real (feature 022, D-014 do
 * plan.md) — sem animação própria: `prefers-reduced-motion`/
 * `.reduce-motion` (feature 021) já cobre o caso, nenhum código extra
 * aqui.
 */
export function Skeleton({ width, height, variant = 'rect' }: SkeletonProps): ReactNode {
  return <div className={`skeleton skeleton-${variant}`} style={{ width, height }} aria-hidden="true" />
}
