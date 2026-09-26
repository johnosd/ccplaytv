/**
 * Teste de CONTRATO da feature 017 (busca local) — travado em
 * `sdd/specs/017-busca-local-catalogo/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 */
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRemoteNav } from './useRemoteNav'

function keydownOn(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('useRemoteNav com campo de texto focado (contrato)', () => {
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
  })

  // FR-003, FR-020 — digitar no campo de busca não pode virar "voltar"/"navegar"
  it('deixa Backspace, espaço, Enter e setas laterais para o campo; RETURN e setas verticais continuam com a tela', () => {
    const onBack = vi.fn()
    const onDirection = vi.fn()
    const onSelect = vi.fn()
    renderHook(() => useRemoteNav({ onBack, onDirection, onSelect }))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    for (const key of ['Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight']) {
      const event = keydownOn(input, { key })
      expect(event.defaultPrevented, `tecla "${key}" não deveria ser consumida`).toBe(false)
    }
    expect(onBack).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    expect(onDirection).not.toHaveBeenCalled()

    keydownOn(input, { key: 'ArrowDown' })
    expect(onDirection).toHaveBeenCalledWith('down')

    keydownOn(input, { keyCode: 10009 })
    keydownOn(input, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledTimes(2)
  })
})
