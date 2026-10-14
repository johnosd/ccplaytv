import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { I18nProvider } from '../lib/i18n/I18nProvider'
import { lazyRoute } from '../navigation/lazyRoute'
import { RouteBoundary } from './RouteBoundary'

function renderBoundary(children: ReactNode, onBack = vi.fn()) {
  return { onBack, ...render(<I18nProvider><RouteBoundary onBack={onBack}>{children}</RouteBoundary></I18nProvider>) }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('RouteBoundary', () => {
  it('exibe erro acionável sem painel de diagnóstico nem mensagem bruta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function Broken(): ReactNode {
      const error = new TypeError('Cannot read properties of undefined: https://user:password@example.test/private')
      error.stack = 'TypeError: private\n at file:///app/route-series-detail.js:222:19'
      throw error
    }
    const { onBack } = renderBoundary(<Broken />)
    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent('password')
    expect(screen.queryByTestId('series-diagnostics')).not.toBeInTheDocument()
    expect(screen.queryByText('Fotografe o erro e este diagnóstico.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Backspace' })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('mantém o carregamento focável e entrega RETURN enquanto a promise está pendente', () => {
    const onBack = vi.fn()
    const Pending = lazyRoute(() => new Promise(() => undefined), 'Pending')
    renderBoundary(<Pending />, onBack)

    const boundary = document.querySelector('.route-boundary')
    expect(boundary).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Backspace' })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('faz retry por SELECT com uma nova promise e nunca expõe o erro original', async () => {
    let attempts = 0
    const secret = 'https://user:password@example.test/chunk.js'
    const Retry = lazyRoute(() => {
      attempts += 1
      if (attempts === 1) return Promise.reject(new Error(secret))
      return Promise.resolve({ Retry: () => <p data-testid="route-ready">pronto</p> })
    }, 'Retry')
    renderBoundary(<Retry />)

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('Não foi possível abrir esta tela agora.')
    expect(error).not.toHaveTextContent(secret)
    expect(error.querySelectorAll('button')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByTestId('route-ready')).toHaveTextContent('pronto')
    expect(attempts).toBe(2)
  })

  it('oferece Voltar como segunda ação de erro e não refaz a importação ao usá-lo', async () => {
    const onBack = vi.fn()
    const load = vi.fn(() => Promise.reject(new Error('chunk unavailable')))
    const Failed = lazyRoute(load, 'Failed')
    renderBoundary(<Failed />, onBack)

    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('alert').querySelectorAll('button')[1])
    expect(onBack).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
  })
})
