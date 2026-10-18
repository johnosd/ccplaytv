/**
 * Teste de CONTRATO da feature 079 — o hook de montagem com o tempo real da tela: "Carregando" só depois de 300 ms, o teto de
 * 2 s revela com leitura pendente, e capas da primeira tela só seguram a revelação por uma janela curta (300 ms). Travado em
 * `sdd/specs/079-home-carregamento-progressivo/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * EMENDADO em 2026-10-16 (autorizado pelo usuário, R-008 do plan): capas deixaram de segurar a tela até o teto — padrão dos
 * apps de streaming: a tela aparece com os cards no lugar e as capas chegam dentro deles.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssemblySlot, SlotStatus } from './screenAssembly'
import { useScreenAssembly, type UseScreenAssemblyOptions } from './useScreenAssembly'

type Key = 'a' | 'b'
const slots = (a: SlotStatus, b: SlotStatus): AssemblySlot<Key>[] => [
  { key: 'a', status: a },
  { key: 'b', status: b },
]

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useScreenAssembly — contrato da feature 079', () => {
  // US2/AC1, US2/AC2, US3/AC1, US3/AC4, FR-002, FR-003, FR-004, Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('"Carregando" só a partir de 300 ms; aos 2 s revela com a leitura pendente; capa lenta segura a tela só até 300 ms', () => {
    const neverLoads = vi.fn(() => new Promise<void>(() => {}))
    const { result, rerender } = renderHook((options: UseScreenAssemblyOptions<Key>) => useScreenAssembly(options), {
      initialProps: { screen: 'home', slots: slots('pending', 'pending'), imageUrls: [], loadImage: neverLoads },
    })
    expect(result.current.phase).toBe('waiting')
    expect(result.current.showLoading).toBe(false)

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current.showLoading).toBe(false) // carga rápida não pisca
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.showLoading).toBe(true)

    // Uma leitura ainda pendente não impede a primeira fileira pronta de aparecer após a janela curta.
    rerender({ screen: 'home', slots: slots('ready', 'pending'), imageUrls: ['https://img.example.org/capa.jpg'], loadImage: neverLoads })
    expect(neverLoads).toHaveBeenCalledWith('https://img.example.org/capa.jpg')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.phase).toBe('revealed')
    expect(result.current.reason).toBe('ready')
    expect(result.current.showLoading).toBe(false)
    expect(result.current.isShown('a')).toBe(true)
    expect(result.current.isShown('b')).toBe(false)

    // Leituras prontas e só a capa pendente: a tela espera a capa por 300 ms, no máximo — depois aparece sem ela.
    const slow = renderHook((options: UseScreenAssemblyOptions<Key>) => useScreenAssembly(options), {
      initialProps: { screen: 'movies', slots: slots('ready', 'empty'), imageUrls: ['https://img.example.org/lenta.jpg'], loadImage: neverLoads },
    })
    expect(slow.result.current.phase).toBe('waiting')
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(slow.result.current.phase).toBe('waiting')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(slow.result.current.phase).toBe('revealed')
    expect(slow.result.current.reason).toBe('ready')
    expect(slow.result.current.isShown('a')).toBe(true)
  })
})
