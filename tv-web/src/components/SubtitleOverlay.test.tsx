import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubtitleOverlay } from './SubtitleOverlay'
import type { PlayerSession, SubtitleCue } from '../lib/player/PlayerService'

/** Só o que o overlay usa da sessão: a assinatura de linhas. */
function fakeSession() {
  let listener: ((cue: SubtitleCue | null) => void) | null = null
  const unsubscribe = vi.fn()
  const session = {
    subscribeSubtitles: (l: (cue: SubtitleCue | null) => void) => {
      listener = l
      return unsubscribe
    },
  } as unknown as PlayerSession
  return {
    session,
    unsubscribe,
    emit: (cue: SubtitleCue | null) => act(() => listener?.(cue)),
  }
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('SubtitleOverlay (feature 029, logic §5)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('sem atraso a linha aparece no mesmo tick e some ao fim da duração', () => {
    const { session, emit } = fakeSession()
    const { queryByText } = render(<SubtitleOverlay session={session} delayMs={0} paused={false} raised={false} />)
    expect(queryByText('Olá')).toBeNull()

    emit({ text: 'Olá', durationMs: 2000 })
    expect(queryByText('Olá')).toBeInTheDocument()
    advance(1999)
    expect(queryByText('Olá')).toBeInTheDocument()
    advance(1)
    expect(queryByText('Olá')).toBeNull()
  })

  it('atraso positivo: a linha só aparece depois do atraso, e some duração depois de aparecer', () => {
    const { session, emit } = fakeSession()
    const { queryByText } = render(<SubtitleOverlay session={session} delayMs={500} paused={false} raised={false} />)

    emit({ text: 'Linha', durationMs: 1000 })
    expect(queryByText('Linha')).toBeNull()
    advance(499)
    expect(queryByText('Linha')).toBeNull()
    advance(1)
    expect(queryByText('Linha')).toBeInTheDocument()
    advance(1000)
    expect(queryByText('Linha')).toBeNull()
  })

  it('com atraso, cues seguidas cada uma no seu tempo — nenhuma se perde', () => {
    const { session, emit } = fakeSession()
    const { queryByText } = render(<SubtitleOverlay session={session} delayMs={500} paused={false} raised={false} />)

    emit({ text: 'Primeira', durationMs: 300 })
    advance(200)
    emit({ text: 'Segunda', durationMs: 300 })
    advance(300) // t=500: a primeira aparece
    expect(queryByText('Primeira')).toBeInTheDocument()
    advance(200) // t=700: a segunda substitui
    expect(queryByText('Segunda')).toBeInTheDocument()
    expect(queryByText('Primeira')).toBeNull()
  })

  it('cue vazia apaga a linha; null (troca/desativação) apaga e cancela o que estava agendado', () => {
    const { session, emit } = fakeSession()
    const { queryByText } = render(<SubtitleOverlay session={session} delayMs={0} paused={false} raised={false} />)

    emit({ text: 'Some com cue vazia', durationMs: 0 })
    expect(queryByText('Some com cue vazia')).toBeInTheDocument()
    emit({ text: '   ', durationMs: 0 })
    expect(queryByText('Some com cue vazia')).toBeNull()

    cleanup()
    const delayed = fakeSession()
    const view = render(<SubtitleOverlay session={delayed.session} delayMs={500} paused={false} raised={false} />)
    delayed.emit({ text: 'Agendada', durationMs: 1000 })
    delayed.emit(null)
    advance(2000)
    expect(view.queryByText('Agendada')).toBeNull()
  })

  it('sem duração conhecida a linha fica até a próxima cue substituí-la', () => {
    const { session, emit } = fakeSession()
    const { queryByText } = render(<SubtitleOverlay session={session} delayMs={0} paused={false} raised={false} />)

    emit({ text: 'Fica', durationMs: 0 })
    advance(60_000)
    expect(queryByText('Fica')).toBeInTheDocument()
    emit({ text: 'Próxima', durationMs: 0 })
    expect(queryByText('Fica')).toBeNull()
    expect(queryByText('Próxima')).toBeInTheDocument()
  })

  it('pausado, a linha que expirou continua na tela e só some ao retomar', () => {
    const { session, emit } = fakeSession()
    const { queryByText, rerender } = render(<SubtitleOverlay session={session} delayMs={0} paused={false} raised={false} />)

    emit({ text: 'Presa na pausa', durationMs: 1000 })
    rerender(<SubtitleOverlay session={session} delayMs={0} paused={true} raised={false} />)
    advance(5000)
    expect(queryByText('Presa na pausa')).toBeInTheDocument()

    rerender(<SubtitleOverlay session={session} delayMs={0} paused={false} raised={false} />)
    expect(queryByText('Presa na pausa')).toBeNull()
  })

  it('texto do stream é texto puro: tags somem e quebra de linha vira <br/>, nunca HTML', () => {
    const { session, emit } = fakeSession()
    const { container } = render(<SubtitleOverlay session={session} delayMs={0} paused={false} raised={false} />)

    emit({ text: '<i>Olá</i>\n<script>alert(1)</script>mundo', durationMs: 0 })
    const box = container.querySelector('.player-subtitle')
    expect(box?.querySelector('br')).not.toBeNull()
    expect(box?.querySelector('i, script')).toBeNull()
    expect(box?.textContent).toBe('Oláalert(1)mundo')
  })

  it('classe "raised" só com o chrome visível; é decorativa para leitor de tela (aria-hidden)', () => {
    const { session, emit } = fakeSession()
    const { container, rerender } = render(<SubtitleOverlay session={session} delayMs={0} paused={false} raised={false} />)
    emit({ text: 'Texto', durationMs: 0 })

    const box = () => container.querySelector('.player-subtitle')
    expect(box()).not.toHaveClass('player-subtitle--raised')
    expect(box()).toHaveAttribute('aria-hidden', 'true')
    rerender(<SubtitleOverlay session={session} delayMs={0} paused={false} raised={true} />)
    expect(box()).toHaveClass('player-subtitle--raised')
  })

  it('desmontar cancela a assinatura e os timers pendentes', () => {
    const { session, emit, unsubscribe } = fakeSession()
    const { unmount } = render(<SubtitleOverlay session={session} delayMs={500} paused={false} raised={false} />)
    emit({ text: 'Pendente', durationMs: 1000 })

    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(() => advance(5000)).not.toThrow()
  })
})
