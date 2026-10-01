import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourcesPanel } from './SourcesPanel'
import * as catalogApi from '../catalog/catalogApi'
import type { SourceOut } from '../import/importApi'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogCounts: vi.fn() }
})

afterEach(cleanup)

function withQuery({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

const SOURCE: SourceOut = {
  id: 'a',
  type: 'provider_credentials',
  display_name: 'Lista a',
  connection_state: 'synced',
  last_successful_sync_at: '2026-09-20T12:00:00.000Z',
  provider_import_mode: 'xtream_api',
  limited_reason: null,
  provider_dns: null,
  last_truncated_by_storage: false,
  last_discarded_by_type: 0,
}

function renderPanel(source: SourceOut, data: catalogApi.CatalogCounts | undefined) {
  vi.mocked(catalogApi.useCatalogCounts).mockReturnValue({ data } as ReturnType<typeof catalogApi.useCatalogCounts>)
  render(
    <SourcesPanel sources={[source]} activeSourceId={null} focusedCol={0} resyncPending={false} deletePending={false} onActivateRow={vi.fn()} />,
    { wrapper: withQuery },
  )
  return screen.getByRole('group', { name: 'Lista Lista a' })
}

describe('SourcesPanel — contagem da lista (feature 034, US4)', () => {
  it('mostra a contagem conhecida na linha', () => {
    const row = renderPanel(SOURCE, { channels: { categories: 41 }, movies: { categories: 20 }, series: { categories: 30 } })
    expect(within(row).getByText('41 categorias de canais · 20 de filmes · 30 de séries')).toBeInTheDocument()
  })

  it('seção que não respondeu na última sincronização aparece como "não obtidos"', () => {
    const row = renderPanel({ ...SOURCE, unavailable_sections: ['series'] }, { channels: { categories: 3 }, movies: { categories: 4 }, series: { categories: 0 } })
    expect(within(row).getByText('3 categorias de canais · 4 de filmes · séries não obtidas')).toBeInTheDocument()
  })

  it('enquanto lê (sem dado) ou sem nenhuma contagem, não mostra número nenhum — nunca "0"', () => {
    const loading = renderPanel(SOURCE, undefined)
    expect(loading.querySelector('.sources-panel-counts')).toBeNull()
    cleanup()
    const empty = renderPanel(SOURCE, { channels: { categories: 0 }, movies: { categories: 0 }, series: { categories: 0 } })
    expect(empty.querySelector('.sources-panel-counts')).toBeNull()
    expect(empty.textContent).not.toMatch(/\b0\b/)
  })
})
