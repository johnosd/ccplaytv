import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HistoryRemovalModal } from './HistoryRemovalModal'
import { findUnnamedControls } from '../../testing/accessibleNames'

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

const buttons = () => screen.getAllByRole('button').map((b) => b.textContent)
const focused = () => document.querySelector('.modal-actions .tv-focus')?.textContent

afterEach(() => cleanup())

describe('HistoryRemovalModal (feature 036, §6)', () => {
  it('sem progresso: só Cancelar e Remover; Cancelar focado; nome do diálogo diz o título', () => {
    render(<HistoryRemovalModal subject={{ kind: 'item', name: 'Filme A' }} hasProgress={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Remover "Filme A" do histórico?' })).toBeInTheDocument()
    expect(buttons()).toEqual(['Cancelar', 'Remover do histórico'])
    expect(focused()).toBe('Cancelar')
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })

  it('lote com progresso: três ações; ←/→ andam e param nas bordas; OK confirma o modo escolhido', () => {
    const onConfirm = vi.fn()
    render(<HistoryRemovalModal subject={{ kind: 'batch', scope: 'both' }} hasProgress onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(screen.getByRole('dialog', { name: 'Limpar o histórico de Filmes e Séries?' })).toBeInTheDocument()
    expect(buttons()).toEqual(['Cancelar', 'Limpar histórico', 'Limpar e apagar progresso'])

    press('ArrowLeft')
    expect(focused()).toBe('Cancelar')
    press('ArrowRight')
    press('ArrowRight')
    press('ArrowRight')
    expect(focused()).toBe('Limpar e apagar progresso')
    press('Enter')
    expect(onConfirm).toHaveBeenCalledWith('history-and-progress')
  })

  it('RETURN cancela', () => {
    const onCancel = vi.fn()
    render(<HistoryRemovalModal subject={{ kind: 'item', name: 'X' }} hasProgress onCancel={onCancel} onConfirm={vi.fn()} />)
    press('Escape')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('erro: título honesto, Cancelar focado de novo e "Tentar de novo" repete o mesmo modo (FR-020)', () => {
    const onConfirm = vi.fn()
    const props = { subject: { kind: 'item', name: 'X' } as const, hasProgress: true, onCancel: vi.fn(), onConfirm }
    const { rerender } = render(<HistoryRemovalModal {...props} />)
    press('ArrowRight')
    press('ArrowRight')
    press('Enter')
    expect(onConfirm).toHaveBeenLastCalledWith('history-and-progress')

    rerender(<HistoryRemovalModal {...props} error />)
    expect(screen.getByText('Não foi possível remover do histórico')).toBeInTheDocument()
    expect(buttons()).toEqual(['Cancelar', 'Tentar de novo'])
    expect(focused()).toBe('Cancelar')
    press('ArrowRight')
    press('Enter')
    expect(onConfirm).toHaveBeenLastCalledWith('history-and-progress')
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })
})
