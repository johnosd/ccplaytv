import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ContentCard } from './ContentCard'

afterEach(cleanup)

describe('022 — ContentCard reaproveita o PosterArt e mantém geometria por variante', () => {
  // US4/AC1,AC2,AC5 · FR-017, FR-018 · SC-005
  it('renderiza via PosterArt (mesma estrutura, sem <img> duplicada) e cada variante tem uma classe própria e distinta', () => {
    const { container, rerender } = render(
      <ContentCard variant="portrait" title="Filme Exemplo" iconUrl="http://exemplo.test/capa.png" />,
    )

    // Delega no PosterArt de verdade (feature 015): mesma estrutura
    // (.poster-box, rótulo "pôster", <img class="poster-box-art">) —
    // nunca uma <img> própria reimplementando a lógica de fallback.
    expect(container.querySelector('.poster-box')).not.toBeNull()
    // exact:false: o rótulo do PosterArt tem "pôster" e o título no mesmo
    // <span>, separados por <br/> — Testing Library concatena só os nós de
    // texto diretos ("pôsterFilme Exemplo"), então uma busca exata por
    // "pôster" nunca bate (confirmado empiricamente; achado do sdd-execute,
    // 2026-09-26, ver R-005 em plan.md). exact:false ainda prova a mesma
    // coisa — o texto "pôster" está presente no rótulo do PosterArt.
    expect(screen.getByText('pôster', { exact: false })).toBeInTheDocument()
    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveClass('poster-box-art')
    expect(images[0]).toHaveAttribute('src', 'http://exemplo.test/capa.png')

    const variants: { variant: 'portrait' | 'landscape' | 'wide' | 'compact'; className: string }[] = [
      { variant: 'portrait', className: 'content-card--portrait' },
      { variant: 'landscape', className: 'content-card--landscape' },
      { variant: 'wide', className: 'content-card--wide' },
      { variant: 'compact', className: 'content-card--compact' },
    ]
    const seenClasses = new Set<string>()
    for (const { variant, className } of variants) {
      rerender(<ContentCard variant={variant} title="X" />)
      const root = container.querySelector(`.${className}`)
      expect(root, `variante ${variant} deveria ter a classe ${className}`).not.toBeNull()
      seenClasses.add(className)
    }
    expect(seenClasses.size).toBe(4) // as 4 classes são distintas entre si
  })
})
