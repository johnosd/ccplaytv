import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlayerControls, playerControlsActions } from './PlayerControls'
import type { PlayerCapabilities, PlayerProgress } from '../lib/player/PlayerService'

const KNOWN_PROGRESS: PlayerProgress = { positionMs: 60_000, durationMs: 600_000 }

afterEach(() => cleanup())

const FULL: PlayerCapabilities = {
  canPause: true,
  canSeek: true,
  reportsPosition: true,
  reportsDuration: true,
}

const NONE: PlayerCapabilities = {
  canPause: false,
  canSeek: false,
  reportsPosition: false,
  reportsDuration: false,
}

describe('playerControlsActions', () => {
  it('sem nenhuma capacidade, nenhuma ação existe', () => {
    expect(playerControlsActions(NONE)).toEqual([])
  })

  it('sem progresso (ou sem duração), a barra não é um alvo — só os três botões', () => {
    expect(playerControlsActions(FULL).map((a) => a.id)).toEqual(['jumpBack', 'playPause', 'jumpForward'])
    expect(playerControlsActions(FULL, { positionMs: 5_000, durationMs: undefined }).map((a) => a.id)).toEqual([
      'jumpBack',
      'playPause',
      'jumpForward',
    ])
  })

  it('com duração conhecida, a barra entra como quarto alvo, por último (achado da TV física)', () => {
    expect(playerControlsActions(FULL, KNOWN_PROGRESS).map((a) => a.id)).toEqual([
      'jumpBack',
      'playPause',
      'jumpForward',
      'seekBar',
    ])
  })

  it('só pausa, sem busca: nenhuma ação de salto nem barra, mesmo com duração conhecida', () => {
    const caps: PlayerCapabilities = { ...NONE, canPause: true, reportsDuration: true }
    expect(playerControlsActions(caps, KNOWN_PROGRESS).map((a) => a.id)).toEqual(['playPause'])
  })
})

describe('PlayerControls', () => {
  it('sem nenhuma capacidade (canal ao vivo), a barra inteira não existe', () => {
    const { container } = render(
      <PlayerControls capabilities={NONE} state="playing" progress={null} focusedIndex={0} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('com duração conhecida, mostra tempo decorrido, barra e total', () => {
    render(
      <PlayerControls
        capabilities={FULL}
        state="playing"
        progress={{ positionMs: 65_000, durationMs: 600_000 }}
        focusedIndex={1}
      />,
    )
    expect(screen.getByText('1:05')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
  })

  it('sem duração conhecida, mostra só o tempo decorrido — sem barra e sem percentual (FR-004)', () => {
    const { container } = render(
      <PlayerControls
        capabilities={FULL}
        state="playing"
        progress={{ positionMs: 30_000, durationMs: undefined }}
        focusedIndex={1}
      />,
    )
    expect(screen.getByText('0:30')).toBeInTheDocument()
    expect(container.querySelector('.player-time-bar')).toBeNull()
    expect(container.textContent).not.toMatch(/%/)
  })

  it('a ação focada recebe a classe de foco', () => {
    render(<PlayerControls capabilities={FULL} state="playing" progress={null} focusedIndex={0} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons[0].className).toContain('tv-focus')
    expect(buttons[1].className).not.toContain('tv-focus')
  })

  it('com o foco na barra (índice 3), ela recebe .tv-focus e nenhum botão recebe', () => {
    const { container } = render(
      <PlayerControls capabilities={FULL} state="playing" progress={KNOWN_PROGRESS} focusedIndex={3} />,
    )
    expect(container.querySelector('.player-time-bar')?.className).toContain('tv-focus')
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).not.toContain('tv-focus')
    }
  })

  it('quando a posição ultrapassa a duração (duração encolheu depois do início), a barra fica grampeada em 100% — nunca mais que isso (spec.md Edge Cases)', () => {
    const { container } = render(
      <PlayerControls
        capabilities={FULL}
        state="playing"
        progress={{ positionMs: 700_000, durationMs: 600_000 }}
        focusedIndex={1}
      />,
    )
    const fill = container.querySelector('.player-time-bar-fill') as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('a barra nunca vira um <button> — é foco de div, não um elemento novo na contagem de botões', () => {
    render(<PlayerControls capabilities={FULL} state="playing" progress={KNOWN_PROGRESS} focusedIndex={1} />)
    expect(screen.getAllByRole('button')).toHaveLength(3) // jumpBack, playPause, jumpForward — barra não conta
  })

  it('play/pause mostra o glifo certo conforme o estado', () => {
    const { rerender } = render(
      <PlayerControls capabilities={FULL} state="playing" progress={null} focusedIndex={1} />,
    )
    expect(screen.getByRole('button', { name: '⏸' })).toBeInTheDocument()

    rerender(<PlayerControls capabilities={FULL} state="paused" progress={null} focusedIndex={1} />)
    expect(screen.getByRole('button', { name: '▶' })).toBeInTheDocument()
  })
})
