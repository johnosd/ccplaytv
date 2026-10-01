/**
 * Contrato da feature 028 (Limpeza e QA do DS V14) — `Icon` sem `var()` em
 * atributos SVG (FR-023; bug do backlog achado na feature 025).
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Icon } from './Icon'

afterEach(() => {
  cleanup()
})

describe('Icon (feature 028)', () => {
  // FR-023: atributo SVG de tamanho não aceita var(); o token passa a valer por CSS/estilo.
  it('não grava var() nos atributos width/height do <svg>', () => {
    const { container } = render(<Icon name="play" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    for (const attribute of ['width', 'height']) {
      expect(svg?.getAttribute(attribute) ?? '').not.toContain('var(')
    }
  })
})
