import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ExitModal } from './ExitModal'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { findUnnamedControls } from '../../testing/accessibleNames'

afterEach(cleanup)

// Teclas em `document.body` (nunca em `document`): só assim a captura do
// `Modal` roda antes da tela por trás — mesmo cuidado dos contratos da 022.
function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

function ScreenBehind({ onSelect, onDirection, onBack }: { onSelect: () => void; onDirection: () => void; onBack: () => void }) {
  useRemoteNav({ onSelect, onDirection, onBack })
  return <div>tela por trás</div>
}

describe('ExitModal', () => {
  it('abre com "Cancelar" em foco e nome acessível "Sair do CCPlayTV?"', () => {
    render(<ExitModal onCancel={vi.fn()} onExit={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Sair do CCPlayTV?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: 'Sair' })).not.toHaveClass('tv-focus')
  })

  it('OK direto (foco inicial) cancela, nunca sai', () => {
    const onCancel = vi.fn()
    const onExit = vi.fn()
    render(<ExitModal onCancel={onCancel} onExit={onExit} />)
    press('Enter')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onExit).not.toHaveBeenCalled()
  })

  it('RETURN equivale a Cancelar (FR-030)', () => {
    const onCancel = vi.fn()
    const onExit = vi.fn()
    render(<ExitModal onCancel={onCancel} onExit={onExit} />)
    press('Escape')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onExit).not.toHaveBeenCalled()
  })

  it('RIGHT move o foco para "Sair", e OK sai; LEFT volta a "Cancelar"', () => {
    const onCancel = vi.fn()
    const onExit = vi.fn()
    render(<ExitModal onCancel={onCancel} onExit={onExit} />)
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Sair' })).toHaveClass('tv-focus')
    press('ArrowLeft')
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
    press('ArrowRight')
    press('Enter')
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('a tela por trás não recebe nenhuma tecla enquanto o modal está aberto (FR-027)', () => {
    const behind = { onSelect: vi.fn(), onDirection: vi.fn(), onBack: vi.fn() }
    render(
      <>
        <ScreenBehind {...behind} />
        <ExitModal onCancel={vi.fn()} onExit={vi.fn()} />
      </>,
    )
    press('ArrowRight')
    press('Enter')
    press('Escape')
    expect(behind.onDirection).not.toHaveBeenCalled()
    expect(behind.onSelect).not.toHaveBeenCalled()
    expect(behind.onBack).not.toHaveBeenCalled()
  })

  // Feature 028, FR-015/FR-017.
  it('todo controle tem nome acessível', () => {
    const { container } = render(<ExitModal onCancel={vi.fn()} onExit={vi.fn()} />)
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })
})
