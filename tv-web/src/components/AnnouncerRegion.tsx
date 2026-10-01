import { useState, type ReactNode } from 'react'
import { AnnouncerContext } from '../lib/announcer'

export interface AnnouncerRegionProps {
  children: ReactNode
}

/**
 * Monta a região de anúncio persistente (`aria-live="polite"`) uma única
 * vez, na raiz do app, e a expõe via `AnnouncerContext` para os filhos
 * (feature 021, D-004 do plan.md; `logic/regiao-de-anuncio.md`).
 *
 * Não é `sr-only`: hospeda o `Toast` visível, portado pra dentro dela.
 * `children` vem ANTES do nó da região — no primeiro render o valor do
 * contexto é `null` (a ref ainda não rodou), e como não há texto pra
 * anunciar nesse instante, não há problema.
 */
export function AnnouncerRegion({ children }: AnnouncerRegionProps) {
  const [region, setRegion] = useState<HTMLElement | null>(null)

  return (
    <AnnouncerContext.Provider value={region}>
      {children}
      <div ref={setRegion} className="announcer-region" role="status" aria-live="polite">
        <span className="sr-only" />
      </div>
    </AnnouncerContext.Provider>
  )
}
