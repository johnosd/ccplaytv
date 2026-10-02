/** Feature 045, US5 — chave TMDB: Done do IME leva à ação sem enviar; erros próprios intactos. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TmdbKeyScreen } from './TmdbKeyScreen'
import { db } from '../../lib/catalog/db'
import { IME_KEYCODES } from '../../lib/imeKeys'

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await db.integrations.clear()
})

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSaved = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <TmdbKeyScreen onSaved={onSaved} onBack={vi.fn()} />
    </QueryClientProvider>,
  )
  return { onSaved }
}

describe('TmdbKeyScreen — IME (feature 045)', () => {
  it('Done no campo leva o foco a "Salvar e testar" e NÃO envia (nenhuma requisição)', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { onSaved } = renderScreen()
    const field = screen.getByLabelText(/Chave da API/)
    fireEvent.change(field, { target: { value: '0123456789abcdef0123456789abcdef' } })
    field.focus()

    fireEvent.keyDown(field, { key: 'Unidentified', keyCode: IME_KEYCODES.done[0] })

    expect(screen.getByRole('button', { name: 'Salvar e testar' })).toHaveFocus()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('a dica do teclado é "done", a chave nasce mascarada e o controle "Mostrar chave" existe', () => {
    renderScreen()
    const field = screen.getByLabelText(/Chave da API/)
    expect(field).toHaveAttribute('enterkeyhint', 'done')
    expect(field).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Mostrar chave' })).toHaveAttribute('aria-pressed', 'false')
  })
})
