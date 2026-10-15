/**
 * Contrato da feature 041 (qualidade, aspecto e preferências do player, sem
 * velocidade) — comportamento observável de `PlayerLayer` com um motor que
 * declara modos de aspecto e anuncia qualidades pelos métodos opcionais novos
 * de `PlayerAdapter`.
 *
 * Fixado por este contrato (`plan.md` D-001 a D-010,
 * `logic/aspecto-qualidade.md`): rótulos dos botões ("Aspecto", "Qualidade",
 * "… — indisponível", "Qualidade — só uma disponível"), nomes dos painéis e
 * grupos ("Aspecto", "Qualidade"), rótulos das opções ("Ajustar",
 * "Preencher", "Original", "Zoom", "Auto", "1080p"…), a ordem da linha
 * (… Áudio Qualidade Aspecto Info), `null` = Auto em `selectQuality`, e as
 * preferências do aparelho lidas/gravadas por `playerPreferences`.
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import * as userStateRepository from '../lib/catalog/userStateRepository'
import { getComingSoon } from '../lib/comingSoon'
import { readPlayerPreferences, writePlayerPreferences } from '../lib/player/playerPreferences'
import type {
  AspectMode,
  PlayerAdapter,
  PlayerAdapterCallbacks,
  PlayerAdapterFactory,
  QualityOption,
  ViewChoice,
} from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

/** Uma sessão do motor falso — uma por `createAdapter()` chamado. */
interface FakeSession {
  callbacks: PlayerAdapterCallbacks
  aspectCalls: AspectMode[]
  qualityCalls: (string | null)[]
  pauseCount: number
  jumpCalls: number[]
  closeCount: number
}

interface FakeOptions {
  /** Modos que o motor aplica. Ausente = motor SEM a API de aspecto. */
  aspectModes?: AspectMode[]
  /** Variantes anunciadas por sessão, na ordem em que as sessões nascem. Ausente = motor SEM a API de qualidade. */
  qualitiesPerSession?: QualityOption[][]
}

let sessions: FakeSession[]

function fakeFactory({ aspectModes, qualitiesPerSession }: FakeOptions): PlayerAdapterFactory {
  sessions = []
  return (callbacks: PlayerAdapterCallbacks): PlayerAdapter => {
    const index = sessions.length
    const s: FakeSession = { callbacks, aspectCalls: [], qualityCalls: [], pauseCount: 0, jumpCalls: [], closeCount: 0 }
    sessions.push(s)
    const adapter: PlayerAdapter = {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {
        s.closeCount += 1
      },
      pause: () => {
        s.pauseCount += 1
      },
      resume: () => {},
      seekTo: (_ms, onSettled) => onSettled(),
      jumpBy: (ms, onSettled) => {
        s.jumpCalls.push(ms)
        onSettled()
      },
    }
    if (aspectModes) {
      adapter.getAspectModes = () => [...aspectModes]
      adapter.setAspectMode = (mode) => {
        s.aspectCalls.push(mode)
        return true
      }
    }
    if (qualitiesPerSession) {
      adapter.getQualities = () => (qualitiesPerSession[index] ?? []).map((q) => ({ ...q }))
      adapter.selectQuality = (id) => {
        s.qualityCalls.push(id)
        return true
      }
    }
    return adapter
  }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function pressTimes(key: string, times: number) {
  for (let i = 0; i < times; i += 1) press(key)
}

function playbackOf(kind: 'channel' | 'movie', itemId = 'item-1') {
  return {
    item_id: itemId,
    kind,
    url: 'http://usuario:senha@exemplo.invalid/x/1.ts',
    container_hint: 'ts',
    source_id: 'src1',
    provider_stream_id: itemId,
    original_name: 'Item',
    series_id: null,
    season_number: null,
    episode_number: null,
  }
}

/** Sessão de índice `index` chegou a tocar (tempo real, `waitFor`). */
async function startPlaying(index = 0) {
  await waitFor(() => expect(sessions[index]).toBeDefined())
  act(() => sessions[index].callbacks.onStateChange('playing'))
}

const ALL_MODES: AspectMode[] = ['fit', 'fill', 'original', 'zoom']

describe('PlayerLayer — aspecto e qualidade (feature 041)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    void userStateRepository
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  // US1/AC1-2; FR-001, FR-002, FR-015: só os modos que o motor aplica, o atual marcado e focado; trocar não mexe na reprodução; RETURN volta ao botão.
  it('filme: "Aspecto" abre o painel só com os modos do motor; escolher aplica e marca sem pausar nem saltar; RETURN volta ao botão', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const createAdapter = fakeFactory({ aspectModes: ['fit', 'fill', 'zoom'] })
    render(<PlayerLayer itemId="item-1" title="Filme" identity={{ title: 'Filme' }} onClose={vi.fn()} createAdapter={createAdapter} />)
    await startPlaying()

    // Linha do VOD: ⏪ ▶⏸ ⏩ Áudio Qualidade Aspecto Info — quatro passos à direita de ▶⏸.
    pressTimes('ArrowRight', 4)
    expect(screen.getByRole('button', { name: 'Aspecto' })).toHaveClass('tv-focus')
    press('Enter')

    const panel = within(screen.getByRole('dialog', { name: 'Aspecto' }))
    const modes = within(panel.getByRole('radiogroup', { name: 'Aspecto' }))
    expect(modes.getAllByRole('radio')).toHaveLength(3)
    expect(modes.queryByRole('radio', { name: 'Original' })).not.toBeInTheDocument()
    expect(modes.getByRole('radio', { name: 'Ajustar' })).toHaveAttribute('aria-checked', 'true')
    expect(modes.getByRole('radio', { name: 'Ajustar' })).toHaveClass('tv-focus')

    press('ArrowDown')
    press('Enter')
    expect(sessions[0].aspectCalls.at(-1)).toBe('fill')
    expect(modes.getByRole('radio', { name: 'Preencher' })).toHaveAttribute('aria-checked', 'true')
    expect(modes.getByRole('radio', { name: 'Ajustar' })).toHaveAttribute('aria-checked', 'false')
    expect(sessions[0].pauseCount).toBe(0)
    expect(sessions[0].jumpCalls).toEqual([])
    expect(sessions).toHaveLength(1)

    press('Escape')
    expect(screen.queryByRole('dialog', { name: 'Aspecto' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aspecto' })).toHaveClass('tv-focus')
  })

  // US1/AC3-5, US3/AC2-4; FR-003, FR-012, SC-003: a escolha no player segue a sequência, nunca grava a preferência; reprodução nova parte da preferência.
  it('canal: escolha de aspecto atravessa o zapping, não altera a preferência (nem é alterada por ela no meio) e uma montagem nova parte da preferência', async () => {
    writePlayerPreferences({ aspect: 'fill' })
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(async (id: string) => playbackOf('channel', id))
    const createAdapter = fakeFactory({ aspectModes: ALL_MODES })
    const onViewChoiceChange = vi.fn<(choice: ViewChoice) => void>()
    const view = render(
      <PlayerLayer itemId="item-1" title="Canal 1" onClose={vi.fn()} createAdapter={createAdapter} onViewChoiceChange={onViewChoiceChange} />,
    )
    await startPlaying(0)
    expect(sessions[0].aspectCalls.at(-1)).toBe('fill')

    // Live: → revela a linha (foco em Guia); Guia Áudio Qualidade Aspecto Info — mais três passos.
    pressTimes('ArrowRight', 4)
    expect(screen.getByRole('button', { name: 'Aspecto' })).toHaveClass('tv-focus')
    press('Enter')
    const modes = within(screen.getByRole('radiogroup', { name: 'Aspecto' }))
    expect(modes.getByRole('radio', { name: 'Preencher' })).toHaveClass('tv-focus')
    pressTimes('ArrowDown', 2)
    press('Enter') // Zoom
    press('Escape')
    expect(sessions[0].aspectCalls.at(-1)).toBe('zoom')
    expect(onViewChoiceChange.mock.calls.at(-1)?.[0].aspect).toBe('zoom')
    expect(readPlayerPreferences().aspect).toBe('fill')

    // Preferência alterada com o player aberto: não muda a sequência em andamento.
    writePlayerPreferences({ aspect: 'original' })
    view.rerender(
      <PlayerLayer itemId="item-2" title="Canal 2" onClose={vi.fn()} createAdapter={createAdapter} onViewChoiceChange={onViewChoiceChange} />,
    )
    await startPlaying(1)
    expect(sessions[1].aspectCalls.at(-1)).toBe('zoom')

    view.unmount()
    render(<PlayerLayer itemId="item-3" title="Outro" onClose={vi.fn()} createAdapter={createAdapter} />)
    await startPlaying(2)
    expect(sessions[2].aspectCalls.at(-1)).toBe('original')
    expect(readPlayerPreferences().aspect).toBe('original')
  })

  // US2/AC1-2, US3/AC2; FR-005, FR-014, SC-001: "Auto" + só as resoluções anunciadas (maior → menor); "Máxima" escolhe a maior ao começar; Auto volta ao adaptativo.
  it('filme: preferência "Máxima" aplica a maior resolução anunciada; o painel lista "Auto" e só o que o stream anuncia; escolher Auto não grava preferência', async () => {
    writePlayerPreferences({ quality: 'max' })
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const createAdapter = fakeFactory({
      qualitiesPerSession: [
        [
          { id: 'v0', height: 720, width: 1280 },
          { id: 'v1', height: 1080, width: 1920 },
          { id: 'v2', height: 480, width: 854 },
        ],
      ],
    })
    render(<PlayerLayer itemId="item-1" title="Filme" identity={{ title: 'Filme' }} onClose={vi.fn()} createAdapter={createAdapter} />)
    await startPlaying()
    expect(sessions[0].qualityCalls).toEqual(['v1'])

    // ⏪ ▶⏸ ⏩ Áudio Qualidade — três passos à direita de ▶⏸.
    pressTimes('ArrowRight', 3)
    expect(screen.getByRole('button', { name: 'Qualidade' })).toHaveClass('tv-focus')
    press('Enter')

    const options = within(within(screen.getByRole('dialog', { name: 'Qualidade' })).getByRole('radiogroup', { name: 'Qualidade' }))
    const radios = options.getAllByRole('radio')
    expect(radios).toHaveLength(4)
    ;['Auto', '1080p', '720p', '480p'].forEach((name, i) => expect(radios[i]).toHaveAccessibleName(name))
    expect(options.getByRole('radio', { name: '1080p' })).toHaveAttribute('aria-checked', 'true')
    expect(options.getByRole('radio', { name: '1080p' })).toHaveClass('tv-focus')

    press('ArrowUp')
    press('Enter')
    expect(sessions[0].qualityCalls.at(-1)).toBeNull()
    expect(options.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true')
    expect(readPlayerPreferences().quality).toBe('max')
    expect(sessions).toHaveLength(1)
  })

  // US2/AC3, US4/AC1-2; FR-006, FR-009, FR-016, SC-004; Constitution: Foco Visível e Sem Becos Sem Saída — soft disabled explica, nunca painel vazio; sem "Velocidade".
  it('stream de qualidade única: "Qualidade" fica soft disabled com o motivo e só explica; a linha não tem "Velocidade" e o mock sumiu do registro', async () => {
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('movie'))
    const createAdapter = fakeFactory({ aspectModes: ALL_MODES, qualitiesPerSession: [[{ id: 'v0', height: 720 }]] })
    render(<PlayerLayer itemId="item-1" title="Filme" identity={{ title: 'Filme' }} onClose={vi.fn()} createAdapter={createAdapter} />)
    await startPlaying()

    expect(screen.queryByRole('button', { name: /Velocidade/ })).not.toBeInTheDocument()
    expect(() => getComingSoon('player-speed')).toThrow()

    pressTimes('ArrowRight', 3)
    const single = screen.getByRole('button', { name: 'Qualidade — só uma disponível' })
    expect(single).toHaveClass('tv-focus')
    expect(single).toHaveAttribute('aria-disabled', 'true')
    press('Enter')
    expect(screen.queryByRole('dialog', { name: 'Qualidade' })).not.toBeInTheDocument()
    expect(screen.getByText('Este stream oferece uma única qualidade.')).toBeInTheDocument()
    expect(sessions[0].qualityCalls).toEqual([])
    expect(sessions[0].pauseCount).toBe(0)

    // O próximo controle continua sendo o Aspecto real.
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Aspecto' })).toHaveClass('tv-focus')
  })
})
