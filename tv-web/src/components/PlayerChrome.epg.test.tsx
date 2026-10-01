import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PlayerChrome } from './PlayerChrome'
import type { PlayerCapabilities } from '../lib/player/PlayerService'

afterEach(cleanup)

const NONE: PlayerCapabilities = { canPause: false, canSeek: false, reportsPosition: false, reportsDuration: false }

function renderBand(identity: Parameters<typeof PlayerChrome>[0]['identity']) {
  render(
    <PlayerChrome media="live" identity={identity} paused={false} controls={[]} focusedIndex={null} capabilities={NONE} progress={null} />,
  )
}

describe('PlayerChrome — programa atual na faixa do Live (feature 030, FR-026)', () => {
  it('com programa: título e barra de progresso, e a faixa continua sem nenhum <button>', () => {
    renderBand({ title: 'Canal Exemplo', channelNumber: '007', now: { title: 'Jornal da Noite', progress: 0.4 } })

    expect(screen.getByText('Canal Exemplo')).toBeInTheDocument()
    expect(screen.getByText('Jornal da Noite')).toBeInTheDocument()
    const fill = document.querySelector<HTMLElement>('.player-chrome-now-progress-fill')
    expect(fill?.style.transform).toBe('scaleX(0.4)')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('sem programa: a faixa fica como era — nenhum espaço de programa, nenhum texto inventado', () => {
    renderBand({ title: 'Canal Sem Guia', channelNumber: '008' })

    expect(screen.getByText('Canal Sem Guia')).toBeInTheDocument()
    expect(document.querySelector('.player-chrome-now')).toBeNull()
    expect(document.querySelector('.player-chrome-now-progress')).toBeNull()
  })

  it('o nome do canal continua sozinho no seu elemento (contrato de leitura das telas)', () => {
    renderBand({ title: 'Canal Exemplo', now: { title: 'Jornal', progress: 0 } })
    expect(document.querySelector('.player-chrome-name')?.textContent).toBe('Canal Exemplo')
  })
})
