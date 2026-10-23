/**
 * Feature 086, SC-012 (task T087): na abertura, **só** as capas da primeira tela são pedidas; as fileiras de baixo não
 * pedem nada até entrarem na vista.
 *
 * Por que por teste e não na TV: o critério é sobre **quais** capas são pedidas e em que ordem, e isso é observável
 * aqui com precisão. Na TV só se vê quantas ficaram prontas (`imagesSettled`), que é o SC-011 — outro critério.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScreenAssembly } from './useScreenAssembly'
import type { AssemblySlot } from './screenAssembly'

const PRIMEIRA_TELA = ['capa-1.jpg', 'capa-2.jpg', 'capa-3.jpg']
const ABAIXO_DA_DOBRA = ['fileira-de-baixo-1.jpg', 'fileira-de-baixo-2.jpg']

const slots = (...status: AssemblySlot<'a' | 'b'>['status'][]): AssemblySlot<'a' | 'b'>[] =>
  status.map((each, index) => ({ key: index === 0 ? 'a' : 'b', status: each, primary: index === 0 }))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('capas da primeira tela (086, SC-012)', () => {
  it('pede só as capas que a montagem recebeu, uma vez cada, e nenhuma das fileiras de baixo', () => {
    const pedidas: string[] = []
    const loadImage = (url: string): Promise<void> => {
      pedidas.push(url)
      return Promise.resolve()
    }

    const { rerender } = renderHook(
      (props: Parameters<typeof useScreenAssembly<'a' | 'b'>>[0]) => useScreenAssembly(props),
      { initialProps: { screen: 'movies' as const, slots: slots('ready', 'pending'), imageUrls: PRIMEIRA_TELA, loadImage } },
    )

    // Só a primeira tela, e nada do que está abaixo da dobra.
    expect(pedidas).toEqual(PRIMEIRA_TELA)
    for (const url of ABAIXO_DA_DOBRA) expect(pedidas).not.toContain(url)

    // Rerender com as mesmas capas não pede de novo: cada URL é pedida uma vez só.
    rerender({ screen: 'movies', slots: slots('ready', 'ready'), imageUrls: PRIMEIRA_TELA, loadImage })
    expect(pedidas).toEqual(PRIMEIRA_TELA)

    // Quando a fileira de baixo entra na vista, quem desenha passa as capas dela — e só então elas são pedidas.
    rerender({ screen: 'movies', slots: slots('ready', 'ready'), imageUrls: [...PRIMEIRA_TELA, ...ABAIXO_DA_DOBRA], loadImage })
    expect(pedidas).toEqual([...PRIMEIRA_TELA, ...ABAIXO_DA_DOBRA])
  })

  it('a tela não espera as capas além da janela do "Carregando" (FR-022: o card já ocupa o lugar)', () => {
    // Capa que nunca resolve. As leituras começam pendentes de propósito: com elas já resolvidas no 1º render, a
    // feature 079 revela na hora pelo caminho `cache`, e a janela das capas nem entra em jogo.
    const loadImage = () => new Promise<void>(() => {})
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useScreenAssembly<'a' | 'b'>>[0]) => useScreenAssembly(props),
      { initialProps: { screen: 'movies' as const, slots: slots('pending', 'pending'), imageUrls: [] as string[], loadImage } },
    )
    expect(result.current.phase).toBe('waiting')

    // As leituras chegam, e com elas as capas da primeira tela — que nunca vão resolver.
    rerender({ screen: 'movies', slots: slots('ready', 'ready'), imageUrls: PRIMEIRA_TELA, loadImage })
    expect(result.current.phase).toBe('waiting')

    // Passada a janela do "Carregando", a tela aparece com os cards no lugar: a capa chega dentro deles, sem mover nada.
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.phase).toBe('revealed')
  })
})
