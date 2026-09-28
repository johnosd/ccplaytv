import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PlayerChrome } from './PlayerChrome'
import { chromeControls } from './chromeControls'
import type { PlayerCapabilities } from '../lib/player/PlayerService'

afterEach(cleanup)

const FULL: PlayerCapabilities = { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true }
const NONE: PlayerCapabilities = { canPause: false, canSeek: false, reportsPosition: false, reportsDuration: false }

describe('PlayerChrome (feature 027)', () => {
  it('Live: a faixa não tem nenhum <button> (ADR-009/Complexity Tracking do plan.md)', () => {
    render(
      <PlayerChrome
        media="live"
        identity={{ title: 'Canal Exemplo', channelNumber: '007' }}
        paused={false}
        controls={[]}
        focusedIndex={null}
        capabilities={NONE}
        progress={null}
      />,
    )
    expect(screen.getByText('AO VIVO')).toBeInTheDocument()
    expect(screen.getByText('007')).toBeInTheDocument()
    expect(screen.getByText('Canal Exemplo')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('Live: sem número de canal, não inventa um traço no lugar', () => {
    render(
      <PlayerChrome
        media="live"
        identity={{ title: 'Canal Sem Número' }}
        paused={false}
        controls={[]}
        focusedIndex={null}
        capabilities={NONE}
        progress={null}
      />,
    )
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('Live: com a linha (controls), o foco cai no índice pedido', () => {
    const controls = chromeControls('live', NONE, false, null)
    render(
      <PlayerChrome
        media="live"
        identity={{ title: 'Canal Exemplo' }}
        paused={false}
        controls={controls}
        focusedIndex={2}
        capabilities={NONE}
        progress={null}
      />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(5)
    expect(buttons[2]).toHaveClass('tv-focus')
    expect(buttons[2]).toHaveAttribute('aria-label', 'Qualidade — em breve')
  })

  it('VOD: título e subtítulo (episódio) aparecem, nenhum é omitido', () => {
    const controls = chromeControls('vod', FULL, false, null)
    render(
      <PlayerChrome
        media="vod"
        identity={{ title: 'Série Exemplo', subtitle: 'T1:E2 • Nome do episódio' }}
        paused={false}
        controls={controls}
        focusedIndex={1}
        capabilities={FULL}
        progress={{ positionMs: 60_000, durationMs: 600_000 }}
      />,
    )
    expect(screen.getByText('Série Exemplo')).toBeInTheDocument()
    expect(screen.getByText('T1:E2 • Nome do episódio')).toBeInTheDocument()
  })

  it('VOD: sem duração conhecida, não mostra timeline nem percentual estimado (FR-008)', () => {
    const controls = chromeControls('vod', { ...FULL, reportsDuration: false }, false, null)
    const { container } = render(
      <PlayerChrome
        media="vod"
        identity={{ title: 'Filme' }}
        paused={false}
        controls={controls}
        focusedIndex={1}
        capabilities={{ ...FULL, reportsDuration: false }}
        progress={{ positionMs: 60_000 }}
      />,
    )
    expect(screen.getByText('1:00')).toBeInTheDocument() // tempo decorrido continua
    expect(container.querySelector('.player-chrome-time-bar')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/%/)
  })

  // Migrado de PlayerControls.test.tsx (D-011 do plan.md — componente removido nesta feature).
  it('VOD: com duração conhecida, mostra tempo decorrido, barra e total', () => {
    const controls = chromeControls('vod', FULL, false, null)
    render(
      <PlayerChrome
        media="vod"
        identity={{ title: 'Filme' }}
        paused={false}
        controls={controls}
        focusedIndex={1}
        capabilities={FULL}
        progress={{ positionMs: 65_000, durationMs: 600_000 }}
      />,
    )
    expect(screen.getByText('1:05')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
  })

  it('VOD: posição além da duração (encolheu depois do início) grampeia a barra em 100%, nunca mais (spec Edge Cases)', () => {
    const controls = chromeControls('vod', FULL, false, null)
    const { container } = render(
      <PlayerChrome
        media="vod"
        identity={{ title: 'Filme' }}
        paused={false}
        controls={controls}
        focusedIndex={1}
        capabilities={FULL}
        progress={{ positionMs: 700_000, durationMs: 600_000 }}
      />,
    )
    const fill = container.querySelector('.player-chrome-time-bar-fill') as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('VOD: sem canSeek, a timeline não existe mesmo com reportsDuration verdadeiro (US1/AC5)', () => {
    const caps: PlayerCapabilities = { canPause: true, canSeek: false, reportsPosition: true, reportsDuration: true }
    const controls = chromeControls('vod', caps, false, null)
    const { container } = render(
      <PlayerChrome
        media="vod"
        identity={{ title: 'Filme' }}
        paused={false}
        controls={controls}
        focusedIndex={0}
        capabilities={caps}
        progress={{ positionMs: 60_000, durationMs: 600_000 }}
      />,
    )
    expect(container.querySelector('.player-chrome-time-bar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /10 segundos/ })).not.toBeInTheDocument()
  })

  it('play/pause mostra o rótulo certo conforme `paused`', () => {
    const controls = chromeControls('vod', FULL, false, null)
    const { rerender } = render(
      <PlayerChrome
        media="vod"
        identity={{ title: 'Filme' }}
        paused={false}
        controls={controls}
        focusedIndex={1}
        capabilities={FULL}
        progress={null}
      />,
    )
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()

    rerender(
      <PlayerChrome
        media="vod"
        identity={{ title: 'Filme' }}
        paused
        controls={chromeControls('vod', FULL, true, null)}
        focusedIndex={1}
        capabilities={FULL}
        progress={null}
      />,
    )
    expect(screen.getByRole('button', { name: 'Reproduzir' })).toBeInTheDocument()
  })

  it('todo controle real/soon/limit tem rótulo acessível (nome único); soon/limit ganham aria-disabled', () => {
    const controls = chromeControls('vod', FULL, false, { hasPrevious: false, hasNext: true })
    render(
      <PlayerChrome
        media="vod"
        identity={{ title: 'Episódio' }}
        paused={false}
        controls={controls}
        focusedIndex={0}
        capabilities={FULL}
        progress={null}
      />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(controls.length)
    for (const button of buttons) {
      expect(button.getAttribute('aria-label')).toBeTruthy()
    }
    const previous = screen.getByRole('button', { name: /Episódio anterior/ })
    expect(previous).toHaveAttribute('aria-disabled', 'true')
    expect(previous).toHaveClass('is-soft-disabled')
    const playPause = screen.getByRole('button', { name: 'Pausar' })
    expect(playPause).not.toHaveAttribute('aria-disabled')
  })

  it('nenhum mock renderiza valor de qualidade/resolução/velocidade inventado (FR-021)', () => {
    const controls = chromeControls('vod', FULL, false, null)
    render(
      <PlayerChrome
        media="vod"
        identity={{ title: 'Filme' }}
        paused={false}
        controls={controls}
        focusedIndex={1}
        capabilities={FULL}
        progress={null}
      />,
    )
    // Nenhum texto do tipo "4K", "1080p", "1.0x" aparece em lugar nenhum.
    expect(screen.queryByText(/4K|1080p|720p|\d(\.\d)?x/i)).not.toBeInTheDocument()
  })
})
