import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { findUnnamedControls } from '../../testing/accessibleNames'
import { SpeedTestDialog } from './SpeedTestDialog'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('C5 US1/AC1/AC3 FR-003/013: abre sem medir, SELECT inicia e RETURN fecha a execução sem vazar à tela', () => {
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  const onStart = vi.fn()
  const onClose = vi.fn()
  const underlayBack = vi.fn()
  document.addEventListener('keydown', underlayBack)
  try {
    const props = { lastResult: null, result: null, onStart, onClose }
    const view = render(<SpeedTestDialog {...props} phase="ready" />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Iniciar teste' })).toHaveClass('tv-focus')
    expect(onStart).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(findUnnamedControls(document.body)).toEqual([])
    act(() => { fireEvent.keyDown(document.body, { key: 'Enter' }) })
    expect(onStart).toHaveBeenCalledTimes(1)
    view.rerender(<SpeedTestDialog {...props} phase="running" />)
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
    act(() => { fireEvent.keyDown(document.body, { key: 'Escape', keyCode: 10009 }) })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(underlayBack).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    document.removeEventListener('keydown', underlayBack)
  }
})
