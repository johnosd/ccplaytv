import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlayerControls, playerControlsActions } from './PlayerControls'
import type { PlayerCapabilities } from '../lib/player/PlayerService'

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

  it('com tudo, as três ações na ordem de foco documentada', () => {
    expect(playerControlsActions(FULL).map((a) => a.id)).toEqual(['jumpBack', 'playPause', 'jumpForward'])
  })

  it('só pausa, sem busca: nenhuma ação de salto', () => {
    const caps: PlayerCapabilities = { ...NONE, canPause: true }
    expect(playerControlsActions(caps).map((a) => a.id)).toEqual(['playPause'])
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

  it('play/pause mostra o glifo certo conforme o estado', () => {
    const { rerender } = render(
      <PlayerControls capabilities={FULL} state="playing" progress={null} focusedIndex={1} />,
    )
    expect(screen.getByRole('button', { name: '⏸' })).toBeInTheDocument()

    rerender(<PlayerControls capabilities={FULL} state="paused" progress={null} focusedIndex={1} />)
    expect(screen.getByRole('button', { name: '▶' })).toBeInTheDocument()
  })
})
