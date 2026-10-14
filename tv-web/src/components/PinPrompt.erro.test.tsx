import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PinPrompt } from './PinPrompt'

/** Feature 066 (pedido do usuário na TV, 2026-10-10): falha ao gravar/conferir nunca deixa o PIN parado sem aviso. */

afterEach(cleanup)

const press = (key: string) => fireEvent.keyDown(document.body, { key, bubbles: true })

describe('PinPrompt — falha', () => {
  it('se o envio falhar, avisa "Não foi possível salvar", limpa as casas e aceita um PIN novo', async () => {
    const onSubmit = vi.fn<(pin: string) => Promise<boolean>>().mockRejectedValueOnce(new Error('falha')).mockResolvedValueOnce(true)
    render(<PinPrompt title="Digite o PIN de novo" onSubmit={onSubmit} onCancel={vi.fn()} />)
    await act(async () => { for (const digit of '1357') press(digit) })
    expect(await screen.findByText('Não foi possível salvar. Tente de novo. (PAR-01)')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '0 de 4 dígitos' })).toBeInTheDocument()
    await act(async () => { for (const digit of '1357') press(digit) })
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })
  it('sem espaço no aparelho (QuotaExceededError embrulhado pelo Dexie) mostra o código STO-01, nunca o nome cru', async () => {
    const quota = Object.assign(new Error('abortado'), { name: 'AbortError', inner: { name: 'QuotaExceededError' } })
    const onSubmit = vi.fn<(pin: string) => Promise<boolean>>().mockRejectedValueOnce(quota)
    render(<PinPrompt title="Digite o PIN de novo" onSubmit={onSubmit} onCancel={vi.fn()} />)
    await act(async () => { for (const digit of '2468') press(digit) })
    expect(await screen.findByText('Não foi possível salvar. Tente de novo. (STO-01)')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('AbortError')
  })
})
