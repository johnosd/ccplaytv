import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/catalog/db'
import { storeCategories } from '../../lib/catalog/catalogRepository'
import { setCategoryPreference, notifyCategoryAccessChanged } from '../../lib/catalog/categoryAccess'
import { SuggestionStep, type SuggestionDecision } from './parental/SuggestionStep'

/** Feature 066 (T031, US3): adultas de todas as seções vêm marcadas; desmarcar e confirmar; vazio com foco. */

const SOURCE = 'fonte-sugestao-066'
const press = (key: string) => fireEvent.keyDown(document.body, { key, bubbles: true })

async function seed(names: Array<{ kind: 'channel' | 'movie' | 'series'; name: string }>) {
  await db.sources.put({ id: SOURCE, type: 'm3u_url', displayName: 'Sala', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
  await storeCategories(names.map(({ kind, name }, order) => ({ sourceId: SOURCE, generation: 1, kind, fetchMode: 'eager' as const, name, order })), db)
}

function renderStep() {
  const onConfirm = vi.fn<(decisions: SuggestionDecision[]) => void>()
  const onCancel = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  render(<SuggestionStep sourceId={SOURCE} onConfirm={onConfirm} onCancel={onCancel} />, { wrapper })
  return { onConfirm, onCancel }
}

afterEach(async () => {
  cleanup()
  await Promise.all([db.categories.clear(), db.sources.clear(), db.table('categoryPreferences').clear()])
  notifyCategoryAccessChanged() // a regra guardada em memória não vê limpeza direta das tabelas
})

describe('SuggestionStep', () => {
  it('pré-marca as adultas de todas as seções (não as recusadas); desmarcar e confirmar devolve as decisões', async () => {
    await seed([
      { kind: 'channel', name: 'Notícias' },
      { kind: 'channel', name: 'XXX Canais' },
      { kind: 'movie', name: 'Filmes +18' },
      { kind: 'series', name: 'Adultos' },
    ])
    await setCategoryPreference({ sourceId: SOURCE, kind: 'series', name: 'Adultos' }, { declinedSuggestion: true }, db)
    const { onConfirm } = renderStep()

    expect(await screen.findByRole('button', { name: /XXX Canais/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Filmes \+18/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Notícias')).toBeNull()
    expect(screen.queryByText('Adultos')).toBeNull()
    expect(screen.getByRole('button', { name: /XXX Canais/ })).toHaveClass('tv-focus')

    press('Enter') // desmarca "XXX Canais"
    expect(screen.getByRole('button', { name: /XXX Canais/ })).toHaveAttribute('aria-pressed', 'false')
    press('ArrowDown')
    press('ArrowDown')
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveClass('tv-focus')
    press('Enter')

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0][0].map(({ category, locked }) => [category.name, locked])).toEqual([
      ['XXX Canais', false],
      ['Filmes +18', true],
    ])
  })

  it('sem nenhuma adulta: diz que não achou, "Confirmar" focado; RETURN cancela', async () => {
    await seed([{ kind: 'channel', name: 'Esportes' }])
    const { onConfirm, onCancel } = renderStep()
    expect(await screen.findByText('Nenhuma categoria adulta encontrada nesta lista.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveClass('tv-focus')
    press('Escape')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
