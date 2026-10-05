import { describe, expect, it } from 'vitest'
import { movePanelFocus } from './detailPanelGrid'

// Feature 059, D-008 (`logic/semelhantes-duas-linhas.md` §2).
const ROWS = [
  ['a1', 'a2', 'a3'],
  ['b1', 'b2'],
]

describe('movePanelFocus', () => {
  it('←/→ andam na linha e param nas pontas, sem dar a volta', () => {
    expect(movePanelFocus(ROWS, 'a1', 'right')).toEqual({ kind: 'focus', key: 'a2' })
    expect(movePanelFocus(ROWS, 'a2', 'left')).toEqual({ kind: 'focus', key: 'a1' })
    expect(movePanelFocus(ROWS, 'a1', 'left')).toEqual({ kind: 'stay' })
    expect(movePanelFocus(ROWS, 'a3', 'right')).toEqual({ kind: 'stay' })
    expect(movePanelFocus(ROWS, 'b2', 'right')).toEqual({ kind: 'stay' })
  })

  it('↓/↑ trocam de linha mantendo a coluna, limitada ao tamanho da outra linha', () => {
    expect(movePanelFocus(ROWS, 'a2', 'down')).toEqual({ kind: 'focus', key: 'b2' })
    expect(movePanelFocus(ROWS, 'a3', 'down')).toEqual({ kind: 'focus', key: 'b2' })
    expect(movePanelFocus(ROWS, 'b1', 'up')).toEqual({ kind: 'focus', key: 'a1' })
    expect(movePanelFocus(ROWS, 'b2', 'up')).toEqual({ kind: 'focus', key: 'a2' })
  })

  it('↑ na primeira linha sai do painel; ↓ na última fica', () => {
    expect(movePanelFocus(ROWS, 'a2', 'up')).toEqual({ kind: 'exit-up' })
    expect(movePanelFocus(ROWS, 'b1', 'down')).toEqual({ kind: 'stay' })
  })

  it('linha única: ↑ sai, ↓ fica; chave desconhecida não move', () => {
    const single = [['c1', 'c2']]
    expect(movePanelFocus(single, 'c2', 'up')).toEqual({ kind: 'exit-up' })
    expect(movePanelFocus(single, 'c1', 'down')).toEqual({ kind: 'stay' })
    expect(movePanelFocus(single, 'zz', 'right')).toEqual({ kind: 'stay' })
  })
})
