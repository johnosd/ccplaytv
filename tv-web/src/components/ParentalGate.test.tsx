import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSessionUnlocked, notifyCategoryAccessChanged, relockSession } from '../lib/catalog/categoryAccess'
import { db } from '../lib/catalog/db'
import { enableParentalControl } from '../lib/parental/listPin'
import { LockedCategoryState } from './LockedCategoryState'
import { ParentalGate } from './ParentalGate'

/** Feature 066 (T027): pedido de PIN antes de telas protegidas, no estado de categoria bloqueada e ao remover lista. PIN por lista desde a 067. */

const press = (key: string) => fireEvent.keyDown(document.body, { key, bubbles: true })
const typePin = async (pin: string) => {
  await act(async () => {
    for (const digit of pin) press(digit)
  })
}

afterEach(async () => {
  cleanup()
  await db.table('parentalPins').clear()
  notifyCategoryAccessChanged() // a regra guardada em memória não vê limpeza direta das tabelas
  localStorage.clear()
})

describe('ParentalGate', () => {
  it('sem PIN na lista, mostra a tela direto', async () => {
    render(<ParentalGate sourceId="sala" onCancel={vi.fn()}><p>Editar lista</p></ParentalGate>)
    expect(await screen.findByText('Editar lista')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('067 FR-021: sem lista (adicionar lista), abre direto mesmo com outra lista protegida', async () => {
    await enableParentalControl('sala', '1234', [])
    render(<ParentalGate onCancel={vi.fn()}><p>Adicionar lista</p></ParentalGate>)
    expect(await screen.findByText('Adicionar lista')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('com PIN na lista, pede o PIN dela antes; RETURN cancela sem mostrar a tela; o PIN de outra lista não serve; o certo mostra', async () => {
    await enableParentalControl('sala', '1234', [])
    await enableParentalControl('quarto', '5678', [])
    const onCancel = vi.fn()
    const { unmount } = render(<ParentalGate sourceId="sala" onCancel={onCancel}><p>Editar lista</p></ParentalGate>)
    await screen.findByRole('dialog', { name: 'Digite o PIN' })
    expect(screen.queryByText('Editar lista')).toBeNull()
    press('Escape')
    expect(onCancel).toHaveBeenCalledTimes(1)
    unmount()

    render(<ParentalGate sourceId="sala" onCancel={vi.fn()}><p>Editar lista</p></ParentalGate>)
    await screen.findByRole('dialog', { name: 'Digite o PIN' })
    await typePin('5678')
    expect(await screen.findByText('PIN incorreto')).toBeInTheDocument()
    expect(screen.queryByText('Editar lista')).toBeNull()
    await typePin('1234')
    expect(await screen.findByText('Editar lista')).toBeInTheDocument()
  })
})

describe('LockedCategoryState', () => {
  it('sem o PIN aberto, "Desbloquear" tem o foco; aberto, RETURN fecha só o PIN; o certo desbloqueia', async () => {
    const onClosePin = vi.fn()
    await enableParentalControl('sala', '9876', [])
    const props = { name: 'Adultos', focused: true, onOpenPin: vi.fn(), onClosePin, sourceId: 'sala' }
    const { rerender } = render(<LockedCategoryState {...props} pinOpen={false} />)
    expect(screen.getByRole('button', { name: 'Desbloquear' })).toHaveClass('tv-focus')
    expect(screen.getByText('Adultos')).toBeInTheDocument()

    rerender(<LockedCategoryState {...props} pinOpen />)
    await screen.findByRole('dialog', { name: 'Digite o PIN' })
    expect(screen.getByRole('button', { name: 'Desbloquear' })).not.toHaveClass('tv-focus')
    press('Escape')
    expect(onClosePin).toHaveBeenCalledTimes(1)

    await typePin('9876')
    await waitFor(() => expect(isSessionUnlocked('sala')).toBe(true))
    relockSession()
  })
})
