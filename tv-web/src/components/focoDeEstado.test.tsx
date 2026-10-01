// Feature 022, Fase 13 (T060/T061) — foco de estado (ADR-009): o padrão das
// telas de catálogo é `.tv-focus` aplicado por React, não foco DOM. Cada
// componente interativo precisa aceitar esse foco e mostrá-lo.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { useRemoteNav } from '../lib/useRemoteNav'
import { Button } from './Button'
import { ChannelRow } from './ChannelRow'
import { Chip } from './Chip'
import { ContentCard } from './ContentCard'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { IconButton } from './IconButton'
import { SideCategoryNav } from './SideCategoryNav'
import { Tabs } from './Tabs'

afterEach(cleanup)

describe('foco de estado — aplica .tv-focus só no elemento focado', () => {
  it('Button', () => {
    const { rerender } = render(<Button variant="primary" onSelect={vi.fn()}>Ação</Button>)
    expect(screen.getByRole('button')).not.toHaveClass('tv-focus')
    rerender(<Button variant="primary" focused onSelect={vi.fn()}>Ação</Button>)
    expect(screen.getByRole('button')).toHaveClass('tv-focus')
  })

  it('IconButton', () => {
    const { rerender } = render(<IconButton icon="search" label="Buscar" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Buscar' })).not.toHaveClass('tv-focus')
    rerender(<IconButton icon="search" label="Buscar" focused onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Buscar' })).toHaveClass('tv-focus')
  })

  it('Chip', () => {
    const { rerender } = render(<Chip selected={false}>Ação</Chip>)
    expect(screen.getByRole('button')).not.toHaveClass('tv-focus')
    rerender(<Chip selected={false} focused>Ação</Chip>)
    expect(screen.getByRole('button')).toHaveClass('tv-focus')
  })

  it('Tabs: a aba focada é distinta da ativa', () => {
    render(
      <Tabs
        items={[
          { id: 'ep', label: 'Episódios' },
          { id: 'det', label: 'Detalhes' },
        ]}
        activeId="ep"
        focusedId="det"
        onSelect={vi.fn()}
      />,
    )
    const ativa = screen.getByRole('tab', { name: 'Episódios' })
    const focada = screen.getByRole('tab', { name: 'Detalhes' })
    expect(ativa).toHaveClass('tabs-item-active')
    expect(ativa).not.toHaveClass('tv-focus')
    expect(focada).toHaveClass('tv-focus')
    expect(focada).not.toHaveClass('tabs-item-active')
  })

  it('SideCategoryNav: a entrada focada é distinta da selecionada (.is-selected)', () => {
    render(
      <SideCategoryNav
        entries={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
        selectedId="a"
        focusedId="b"
        onSelect={vi.fn()}
      />,
    )
    const selecionada = screen.getByRole('button', { name: 'A' })
    const focada = screen.getByRole('button', { name: 'B' })
    expect(selecionada).toHaveClass('is-selected')
    expect(selecionada).not.toHaveClass('tv-focus')
    expect(focada).toHaveClass('tv-focus')
    expect(focada).not.toHaveClass('is-selected')
  })

  it('EmptyState', () => {
    const { rerender } = render(<EmptyState title="Nada" action={{ label: 'Explorar', onSelect: vi.fn() }} />)
    expect(screen.getByRole('button', { name: 'Explorar' })).not.toHaveClass('tv-focus')
    rerender(<EmptyState title="Nada" focused action={{ label: 'Explorar', onSelect: vi.fn() }} />)
    expect(screen.getByRole('button', { name: 'Explorar' })).toHaveClass('tv-focus')
  })

  it('ErrorState: só a ação do índice focado', () => {
    render(
      <ErrorState
        title="Falhou"
        focusedActionIndex={1}
        actions={[
          { label: 'Tentar novamente', onSelect: vi.fn() },
          { label: 'Voltar', onSelect: vi.fn() },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).not.toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
  })

  it('ContentCard e ChannelRow repassam focused ao PosterArt (.poster-box.tv-focus)', () => {
    const card = render(<ContentCard variant="portrait" title="Filme" focused />)
    expect(card.container.querySelector('.poster-box')).toHaveClass('tv-focus')
    card.unmount()

    const row = render(<ChannelRow number="1" name="Canal" focused />)
    expect(row.container.querySelector('.poster-box')).toHaveClass('tv-focus')
  })
})

describe('foco de estado + SELECT — o par completo da constitution (visível E ativável)', () => {
  function ErrorScreen({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
    const [index, setIndex] = useState(0)
    useRemoteNav({
      onDirection: (direction) => {
        if (direction === 'right') setIndex((i) => Math.min(i + 1, 1))
        if (direction === 'left') setIndex((i) => Math.max(i - 1, 0))
      },
      onSelect: () => (index === 0 ? onRetry() : onBack()),
    })
    return (
      <ErrorState
        title="Falhou"
        focusedActionIndex={index}
        actions={[
          { label: 'Tentar novamente', onSelect: onRetry },
          { label: 'Voltar', onSelect: onBack },
        ]}
      />
    )
  }

  it('ErrorState: OK ativa a ação focada, setas movem o foco, OK ativa a outra', () => {
    const onRetry = vi.fn()
    const onBack = vi.fn()
    render(<ErrorScreen onRetry={onRetry} onBack={onBack} />)

    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveClass('tv-focus')
    fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })
    expect(onRetry).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document.body, { key: 'ArrowRight', bubbles: true })
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).not.toHaveClass('tv-focus')
    fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('EmptyState: OK ativa a única ação, que aparece focada', () => {
    const onExplore = vi.fn()
    function EmptyScreen() {
      useRemoteNav({ onSelect: onExplore })
      return <EmptyState title="Nada" focused action={{ label: 'Explorar', onSelect: onExplore }} />
    }
    render(<EmptyScreen />)
    expect(screen.getByRole('button', { name: 'Explorar' })).toHaveClass('tv-focus')
    fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })
    expect(onExplore).toHaveBeenCalledTimes(1)
  })

  it('as ações são <button> nativos, focáveis de verdade (foco DOM: Enter nativo ativa o click)', () => {
    render(
      <ErrorState
        title="Falhou"
        actions={[
          { label: 'Tentar novamente', onSelect: vi.fn() },
          { label: 'Voltar', onSelect: vi.fn() },
        ]}
      />,
    )
    for (const name of ['Tentar novamente', 'Voltar']) {
      const button = screen.getByRole('button', { name })
      expect(button.tagName).toBe('BUTTON')
      button.focus()
      expect(document.activeElement).toBe(button)
    }
  })
})
