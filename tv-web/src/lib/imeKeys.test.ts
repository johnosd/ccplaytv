import { describe, expect, it } from 'vitest'
import { IME_KEYCODES, imeKeyOf } from './imeKeys'

describe('imeKeyOf', () => {
  it('reconhece Done e Cancel pelo keyCode da tabela', () => {
    expect(imeKeyOf({ keyCode: IME_KEYCODES.done[0] })).toBe('done')
    expect(imeKeyOf({ keyCode: IME_KEYCODES.cancel[0] })).toBe('cancel')
  })

  it('Enter, RETURN e teclas comuns não são teclas do IME', () => {
    expect(imeKeyOf({ keyCode: 13 })).toBeNull()
    expect(imeKeyOf({ keyCode: 10009 })).toBeNull()
    expect(imeKeyOf({ keyCode: 65 })).toBeNull()
    expect(imeKeyOf({})).toBeNull()
  })

  it('Next não tem código inventado: a tabela fica vazia até a medição na TV', () => {
    expect(IME_KEYCODES.next).toEqual([])
  })
})
