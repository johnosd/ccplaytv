/**
 * O ganho estrutural da feature 089 (R-012), travado em teste.
 *
 * A medição na TV atribuiu o tempo de thread preso à recriação, a cada tecla, da consulta da janela de prévias:
 * **19,6 eventos de cache por tecla**, contra 0,4 de scroll e 0,6 de transação de banco. As janelas com mais eventos
 * deram 33 fps; as com menos, 41.
 *
 * Este teste conta os eventos do cache ao **deslizar a janela**, que é o que a navegação faz. Sem ele, uma mudança
 * futura poderia reintroduzir a consulta por janela e o custo voltaria sem nada acusar — a TV só diria meses depois.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCategoryPreviews, type CatalogCategory } from './catalogApi'
import * as repository from '../../lib/catalog/catalogRepository'

vi.mock('../../lib/catalog/catalogRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/catalogRepository')>()
  return { ...actual, getActiveCategoryBlock: vi.fn(), listChannels: vi.fn() }
})

function category(id: number): CatalogCategory {
  return { id, kind: 'movie', name: `Cat ${id}`, order: id, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

/** Janela de 5 categorias começando em `inicio`, como a virtualização entrega. */
const janela = (inicio: number): CatalogCategory[] => [0, 1, 2, 3, 4].map((n) => category(inicio + n))

afterEach(() => vi.clearAllMocks())

describe('a janela de prévias ao deslizar (089, R-012)', () => {
  it('deslizar não relê as categorias que já estavam na janela, e os eventos de cache ficam por tecla, não por janela', async () => {
    vi.mocked(repository.getActiveCategoryBlock).mockResolvedValue(undefined)
    vi.mocked(repository.listChannels).mockImplementation(async () => [
      { id: 1, name: 'Filme', providerStreamId: '1' } as unknown as Awaited<ReturnType<typeof repository.listChannels>>[number],
    ])

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    let eventos = 0
    const parar = client.getQueryCache().subscribe(() => {
      eventos += 1
    })
    try {
      const { result, rerender } = renderHook(({ cats }: { cats: CatalogCategory[] }) => useCategoryPreviews('s', cats), {
        wrapper,
        initialProps: { cats: janela(1) },
      })
      await waitFor(() => expect(result.current.size).toBe(5))

      const leiturasIniciais = vi.mocked(repository.listChannels).mock.calls.length
      const eventosIniciais = eventos
      expect(leiturasIniciais).toBe(5) // a janela inteira, uma vez

      // Desliza oito vezes, uma categoria nova por deslize — é o que `ArrowDown` provoca.
      const DESLIZES = 8
      for (let n = 1; n <= DESLIZES; n += 1) {
        rerender({ cats: janela(1 + n) })
        await waitFor(() => expect(result.current.has(5 + n)).toBe(true))
      }

      const leiturasNovas = vi.mocked(repository.listChannels).mock.calls.length - leiturasIniciais
      const eventosPorDeslize = (eventos - eventosIniciais) / DESLIZES

      // Uma leitura por deslize: só a categoria que ENTROU na janela. As quatro que permaneceram saem do cache.
      expect(leiturasNovas).toBe(DESLIZES)

      // O número que a TV mediu em 19,6 por tecla. O limite é folgado de propósito — o que importa é que o custo seja
      // por CATEGORIA NOVA e não por janela inteira; se a consulta por janela voltar, isto dispara muito acima.
      expect(eventosPorDeslize).toBeLessThan(10)
    } finally {
      parar()
    }
  })

  it('a janela parada não gera leitura nem evento novo — navegar na horizontal não paga prévia', async () => {
    vi.mocked(repository.getActiveCategoryBlock).mockResolvedValue(undefined)
    vi.mocked(repository.listChannels).mockResolvedValue([])

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result, rerender } = renderHook(({ cats }: { cats: CatalogCategory[] }) => useCategoryPreviews('s', cats), {
      wrapper,
      initialProps: { cats: janela(1) },
    })
    await waitFor(() => expect(result.current.size).toBe(5))
    const leituras = vi.mocked(repository.listChannels).mock.calls.length

    // Mesmos ids, array novo — exatamente o que acontece a cada render da vitrine ao andar com ← →.
    for (let n = 0; n < 5; n += 1) rerender({ cats: janela(1) })
    await waitFor(() => expect(result.current.size).toBe(5))

    expect(vi.mocked(repository.listChannels).mock.calls.length).toBe(leituras)
  })
})
