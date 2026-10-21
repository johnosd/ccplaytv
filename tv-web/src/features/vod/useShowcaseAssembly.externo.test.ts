import { describe, expect, it } from 'vitest'
import { stepAssembly, initialAssembly, type AssemblySlot } from '../../lib/assembly/screenAssembly'
import type { ShowcaseSlotKey } from './useShowcaseAssembly'

/** Feature 086 (FR-013/FR-017): a tela não espera por leitura de serviço externo. */
const slot = (key: ShowcaseSlotKey, status: AssemblySlot['status'], extra: Partial<AssemblySlot<ShowcaseSlotKey>> = {}): AssemblySlot<ShowcaseSlotKey> =>
  ({ ...extra, key, status })

describe('montagem com fileiras de serviço externo (086)', () => {
  it('com as leituras locais prontas e as externas pendentes, a tela revela por "ready" — não pelo teto', () => {
    const slots = [
      slot('categories', 'ready', { primary: true, required: true }),
      slot('continue', 'ready', { primary: true }),
      slot('added', 'ready', { primary: true }),
      slot('top10', 'pending', { external: true }),
      slot('tip', 'pending', { external: true }),
      slot('because', 'pending', { external: true }),
    ]
    const state = stepAssembly(initialAssembly<ShowcaseSlotKey>(), {
      slots, imagesSettled: true, capPassed: false, following: false, firstRender: false,
    })
    expect(state.phase).toBe('revealed')
    expect(state.reason).toBe('ready')
    expect(state.shown).toContain('categories')
  })

  it('uma leitura LOCAL pendente ainda segura a tela (o atalho vale só para as externas)', () => {
    const slots = [
      slot('categories', 'ready', { required: true }),
      slot('added', 'pending'),
      slot('top10', 'pending', { external: true }),
    ]
    const state = stepAssembly(initialAssembly<ShowcaseSlotKey>(), {
      slots, imagesSettled: true, capPassed: false, following: false, firstRender: false,
    })
    expect(state.phase).toBe('waiting')
  })

  it('a fileira externa que chega depois entra na tela, sem exigir nova montagem', () => {
    const base = [slot('categories', 'ready', { required: true }), slot('top10', 'pending', { external: true })]
    const revealed = stepAssembly(initialAssembly<ShowcaseSlotKey>(), {
      slots: base, imagesSettled: true, capPassed: false, following: false, firstRender: false,
    })
    const comTop10 = stepAssembly(revealed, {
      slots: [base[0], slot('top10', 'ready', { external: true })],
      imagesSettled: true, capPassed: false, following: false, firstRender: false,
    })
    expect(comTop10.shown).toEqual(['categories', 'top10'])
    expect(comTop10.deferred).toEqual([])
  })
})
