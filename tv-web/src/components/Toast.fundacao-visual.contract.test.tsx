import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AnnouncerRegion } from './AnnouncerRegion'
import { Toast } from './Toast'
import { useToast } from '../lib/useToast'

function Harness() {
  const { toastMessage, toastKey, showToast } = useToast()
  return (
    <>
      <button type="button" onClick={() => showToast('Adicionado aos favoritos')}>
        Favoritar
      </button>
      <Toast message={toastMessage} messageKey={toastKey} />
    </>
  )
}

describe('021 — toasts anunciados pela região única', () => {
  // US3/AC1–AC3 · FR-023, FR-024, FR-025 · Constitution: Foco Visível e Sem Becos Sem Saída (anúncio não move foco)
  it('toast aparece uma única vez, dentro da região polite persistente, é reanunciado ao repetir e não move o foco', () => {
    render(
      <AnnouncerRegion>
        <Harness />
      </AnnouncerRegion>,
    )

    // Persistente: existe antes de qualquer toast, e é a única região polite.
    const regions = document.querySelectorAll('[aria-live="polite"]')
    expect(regions).toHaveLength(1)
    const region = regions[0]

    const button = screen.getByRole('button', { name: 'Favoritar' })
    button.focus()

    fireEvent.click(button)
    const first = screen.getByText('Adicionado aos favoritos') // getBy = exatamente um nó
    expect(region.contains(first)).toBe(true)
    expect(region.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(0)
    expect(document.activeElement).toBe(button)

    // Mesmo texto de novo: precisa ser um nó novo na região (senão não há anúncio).
    fireEvent.click(button)
    const second = screen.getByText('Adicionado aos favoritos')
    expect(second).not.toBe(first)
    expect(region.contains(second)).toBe(true)
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
    expect(document.activeElement).toBe(button)
  })
})
