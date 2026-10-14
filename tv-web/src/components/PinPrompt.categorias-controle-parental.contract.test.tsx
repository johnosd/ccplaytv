import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PinPrompt } from './PinPrompt'

/**
 * Feature 066 — contrato do pedido de PIN: dígitos pelo controle, nunca
 * exibidos (FR-012); PIN errado avisa, limpa e mantém foco (FR-016;
 * Constitution: Foco Visível e Sem Becos Sem Saída); RETURN fecha (FR-031).
 */

afterEach(cleanup)

const press = (key: string) => fireEvent.keyDown(document.body, { key, bubbles: true })

describe('066 — PinPrompt (contrato)', () => {
  it('FR-012/FR-016/FR-018/FR-031: 4 dígitos enviam; errado avisa e limpa com foco no diálogo; dígitos nunca aparecem; RETURN cancela', async () => {
    const onSubmit = vi.fn<(pin: string) => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const onCancel = vi.fn()
    render(<PinPrompt title="Digite o PIN" onSubmit={onSubmit} onCancel={onCancel} />)

    const dialog = screen.getByRole('dialog', { name: 'Digite o PIN' })
    expect(dialog.querySelector('.tv-focus')).not.toBeNull()

    // Digitar não muda o texto do diálogo: os dígitos nunca aparecem (o teclado na tela já mostra 0–9 desde o início).
    const before = dialog.textContent
    await act(async () => { press('4'); press('7') })
    expect(dialog.textContent).toBe(before)
    expect([...dialog.querySelectorAll('input')].every((input) => !/\d/.test(input.value))).toBe(true)

    await act(async () => { press('1'); press('9') })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('4719'))
    await waitFor(() => expect(screen.getByText('PIN incorreto')).toBeInTheDocument())
    expect(dialog.textContent).not.toContain('4719')
    expect(dialog.querySelector('.tv-focus')).not.toBeNull()

    // Depois de limpar, um PIN novo começa do zero (não acumula com o errado).
    await act(async () => { for (const digit of ['2', '5', '8', '0']) press(digit) })
    await waitFor(() => expect(onSubmit).toHaveBeenLastCalledWith('2580'))
    expect(onSubmit).toHaveBeenCalledTimes(2)

    press('Escape')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
