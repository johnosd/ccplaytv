import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyCategoryAccessChanged } from '../lib/catalog/categoryAccess'
import { db } from '../lib/catalog/db'
import { enableParentalControl } from '../lib/parental/pin'
import { LockedCategoryState } from './LockedCategoryState'
import { ParentalGate } from './ParentalGate'

/** Feature 066 (T027): pedido de PIN antes de telas protegidas, no estado de categoria bloqueada e ao remover lista. */

const press = (key: string) => fireEvent.keyDown(document.body, { key, bubbles: true })
const typePin = async (pin: string) => {
  await act(async () => {
    for (const digit of pin) press(digit)
  })
}

afterEach(async () => {
  cleanup()
  await db.table('parentalPin').clear()
  notifyCategoryAccessChanged() // a regra guardada em memória não vê limpeza direta das tabelas
  localStorage.clear()
})

describe('ParentalGate', () => {
  it('sem PIN, mostra a tela direto', async () => {
    render(<ParentalGate onCancel={vi.fn()}><p>Adicionar lista</p></ParentalGate>)
    expect(await screen.findByText('Adicionar lista')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('com PIN, pede o PIN antes; RETURN cancela sem mostrar a tela; o certo mostra', async () => {
    await enableParentalControl('1234', [])
    const onCancel = vi.fn()
    const { unmount } = render(<ParentalGate onCancel={onCancel}><p>Adicionar lista</p></ParentalGate>)
    await screen.findByRole('dialog', { name: 'Digite o PIN' })
    expect(screen.queryByText('Adicionar lista')).toBeNull()
    press('Escape')
    expect(onCancel).toHaveBeenCalledTimes(1)
    unmount()

    render(<ParentalGate onCancel={vi.fn()}><p>Adicionar lista</p></ParentalGate>)
    await screen.findByRole('dialog', { name: 'Digite o PIN' })
    await typePin('1234')
    expect(await screen.findByText('Adicionar lista')).toBeInTheDocument()
  })
})

describe('LockedCategoryState', () => {
  it('sem o PIN aberto, "Desbloquear" tem o foco; aberto, RETURN fecha só o PIN; o certo desbloqueia', async () => {
    const onClosePin = vi.fn()
    const onUnlock = vi.fn<(pin: string) => Promise<boolean>>().mockResolvedValue(true)
    const props = { name: 'Adultos', focused: true, onOpenPin: vi.fn(), onClosePin, onUnlock }
    const { rerender } = render(<LockedCategoryState {...props} pinOpen={false} />)
    expect(screen.getByRole('button', { name: 'Desbloquear' })).toHaveClass('tv-focus')
    expect(screen.getByText('Adultos')).toBeInTheDocument()

    rerender(<LockedCategoryState {...props} pinOpen />)
    await screen.findByRole('dialog', { name: 'Digite o PIN' })
    expect(screen.getByRole('button', { name: 'Desbloquear' })).not.toHaveClass('tv-focus')
    press('Escape')
    expect(onClosePin).toHaveBeenCalledTimes(1)

    await typePin('9876')
    await waitFor(() => expect(onUnlock).toHaveBeenCalledWith('9876'))
  })
})
