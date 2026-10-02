import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddSourceScreen } from './AddSourceScreen'
import { db } from '../../lib/catalog/db'

vi.spyOn(globalThis, 'fetch')

const SERVER = 'http://painel.exemplo.test:8080'
const USER = 'joao-usuario'
const PASSWORD = 'senha-secreta-123'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function fillXtream() {
  fireEvent.change(screen.getByLabelText('Nome da lista'), { target: { value: 'Casa' } })
  fireEvent.change(screen.getByLabelText('Servidor'), { target: { value: SERVER } })
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: USER } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: PASSWORD } })
}

const submitButton = () => screen.getByRole('button', { name: 'Conectar e sincronizar' })

describe('AddSourceScreen — contrato da feature 045', () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockReset()
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.clear()
    await db.importRuns.clear()
  })

  // US1/AC3+AC7, FR-005/006/007, SC-001/SC-003/SC-006, Constitution: Segredos fora de logs/UI + Foco sem becos
  it('credencial recusada: o formulário permanece com os dados, uma única faixa com o código, foco na ação, nada criado e nenhum segredo à vista', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(() => Promise.resolve(new Response('', { status: 401 })))
    const onSourceCreated = vi.fn()
    render(<AddSourceScreen onSourceCreated={onSourceCreated} onBack={vi.fn()} />, { wrapper: createWrapper() })
    fillXtream()

    fireEvent.click(submitButton())

    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('Credencial inválida')
    expect(banner).toHaveTextContent('SRC-401')
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    expect(onSourceCreated).not.toHaveBeenCalled()
    expect(await db.sources.count()).toBe(0)
    expect(screen.getByLabelText('Nome da lista')).toHaveValue('Casa')
    expect(screen.getByLabelText('Servidor')).toHaveValue(SERVER)
    expect(screen.getByLabelText('Usuário')).toHaveValue(USER)
    expect(screen.getByLabelText('Senha')).toHaveValue(PASSWORD)
    expect(submitButton()).toHaveFocus()

    const visible = document.body.textContent ?? ''
    const names = Array.from(document.querySelectorAll('[aria-label]'))
      .map((element) => element.getAttribute('aria-label'))
      .join(' ')
    for (const secret of [PASSWORD, USER, 'painel.exemplo.test']) {
      expect(visible).not.toContain(secret)
      expect(names).not.toContain(secret)
    }
  })

  // US1/AC6, FR-009/FR-010, SC-008, Constitution: RETURN fecha primeiro a camada aberta
  it('durante a confirmação um segundo OK é ignorado e RETURN cancela sem sair da tela; com nada pendente, RETURN sai', async () => {
    let aborted = false
    vi.mocked(globalThis.fetch).mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )
    const onBack = vi.fn()
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={onBack} />, { wrapper: createWrapper() })
    fillXtream()

    fireEvent.click(submitButton())
    fireEvent.click(screen.getByRole('button', { name: /Conectando/ }))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Conectando/ })).toHaveAttribute('aria-busy', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(aborted).toBe(true))
    expect(onBack).not.toHaveBeenCalled()
    await waitFor(() => expect(submitButton()).toHaveFocus())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toHaveValue(PASSWORD)
    expect(await db.sources.count()).toBe(0)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  // US2/AC2+AC4, FR-014 — o Done do IME conclui o campo sem enviar; Enter sozinho abre/fecha o teclado do sistema (não pode ser tomado)
  it('Done do IME no último campo leva o foco à ação sem enviar; Enter sozinho continua do teclado do sistema', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })
    fillXtream()
    const password = screen.getByLabelText('Senha')
    password.focus()

    const enterLeftAlone = fireEvent.keyDown(password, { key: 'Enter', keyCode: 13 })
    expect(enterLeftAlone).toBe(true)
    expect(password).toHaveFocus()

    fireEvent.keyDown(password, { key: 'Unidentified', keyCode: 65376 })

    expect(submitButton()).toHaveFocus()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(await db.sources.count()).toBe(0)
  })
})
