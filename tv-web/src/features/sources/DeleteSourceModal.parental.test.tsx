import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyCategoryAccessChanged } from '../../lib/catalog/categoryAccess'
import { db } from '../../lib/catalog/db'
import { enableParentalControl } from '../../lib/parental/listPin'
import type { SourceOut } from '../import/importApi'
import { DeleteSourceModal } from './DeleteSourceModal'

/** Feature 066 (T027, FR-017): com o controle parental ligado, remover lista pede o PIN — o DELA (067, FR-020). */

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

describe('DeleteSourceModal com controle parental', () => {
  const source = { id: 's1', display_name: 'Sala' } as SourceOut

  it('sem PIN, "Remover" confirma na hora; com PIN, pede o PIN e só o certo remove', async () => {
    const onConfirm = vi.fn()
    const { unmount } = render(<DeleteSourceModal source={source} onCancel={vi.fn()} onConfirm={onConfirm} />)
    press('ArrowRight')
    press('Enter')
    expect(onConfirm).toHaveBeenCalledTimes(1)
    unmount()

    // PIN em OUTRA lista: remover esta continua imediato (067, FR-020).
    await enableParentalControl('outra', '1111', [])
    const second = render(<DeleteSourceModal source={source} onCancel={vi.fn()} onConfirm={onConfirm} />)
    press('ArrowRight')
    press('Enter')
    expect(onConfirm).toHaveBeenCalledTimes(2)
    second.unmount()

    await enableParentalControl('s1', '4321', [])
    onConfirm.mockClear()
    render(<DeleteSourceModal source={source} onCancel={vi.fn()} onConfirm={onConfirm} />)
    press('ArrowRight')
    press('Enter')
    await screen.findByRole('dialog', { name: 'Digite o PIN' })
    expect(onConfirm).not.toHaveBeenCalled()
    await typePin('1111') // o PIN da outra lista não serve
    expect(await screen.findByText('PIN incorreto')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    await typePin('4321')
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })
})
