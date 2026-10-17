import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TopbarItem } from '../../navigation/appNav'
import { TopBar } from './TopBar'

// Feature 074 (D-003): o item "Rádio" só existe quando a topbar recebe `onOpenRadio`.

function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

function Harness({ onOpenRadio }: { onOpenRadio?: () => void }) {
  const [focused, setFocused] = useState<TopbarItem>('home')
  return (
    <TopBar
      sourceName="Sala"
      active
      focusedItem={focused}
      onFocusItem={setFocused}
      onExitDown={() => {}}
      onNavigate={() => {}}
      onOpenProfiles={() => {}}
      onOpenRadio={onOpenRadio}
      onBack={() => {}}
    />
  )
}

function focusedText(): string | null {
  return document.querySelector('.tv-focus')?.textContent ?? null
}

afterEach(cleanup)

describe('TopBar — Rádio (feature 074)', () => {
  it('sem onOpenRadio a topbar não mostra Rádio e a ordem de foco não muda', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Rádio' })).not.toBeInTheDocument()
    for (let i = 0; i < 3; i += 1) press('ArrowRight')
    expect(focusedText()).toBe('Séries')
    press('ArrowRight')
    expect(focusedText()).not.toBe('Rádio')
  })

  it('com onOpenRadio, "Rádio" vem logo depois de "Séries" e OK chama o callback', () => {
    const onOpenRadio = vi.fn()
    render(<Harness onOpenRadio={onOpenRadio} />)
    const names = [...document.querySelectorAll('.topbar-nav .topbar-item')].map((item) => item.textContent)
    expect(names).toEqual(['Início', 'TV ao vivo', 'Filmes', 'Séries', 'Rádio'])

    for (let i = 0; i < 4; i += 1) press('ArrowRight')
    expect(focusedText()).toBe('Rádio')
    press('Enter')
    expect(onOpenRadio).toHaveBeenCalledTimes(1)
  })
})
