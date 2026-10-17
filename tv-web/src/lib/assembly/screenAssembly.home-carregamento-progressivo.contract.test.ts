/**
 * Teste de CONTRATO da feature 079 (Home, Filmes e Séries já montadas ao entrar) — a regra pura de montagem. Travado em
 * `sdd/specs/079-home-carregamento-progressivo/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 * Regra: `sdd/specs/079-home-carregamento-progressivo/logic/montagem-de-tela.md`.
 */
import { describe, expect, it } from 'vitest'
import {
  initialAssembly,
  slotStatusOf,
  stepAssembly,
  type AssemblyInput,
  type AssemblySlot,
  type AssemblyState,
  type SlotStatus,
} from './screenAssembly'

type Key = 'a' | 'b' | 'c' | 'd' | 'e'

function slots(statuses: Record<Key, SlotStatus>): AssemblySlot<Key>[] {
  return (['a', 'b', 'c', 'd', 'e'] as const).map((key) => ({ key, status: statuses[key] }))
}

const base = { imagesSettled: true, capPassed: false, following: false, firstRender: false }

function step<K extends string>(prev: AssemblyState<K>, input: Partial<AssemblyInput<K>> & Pick<AssemblyInput<K>, 'slots'>) {
  return stepAssembly(prev, { ...base, ...input })
}

describe('screenAssembly — contrato da feature 079', () => {
  // US1/AC1, US1/AC2, US1/AC3, US3/AC2, US3/AC3, FR-001, FR-002, FR-007, FR-010
  it('espera todas as leituras e as capas, revela tudo de uma vez na ordem da tela; depois do teto, o que chega acima fica para a próxima entrada e o que chega abaixo entra ao fim', () => {
    expect(slotStatusOf({ data: undefined }, (d: number[]) => d.length === 0)).toBe('pending')
    expect(slotStatusOf({ data: undefined, isError: true }, (d: number[]) => d.length === 0)).toBe('failed')
    expect(slotStatusOf({ data: [] as number[] }, (d) => d.length === 0)).toBe('empty')
    expect(slotStatusOf({ data: [1] }, (d) => d.length === 0)).toBe('ready')

    let s = step(initialAssembly<Key>(), { firstRender: true, slots: slots({ a: 'pending', b: 'pending', c: 'pending', d: 'pending', e: 'pending' }) })
    expect(s.phase).toBe('waiting')

    // As de baixo terminam primeiro: nada aparece.
    s = step(s, { slots: slots({ a: 'pending', b: 'pending', c: 'ready', d: 'ready', e: 'empty' }) })
    expect(s.phase).toBe('waiting')
    expect(s.shown).toEqual([])

    // Todas resolvidas, mas as capas da primeira tela ainda não: continua esperando.
    s = step(s, { imagesSettled: false, slots: slots({ a: 'ready', b: 'empty', c: 'ready', d: 'ready', e: 'empty' }) })
    expect(s.phase).toBe('waiting')

    // Capas prontas: revela de uma vez, na ordem, sem as vazias.
    s = step(s, { slots: slots({ a: 'ready', b: 'empty', c: 'ready', d: 'ready', e: 'empty' }) })
    expect(s.phase).toBe('revealed')
    expect(s.reason).toBe('ready')
    expect(s.shown).toEqual(['a', 'c', 'd'])

    // Depois do teto: "b" passa a ter dado acima de "c"/"d" já na tela → adiada; "e" chega abaixo de tudo → entra ao fim.
    s = step(s, { capPassed: true, slots: slots({ a: 'ready', b: 'ready', c: 'ready', d: 'ready', e: 'ready' }) })
    expect(s.shown).toEqual(['a', 'c', 'd', 'e'])
    expect(s.deferred).toEqual(['b'])

    // Uma que fica vazia sai da tela; a adiada continua adiada.
    s = step(s, { capPassed: true, slots: slots({ a: 'ready', b: 'ready', c: 'empty', d: 'ready', e: 'ready' }) })
    expect(s.shown).toEqual(['a', 'd', 'e'])
    expect(s.deferred).toEqual(['b'])
  })

  // US2/AC5, US3/AC1, US3/AC5, FR-009, FR-011, FR-013, Constitution: "Progresso e Capacidades São Reais, Nunca Prometidos"
  it('com a leitura principal em cache aparece no 1º render e o que chega antes do teto se encaixa; o billboard que passa do teto não troca depois, salvo por ação da pessoa', () => {
    type HomeKey = 'hero' | 'r1' | 'r2'
    const home = (hero: SlotStatus, r1: SlotStatus, r2: SlotStatus): AssemblySlot<HomeKey>[] => [
      { key: 'hero', status: hero, primary: true, anchor: true },
      { key: 'r1', status: r1 },
      { key: 'r2', status: r2 },
    ]

    // Caminho do cache: o hero já está resolvido no 1º render → aparece na hora; as fileiras se encaixam até o teto.
    let warm = step(initialAssembly<HomeKey>(), { firstRender: true, imagesSettled: false, slots: home('ready', 'pending', 'pending') })
    expect(warm.phase).toBe('revealed')
    expect(warm.reason).toBe('cache')
    expect(warm.shown).toEqual(['hero'])
    warm = step(warm, { slots: home('ready', 'pending', 'ready') })
    warm = step(warm, { slots: home('ready', 'ready', 'ready') })
    expect(warm.shown).toEqual(['hero', 'r1', 'r2'])
    expect(warm.deferred).toEqual([])

    // Caminho frio: o hero não chega até o teto → revela sem ele (o billboard fica no modo neutro).
    let cold = step(initialAssembly<HomeKey>(), { firstRender: true, slots: home('pending', 'ready', 'pending') })
    expect(cold.phase).toBe('waiting')
    cold = step(cold, { capPassed: true, slots: home('pending', 'ready', 'pending') })
    expect(cold.phase).toBe('revealed')
    expect(cold.reason).toBe('cap')
    expect(cold.shown).toEqual(['r1'])

    // O hero chega depois: o billboard (âncora) não troca nesta visita. "r2" chega abaixo de tudo: entra.
    cold = step(cold, { capPassed: true, slots: home('ready', 'ready', 'ready') })
    expect(cold.shown).toEqual(['r1', 'r2'])
    expect(cold.deferred).toEqual(['hero'])

    // Ação da pessoa (fechar o player, favoritar): tudo que tem dado entra na posição.
    cold = step(cold, { capPassed: true, following: true, slots: home('ready', 'ready', 'ready') })
    expect(cold.shown).toEqual(['hero', 'r1', 'r2'])
    expect(cold.deferred).toEqual([])
  })
})
