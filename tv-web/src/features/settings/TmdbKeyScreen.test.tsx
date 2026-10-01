import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TmdbKeyScreen } from './TmdbKeyScreen'
import { db } from '../../lib/catalog/db'
import { getTmdbStatus } from '../../lib/metadata/tmdbKeyRepository'
import { findUnnamedControls } from '../../testing/accessibleNames'

const KEY = '0123456789abcdef0123456789abcdef'

function response(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function renderScreen() {
  const onSaved = vi.fn()
  const onBack = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <TmdbKeyScreen onSaved={onSaved} onBack={onBack} />
    </QueryClientProvider>,
  )
  return { onSaved, onBack }
}

const field = () => screen.getByLabelText(/Chave da API/) as HTMLInputElement
const type = (value: string) => fireEvent.change(field(), { target: { value } })
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar e testar' }))

beforeEach(async () => {
  await db.integrations.clear()
})

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await db.integrations.clear()
})

describe('TmdbKeyScreen (feature 032, US2)', () => {
  it('o campo abre sempre vazio, mascarado, mesmo com uma chave já guardada; "Mostrar" só alterna a máscara', async () => {
    await db.integrations.put({ id: 'tmdb', key: KEY, format: 'v3', state: 'connected', lastTestedAt: 1 })
    renderScreen()

    expect(field().value).toBe('')
    expect(field().type).toBe('password')
    expect(document.body.innerHTML).not.toContain(KEY)

    type('abc')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar chave' }))
    expect(field().type).toBe('text')
    expect(field().value).toBe('abc')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar chave' }))
    expect(field().type).toBe('password')
  })

  it('formato inválido: mensagem no campo, sem ecoar o que foi digitado e sem nenhuma requisição', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { onSaved } = renderScreen()

    type('isto-nao-e-uma-chave')
    save()

    expect(await screen.findByText(/Formato inválido/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('isto-nao-e-uma-chave')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(field()).toHaveFocus()
  })

  it('recusada pelo TMDB: motivo no campo, foco volta a ele e nada é gravado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(401)))
    const { onSaved } = renderScreen()

    type(KEY)
    save()

    expect(await screen.findByText(/O TMDB recusou esta chave/)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(field()).toHaveFocus()
    expect((await getTmdbStatus()).state).toBe('not_configured')
    expect(document.body.textContent).not.toContain(KEY)
  })

  it('sem conexão e limite de uso têm mensagens próprias', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(429)))
    renderScreen()
    type(KEY)
    save()
    expect(await screen.findByText(/pediu para aguardar/)).toBeInTheDocument()

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    save()
    expect(await screen.findByText(/Não foi possível falar com o TMDB/)).toBeInTheDocument()
  })

  it('aceita: grava (só mascarada no estado), chama onSaved; segundo OK durante o teste não repete a requisição', async () => {
    let release: (value: Response) => void = () => {}
    const fetchSpy = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
    vi.stubGlobal('fetch', fetchSpy)
    const { onSaved } = renderScreen()

    type(KEY)
    save()
    save() // OK repetido enquanto o teste está em andamento
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    await act(async () => release(response(200, { success: true })))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const status = await getTmdbStatus()
    expect(status).toMatchObject({ state: 'connected', format: 'v3', maskedKey: `••••${KEY.slice(-4)}` })
    expect(JSON.stringify(status)).not.toContain(KEY)
  })

  it('Cancelar e RETURN voltam sem gravar; todo controle tem nome acessível', () => {
    const { onBack } = renderScreen()
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onBack).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true })
    expect(onBack).toHaveBeenCalledTimes(2)
  })
})
