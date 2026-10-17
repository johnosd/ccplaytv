import { describe, expect, it } from 'vitest'
import { initialAssembly, stepAssembly, type AssemblyInput, type AssemblySlot, type SlotStatus } from './screenAssembly'

type Key = 'cats' | 'a' | 'b' | 'c'

const base = { imagesSettled: true, capPassed: false, following: false, firstRender: false }

function slots(cats: SlotStatus, a: SlotStatus, b: SlotStatus, c: SlotStatus): AssemblySlot<Key>[] {
  return [
    { key: 'a', status: a },
    { key: 'b', status: b },
    { key: 'c', status: c },
    { key: 'cats', status: cats, required: true },
  ]
}

const step = (prev: ReturnType<typeof initialAssembly<Key>>, input: Partial<AssemblyInput<Key>> & Pick<AssemblyInput<Key>, 'slots'>) =>
  stepAssembly(prev, { ...base, ...input })

describe('stepAssembly', () => {
  it('o teto não revela sem a leitura obrigatória', () => {
    let s = step(initialAssembly<Key>(), { capPassed: true, slots: slots('pending', 'ready', 'ready', 'ready') })
    expect(s.phase).toBe('waiting')
    s = step(s, { capPassed: true, slots: slots('ready', 'ready', 'pending', 'ready') })
    expect(s.phase).toBe('revealed')
    expect(s.reason).toBe('cap')
    expect(s.shown).toEqual(['a', 'c', 'cats'])
  })

  it('falha conta como resolvida e não aparece', () => {
    const s = step(initialAssembly<Key>(), { slots: slots('ready', 'failed', 'ready', 'empty') })
    expect(s.reason).toBe('ready')
    expect(s.shown).toEqual(['b', 'cats'])
  })

  it('depois do teto, várias chegando no mesmo passo entram em ordem crescente', () => {
    let s = step(initialAssembly<Key>(), { capPassed: true, slots: slots('pending', 'ready', 'pending', 'pending') })
    expect(s.phase).toBe('waiting')
    s = step(s, { capPassed: true, slots: slots('empty', 'ready', 'pending', 'pending') })
    expect(s.shown).toEqual(['a'])
    s = step(s, { capPassed: true, slots: slots('ready', 'ready', 'ready', 'ready') })
    expect(s.shown).toEqual(['a', 'b', 'c', 'cats'])
    expect(s.deferred).toEqual([])
  })

  it('sem mudança devolve o mesmo objeto', () => {
    const s = step(initialAssembly<Key>(), { slots: slots('ready', 'ready', 'empty', 'empty') })
    expect(step(s, { capPassed: true, slots: slots('ready', 'ready', 'empty', 'empty') })).toBe(s)
  })
})
