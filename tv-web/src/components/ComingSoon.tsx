import type { ReactNode } from 'react'
import { getComingSoon } from '../lib/comingSoon'
import { useAnnounce } from '../lib/announcer'
import { Icon } from './Icon'

export interface ComingSoonProps {
  id: string
  focused?: boolean
  /** Hook extra opcional — o feedback "Em breve" já acontece por conta própria (FR-035), isto é só pra quem quiser reagir além disso. */
  onSelect?: () => void
}

/**
 * Funcionalidade ainda não construída, nunca fingindo ser real (feature
 * 022, D-016 do plan.md). Ao ativar, o próprio componente anuncia "Em
 * breve — {message}" (`useAnnounce`, feature 021) — cumpre FR-035 sozinho,
 * sem depender de `onSelect` ser fornecido.
 */
export function ComingSoon({ id, focused, onSelect }: ComingSoonProps): ReactNode {
  const { message } = getComingSoon(id)
  const announce = useAnnounce()

  function handleSelect() {
    announce(`Em breve — ${message}`)
    onSelect?.()
  }

  return (
    <button
      type="button"
      className={`coming-soon is-soft-disabled${focused ? ' tv-focus' : ''}`}
      onClick={handleSelect}
    >
      <Icon name="info" />
      <span>{message}</span>
    </button>
  )
}
