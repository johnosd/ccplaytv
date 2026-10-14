import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { useTitleMetadata } from './catalogApi'
import { resetAppLanguageForTests, writeAppLanguage } from '../../lib/i18n/appLanguage'
import { ensureTitleMetadata } from '../../lib/metadata/titleMetadata'

vi.mock('../../lib/metadata/titleMetadata', async (original) => ({
  ...await original<typeof import('../../lib/metadata/titleMetadata')>(), ensureTitleMetadata: vi.fn(),
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
  vi.resetAllMocks()
})

it('061: troca idioma mantém só os selos locais enquanto consulta; trocar título não herda os selos', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ratings = { certifications: { BR: '14', US: 'R' }, tmdbRating: { average: 7.8, votes: 100 } }
  queryClient.setQueryData(['title-metadata', '10', 'pt'], { ...ratings, synopsis: { value: 'Texto em português', origin: 'tmdb' } })
  vi.mocked(ensureTitleMetadata).mockReturnValue(new Promise(() => {}))
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const { result, rerender, unmount } = renderHook(({ id }) => useTitleMetadata(id), { initialProps: { id: '10' }, wrapper })
  act(() => writeAppLanguage('en'))
  expect(result.current.isPlaceholderData).toBe(true)
  expect(result.current.data).toEqual(ratings)
  expect(result.current.data).not.toHaveProperty('synopsis')
  rerender({ id: '11' })
  expect(result.current.data).toBeUndefined()
  unmount()
  queryClient.clear()
})
