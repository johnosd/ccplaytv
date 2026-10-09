import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const sourceQueryState: { isSuccess: boolean; isError: boolean; data: { sources: [] } } = {
  isSuccess: false,
  isError: false,
  data: { sources: [] },
}

vi.mock('./features/import/importApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./features/import/importApi')>()),
  useSources: vi.fn(() => sourceQueryState),
}))

vi.mock('./features/splash/SplashScreen', () => ({
  SplashScreen: ({ ready }: { ready: boolean }) => <div data-testid="startup-ready">{String(ready)}</div>,
}))

afterEach(() => {
  cleanup()
  sourceQueryState.isSuccess = false
  sourceQueryState.isError = false
})

describe('App — prontidão de abertura (feature 065, T042)', () => {
  it('não usa timer fixo e libera após fontes locais em sucesso ou erro terminal', async () => {
    const client = new QueryClient()
    const view = render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('startup-ready')).toHaveTextContent('false')
    sourceQueryState.isError = true
    view.rerender(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('startup-ready')).toHaveTextContent('true'))
  })
})
