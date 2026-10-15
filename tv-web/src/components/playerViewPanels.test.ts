import { describe, expect, it } from 'vitest'
import {
  buildAspectPanel,
  buildQualityPanel,
  initialChoiceFocusKey,
  moveChoiceFocus,
  reconcileChoiceFocus,
} from './playerViewPanels'

describe('buildAspectPanel', () => {
  it('uma linha por modo do motor, com os rótulos do DS e a marcada', () => {
    const model = buildAspectPanel(['fit', 'fill', 'zoom'], 'fill')
    expect(model.title).toBe('Aspecto')
    expect(model.rows.map((r) => [r.key, r.label, r.checked])).toEqual([
      ['a:fit', 'Ajustar', false],
      ['a:fill', 'Preencher', true],
      ['a:zoom', 'Zoom', false],
    ])
  })

  it('sem marcada nenhuma linha vem marcada; foco inicial cai na primeira', () => {
    const model = buildAspectPanel(['fit', 'fill'], null)
    expect(model.rows.some((r) => r.checked)).toBe(false)
    expect(initialChoiceFocusKey(model)).toBe('a:fit')
  })
})

describe('buildQualityPanel', () => {
  const options = [
    { id: '0', height: 480 },
    { id: '1', height: 1080 },
    { id: '2', height: 1080, bitrateKbps: 5000 },
  ]

  it('Auto + uma linha por altura, da maior para a menor; Auto marcada quando não há seleção', () => {
    const model = buildQualityPanel(options, null)
    expect(model.title).toBe('Qualidade')
    expect(model.rows.map((r) => [r.key, r.label, r.checked])).toEqual([
      ['q:auto', 'Auto', true],
      ['q:1080', '1080p', false],
      ['q:480', '480p', false],
    ])
  })

  it('marca a linha da variante selecionada (a de maior taxa na altura repetida)', () => {
    const model = buildQualityPanel(options, '2')
    expect(model.rows.find((r) => r.checked)?.key).toBe('q:1080')
    expect(model.rows.find((r) => r.key === 'q:1080')).toMatchObject({ qualityId: '2', height: 1080 })
    expect(model.rows.find((r) => r.key === 'q:auto')).toMatchObject({ qualityId: null })
  })

  it('id selecionado que sumiu: nenhuma marcada, foco inicial em Auto', () => {
    const model = buildQualityPanel(options, 'sumiu')
    expect(model.rows.some((r) => r.checked)).toBe(false)
    expect(initialChoiceFocusKey(model)).toBe('q:auto')
  })
})

describe('foco', () => {
  const model = buildQualityPanel([{ id: '0', height: 480 }, { id: '1', height: 1080 }], '1')

  it('foco inicial = a marcada', () => {
    expect(initialChoiceFocusKey(model)).toBe('q:1080')
  })

  it('↑/↓ sem volta nas pontas; chave desconhecida cai na primeira', () => {
    expect(moveChoiceFocus(model, 'q:auto', 'up')).toBe('q:auto')
    expect(moveChoiceFocus(model, 'q:auto', 'down')).toBe('q:1080')
    expect(moveChoiceFocus(model, 'q:480', 'down')).toBe('q:480')
    expect(moveChoiceFocus(model, 'q:xyz', 'down')).toBe('q:auto')
  })

  it('reconcilia pela chave, nunca pelo índice; chave sumida vai à marcada', () => {
    expect(reconcileChoiceFocus(model, 'q:480')).toBe('q:480')
    expect(reconcileChoiceFocus(model, 'q:720')).toBe('q:1080')
  })
})
