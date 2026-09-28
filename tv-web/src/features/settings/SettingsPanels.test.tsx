import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessibilityPanel } from './AccessibilityPanel'
import { AboutPanel } from './AboutPanel'
import { ComingSoonPanel } from './ComingSoonPanel'

/**
 * Testes isolados dos painéis de Configurações (feature 026, T030) — sem
 * `SettingsScreen` em volta. O efeito de verdade de "Reduzir movimento"
 * (grava/aplica a preferência) é testado em `SettingsScreen.test.tsx`
 * (é lá que a lógica mora, `AccessibilityPanel` só apresenta o valor).
 */

afterEach(cleanup)

describe('AccessibilityPanel', () => {
  it('mostra "Ligado"/"Desligado" conforme a prop, e cada linha ativa com o índice certo', () => {
    const onActivateRow = vi.fn()
    const { rerender } = render(
      <AccessibilityPanel reducedMotion={false} focusedRow={0} onActivateRow={onActivateRow} />,
    )
    expect(screen.getByText('Desligado')).toBeInTheDocument()
    expect(screen.getByText('Reduzir movimento').closest('button')).toHaveClass('tv-focus')

    rerender(<AccessibilityPanel reducedMotion={true} focusedRow={2} onActivateRow={onActivateRow} />)
    expect(screen.getByText('Ligado')).toBeInTheDocument()
    expect(screen.getByText('Alto contraste').closest('button')).toHaveClass('tv-focus')

    fireEvent.click(screen.getByText('Alto contraste').closest('button')!)
    expect(onActivateRow).toHaveBeenCalledWith(2)
  })

  it('as 3 demais opções são soft disabled (mocks, item 56 do backlog)', () => {
    render(<AccessibilityPanel reducedMotion={false} onActivateRow={vi.fn()} />)
    for (const label of ['Voice Guide / anúncios', 'Alto contraste', 'Aparência das legendas']) {
      expect(screen.getByText(label).closest('button')).toHaveClass('is-soft-disabled')
    }
  })
})

describe('AboutPanel', () => {
  it('mostra o nome e a versão real do app (__APP_VERSION__, D-012), e as licenças das fontes', () => {
    render(<AboutPanel focused />)
    expect(screen.getByText('CCPlayTV')).toBeInTheDocument()
    expect(screen.getByText(`Versão ${__APP_VERSION__}`)).toBeInTheDocument()
    expect(screen.getByText(/Poppins.*SIL Open Font License/)).toBeInTheDocument()
    expect(screen.getByText(/Inter.*SIL Open Font License/)).toBeInTheDocument()
  })
})

describe('ComingSoonPanel', () => {
  it('mostra o cabeçalho real da aba, "Em breve" com a mensagem do registro único, e "Voltar às abas" focável', () => {
    const onBack = vi.fn()
    render(<ComingSoonPanel tab="player" focused onBack={onBack} />)

    expect(screen.getByText('Player & reprodução')).toBeInTheDocument()
    expect(screen.getByText(/Em breve —/)).toBeInTheDocument()
    const back = screen.getByRole('button', { name: 'Voltar às abas' })
    expect(back).toHaveClass('tv-focus')

    fireEvent.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
