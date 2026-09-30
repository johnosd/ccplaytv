// Feature 021, Fase 7 (T041) — D-006 do plan.md.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Icon } from './Icon'
import { ICON_PATHS, type IconName } from './iconPaths'

afterEach(cleanup)

const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[]

describe('Icon', () => {
  it.each(ICON_NAMES)('%s renderiza um <svg> com pelo menos uma forma', (name) => {
    const { container } = render(<Icon name={name} label={name} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.children.length).toBeGreaterThan(0)
  })

  it('com label, é encontrado por getByRole("img", { name })', () => {
    render(<Icon name="favorite" label="Favoritar" />)
    const icon = screen.getByRole('img', { name: 'Favoritar' })
    expect(icon.tagName.toLowerCase()).toBe('svg')
  })

  it('sem label, tem aria-hidden e não é encontrado por getByRole("img")', () => {
    render(<Icon name="favorite" />)
    expect(screen.queryByRole('img')).toBeNull()
    const svg = document.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })
})
