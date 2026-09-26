// Feature 021, Fase 5 (T031) — sem `AnnouncerRegion` no contexto, o `Toast`
// precisa continuar exatamente como antes desta feature (é o que mantém as
// suítes de tela, que o renderizam sozinho, intactas — FR-027).
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Toast } from './Toast'

describe('Toast — sem região de anúncio no contexto', () => {
  it('renderiza role="status" com o texto, sem portal (dentro do próprio container)', () => {
    const { container } = render(<Toast message="Adicionado aos favoritos" />)
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('Adicionado aos favoritos')
    expect(container.contains(toast)).toBe(true)
  })

  it('sem mensagem, não renderiza nada', () => {
    const { container } = render(<Toast message={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
