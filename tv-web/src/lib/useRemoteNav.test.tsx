import { cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRemoteNav } from './useRemoteNav'

describe('useRemoteNav', () => {
  afterEach(() => cleanup())

  it('a tecla RETURN do controle Samsung (keyCode 10009) aciona onBack', () => {
    const onBack = vi.fn()
    renderHook(() => useRemoteNav({ onBack }))

    // O aparelho entrega o código de plataforma sem um event.key equivalente
    // a Backspace/Escape — tratar só pelo nome deixava o Voltar inerte na TV.
    fireEvent.keyDown(document, { keyCode: 10009 })

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('Backspace e Escape continuam acionando onBack (caminho do desktop)', () => {
    const onBack = vi.fn()
    renderHook(() => useRemoteNav({ onBack }))

    fireEvent.keyDown(document, { key: 'Backspace' })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('a tecla de voltar chama preventDefault, para a plataforma não encerrar o app', () => {
    renderHook(() => useRemoteNav({ onBack: () => {} }))

    const event = new KeyboardEvent('keydown', { keyCode: 10009, cancelable: true })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('tecla não mapeada não aciona nenhum handler', () => {
    const onBack = vi.fn()
    const onSelect = vi.fn()
    const onDirection = vi.fn()
    renderHook(() => useRemoteNav({ onBack, onSelect, onDirection }))

    fireEvent.keyDown(document, { key: 'a' })

    expect(onBack).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    expect(onDirection).not.toHaveBeenCalled()
  })
})
