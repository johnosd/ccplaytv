/**
 * Feature 090 — comportamento do `PlayerLayer` com legenda externa além do contrato travado: resposta atrasada
 * descartada (FR-010), arquivo ilegível, Live sem a opção (FR-001), nenhuma leitura antes do `playing` (D-012),
 * ajuste de ±10 s (FR-008) e os casos de uso do usuário — desativar, reativar e alternar idiomas sem rede (US1/AC8–AC9).
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import * as catalogApi from '../features/catalog/catalogApi'
import type { PlayerAdapter, PlayerAdapterCallbacks, PlayerAdapterFactory } from '../lib/player/PlayerService'
import { clearSequenceMemory, rememberSequenceLanguage } from '../lib/subtitles/sequenceMemory'
import type {
  ExternalSubtitlesDeps,
  StoredExternalSubtitle,
  SubtitleLanguage,
  SubtitleSearchRequest,
  SubtitleSearchResponse,
  SubtitleTarget,
} from '../lib/subtitles/types'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  return { ...actual, fetchPlayback: vi.fn() }
})

vi.mock('../lib/catalog/userStateRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/catalog/userStateRepository')>()
  return { ...actual, updateProgress: vi.fn(), clearProgress: vi.fn(), markCompleted: vi.fn() }
})

interface FakeSession {
  callbacks: PlayerAdapterCallbacks
  pauseCount: number
}

let sessions: FakeSession[]

function fakeFactory(): PlayerAdapterFactory {
  sessions = []
  return (callbacks) => {
    const s: FakeSession = { callbacks, pauseCount: 0 }
    sessions.push(s)
    const adapter: PlayerAdapter = {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {},
      pause: () => {
        s.pauseCount += 1
      },
      resume: () => {},
      seekTo: (_ms, onSettled) => onSettled(),
      jumpBy: (_ms, onSettled) => onSettled(),
    }
    return adapter
  }
}

const TARGET: SubtitleTarget = { stableId: 'src1|movie|id:item-1', sourceId: 'src1', kind: 'movie', title: 'Filme', tmdbId: 1 }
const TEXT: Record<string, string> = {
  'os:1': '1\n00:00:01,000 --> 00:00:03,000\nFala em português\n',
  'os:2': '1\n00:00:01,000 --> 00:00:03,000\nLine in English\n',
}

function deps(overrides: Partial<ExternalSubtitlesDeps> = {}) {
  const search = vi.fn(async (request: SubtitleSearchRequest, _signal: AbortSignal): Promise<SubtitleSearchResponse> => ({
    results: [
      {
        id: request.language === 'en' ? 'os:2' : 'os:1',
        provider: 'opensubtitles',
        language: request.language,
        release: `Versao.${request.language}`,
        downloads: 1,
        hearingImpaired: false,
      },
    ],
    unavailable: [],
  }))
  const download = vi.fn(async (resultId: string, _language: SubtitleLanguage, _signal: AbortSignal) => TEXT[resultId] ?? 'lixo')
  const update = vi.fn(async (_stableId: string, _patch: object, _language?: SubtitleLanguage) => {})
  const resolveTarget = vi.fn(async () => TARGET as SubtitleTarget | null)
  const value = {
    service: { search, download },
    store: {
      load: vi.fn(async (): Promise<StoredExternalSubtitle | null> => null),
      save: vi.fn(async () => true),
      update,
    },
    resolveTarget,
    ...overrides,
  }
  return { value: value as ExternalSubtitlesDeps, search, download, update, resolveTarget }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function pressTimes(key: string, times: number) {
  for (let i = 0; i < times; i += 1) press(key)
}

function playbackOf(kind: 'movie' | 'channel' = 'movie') {
  return {
    item_id: 'item-1', kind, url: 'http://u:s@x.invalid/1.mp4', container_hint: 'mp4', source_id: 'src1',
    provider_stream_id: 'item-1', original_name: 'Filme', series_id: null, season_number: null, episode_number: null,
  }
}

async function startPlaying() {
  await waitFor(() => expect(sessions[0]).toBeDefined())
  act(() => sessions[0].callbacks.onStateChange('playing'))
}

function mount(value: ExternalSubtitlesDeps) {
  render(<PlayerLayer itemId="item-1" title="Filme" identity={{ title: 'Filme' }} onClose={vi.fn()} createAdapter={fakeFactory()} externalSubtitles={value} />)
}

async function openTracks() {
  pressTimes('ArrowRight', 2)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Áudio e legendas' })).toHaveClass('tv-focus'))
  press('Enter')
  return screen.getByRole('dialog', { name: 'Áudio e legendas' })
}

/** Abre o painel, busca e aplica a primeira legenda (pt-BR); a mídia está em 1,5 s. */
async function applyFirst() {
  await openTracks()
  pressTimes('ArrowDown', 2)
  press('Enter')
  const dialog = await screen.findByRole('dialog', { name: 'Buscar legenda online' })
  await within(dialog).findByRole('button', { name: /^Versao\.pt-BR/ })
  press('Enter')
  await screen.findByRole('radio', { name: 'Externa — Português (Brasil)', checked: true })
  act(() => sessions[0].callbacks.onProgress?.({ positionMs: 1500, durationMs: 60_000 }))
  expect(await screen.findByText('Fala em português')).toBeInTheDocument()
}

describe('PlayerLayer — legendas externas, comportamento (feature 090)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf())
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('não lê o alvo antes de tocar; canal sem alvo não ganha a opção (soft disabled como na 029)', async () => {
    const fake = deps({ resolveTarget: vi.fn(async () => null) })
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf('channel'))
    render(<PlayerLayer itemId="item-1" title="Canal" identity={{ title: 'Canal', channelNumber: '1' }} onClose={vi.fn()} createAdapter={fakeFactory()} externalSubtitles={fake.value} />)
    await waitFor(() => expect(sessions[0]).toBeDefined())
    expect(fake.value.resolveTarget).not.toHaveBeenCalled()
    act(() => sessions[0].callbacks.onStateChange('playing'))
    await waitFor(() => expect(fake.value.resolveTarget).toHaveBeenCalledTimes(1))
    pressTimes('ArrowRight', 2)
    expect(screen.getByRole('button', { name: 'Áudio e legendas — indisponível' })).toBeInTheDocument()
    expect(fake.search).not.toHaveBeenCalled()
  })

  it('resposta atrasada de uma busca anterior é descartada (FR-010)', async () => {
    const fake = deps()
    let releaseFirst: (value: SubtitleSearchResponse) => void = () => {}
    fake.search.mockImplementationOnce(() => new Promise((resolve) => {
      releaseFirst = resolve
    }))
    mount(fake.value)
    await startPlaying()
    await openTracks()
    pressTimes('ArrowDown', 2)
    press('Enter') // busca pt-BR, pendurada
    await screen.findByRole('dialog', { name: 'Buscar legenda online' })
    press('ArrowUp') // linha de idiomas
    press('ArrowRight') // Inglês
    press('Enter') // busca en, responde já
    const dialog = screen.getByRole('dialog', { name: 'Buscar legenda online' })
    await within(dialog).findByRole('button', { name: /^Versao\.en/ })
    await act(async () => releaseFirst({ results: [{ id: 'os:9', provider: 'opensubtitles', language: 'pt-BR', release: 'Atrasada', hearingImpaired: false }], unavailable: [] }))
    expect(within(dialog).queryByRole('button', { name: /^Atrasada/ })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^Versao\.en/ })).toBeInTheDocument()
  })

  it('arquivo ilegível: erro com "Escolher outra", que volta à lista sem buscar de novo', async () => {
    const fake = deps()
    fake.download.mockResolvedValueOnce('isto não é legenda')
    mount(fake.value)
    await startPlaying()
    await openTracks()
    pressTimes('ArrowDown', 2)
    press('Enter')
    const dialog = await screen.findByRole('dialog', { name: 'Buscar legenda online' })
    await within(dialog).findByRole('button', { name: /^Versao\.pt-BR/ })
    press('Enter')
    const choose = await within(dialog).findByRole('button', { name: 'Escolher outra' })
    await waitFor(() => expect(choose).toHaveClass('tv-focus'))
    expect(within(dialog).getByText('Esta versão não pôde ser lida — escolha outra.')).toBeInTheDocument()
    press('Enter')
    expect(await within(dialog).findByRole('button', { name: /^Versao\.pt-BR/ })).toBeInTheDocument()
    expect(fake.search).toHaveBeenCalledTimes(1)
  })

  it('desativar e reativar sem rede; ajuste ±0,5 s muda a fala na hora e grava uma vez', async () => {
    const fake = deps()
    mount(fake.value)
    await startPlaying()
    await applyFirst()

    press('ArrowUp') // Desativadas
    press('Enter')
    await waitFor(() => expect(screen.queryByText('Fala em português')).not.toBeInTheDocument())
    expect(screen.getByRole('radio', { name: 'Externa — Português (Brasil)' })).toHaveAttribute('aria-checked', 'false')

    press('ArrowDown') // Externa — Português (Brasil)
    press('Enter')
    expect(await screen.findByText('Fala em português')).toBeInTheDocument()
    expect(fake.download).toHaveBeenCalledTimes(1)
    expect(fake.search).toHaveBeenCalledTimes(1)

    pressTimes('ArrowDown', 2) // Buscar → Sincronização
    const slider = screen.getByRole('slider', { name: 'Sincronização da legenda' })
    expect(slider).toHaveClass('tv-focus')
    pressTimes('ArrowRight', 5)
    expect(screen.getByRole('slider', { name: 'Sincronização da legenda' })).toHaveAttribute('aria-valuenow', '2500')
    // +2,5 s: em 1,5 s da mídia a fala (1–3 s) ainda não começou.
    await waitFor(() => expect(screen.queryByText('Fala em português')).not.toBeInTheDocument())
    expect(sessions[0].pauseCount).toBe(0)
    await waitFor(() => expect(fake.update).toHaveBeenCalledWith(TARGET.stableId, { delayMs: 2500 }, 'pt-BR'), { timeout: 2000 })
    expect(fake.update.mock.calls.filter((call) => 'delayMs' in call[1])).toHaveLength(1)
    press('Enter')
    expect(screen.getByRole('slider', { name: 'Sincronização da legenda' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('alterna português ↔ inglês: o segundo idioma baixa uma vez, voltar ao português não usa rede', async () => {
    const fake = deps()
    mount(fake.value)
    await startPlaying()
    await applyFirst()

    press('ArrowDown') // Buscar legenda online
    press('Enter')
    const dialog = await screen.findByRole('dialog', { name: 'Buscar legenda online' })
    await within(dialog).findByRole('button', { name: /^Versao\.pt-BR/ })
    press('ArrowUp')
    press('ArrowRight')
    press('Enter')
    await within(dialog).findByRole('button', { name: /^Versao\.en/ })
    press('Enter')
    await screen.findByRole('radio', { name: 'Externa — Inglês', checked: true })
    expect(screen.getByRole('radio', { name: 'Externa — Português (Brasil)' })).toHaveAttribute('aria-checked', 'false')
    expect(await screen.findByText('Line in English')).toBeInTheDocument()

    press('ArrowUp') // Externa — Português (Brasil)
    press('Enter')
    expect(await screen.findByText('Fala em português')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Externa — Português (Brasil)' })).toHaveAttribute('aria-checked', 'true')
    expect(fake.download).toHaveBeenCalledTimes(2)
    expect(fake.update).toHaveBeenCalledWith(TARGET.stableId, { active: true }, 'pt-BR')
  })
})

const STORED_PT: StoredExternalSubtitle = {
  stableId: TARGET.stableId,
  sourceId: 'src1',
  language: 'pt-BR',
  resultId: 'os:1',
  release: 'Versao.pt-BR',
  delayMs: 2000,
  active: true,
  text: TEXT['os:1'],
}

/** Memória do aparelho que só conhece a obra de `TARGET` (chave `stableId`, como a real). */
function storedDeps(rows: StoredExternalSubtitle[], overrides: Partial<ExternalSubtitlesDeps> = {}) {
  const list = vi.fn(async (stableId: string) => rows.filter((row) => row.stableId === stableId))
  const fake = deps({ ...overrides })
  const store = { ...fake.value.store, list }
  return { ...fake, value: { ...fake.value, store } as ExternalSubtitlesDeps, list, save: store.save }
}

describe('PlayerLayer — retomar e próximo episódio (feature 090, US2)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf())
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    clearSequenceMemory()
  })

  it('retomar reaplica a legenda guardada com o atraso guardado, sem chamar o serviço nem gravar (US2/AC1)', async () => {
    const fake = storedDeps([STORED_PT])
    mount(fake.value)
    await startPlaying()
    await waitFor(() => expect(fake.list).toHaveBeenCalledWith(TARGET.stableId))
    // Fala em 1–3 s + atraso de +2 s: aparece só a partir de 3 s.
    act(() => sessions[0].callbacks.onProgress?.({ positionMs: 1500, durationMs: 60_000 }))
    expect(screen.queryByText('Fala em português')).not.toBeInTheDocument()
    act(() => sessions[0].callbacks.onProgress?.({ positionMs: 3500, durationMs: 60_000 }))
    expect(await screen.findByText('Fala em português')).toBeInTheDocument()
    expect(fake.search).not.toHaveBeenCalled()
    expect(fake.download).not.toHaveBeenCalled()
    expect(fake.save).not.toHaveBeenCalled()
  })

  it('a mesma obra em outra lista não reaplica a legenda (a chave é o título dentro da lista)', async () => {
    const other: SubtitleTarget = { ...TARGET, stableId: 'src2|movie|id:item-1', sourceId: 'src2' }
    const fake = storedDeps([STORED_PT], { resolveTarget: vi.fn(async () => other as SubtitleTarget | null) })
    mount(fake.value)
    await startPlaying()
    await waitFor(() => expect(fake.list).toHaveBeenCalledWith(other.stableId))
    act(() => sessions[0].callbacks.onProgress?.({ positionMs: 3500, durationMs: 60_000 }))
    await openTracks()
    expect(screen.getByRole('button', { name: 'Buscar legenda online' })).toBeInTheDocument()
    expect(screen.queryByText('Fala em português')).not.toBeInTheDocument()
  })

  it('registro despejado ou ilegível: abre sem legenda e sem erro', async () => {
    const evicted = storedDeps([])
    mount(evicted.value)
    await startPlaying()
    await waitFor(() => expect(evicted.list).toHaveBeenCalled())
    await openTracks()
    expect(screen.getByRole('button', { name: 'Buscar legenda online' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    cleanup()

    const broken = storedDeps([{ ...STORED_PT, text: 'isto não é legenda' }])
    mount(broken.value)
    await startPlaying()
    await waitFor(() => expect(broken.list).toHaveBeenCalled())
    act(() => sessions[0].callbacks.onProgress?.({ positionMs: 3500, durationMs: 60_000 }))
    expect(screen.queryByText('Fala em português')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(broken.search).not.toHaveBeenCalled()
  })

  it('episódio seguinte mostra "Buscar legenda (idioma)" sem chamar nada até a pessoa confirmar (FR-003)', async () => {
    rememberSequenceLanguage('src1', 'ser1', 'en')
    const episode: SubtitleTarget = {
      stableId: 'src1|episode|ser1|s1e2', sourceId: 'src1', kind: 'episode', title: 'Série', seriesId: 'ser1', season: 1, episode: 2,
    }
    const fake = storedDeps([], { resolveTarget: vi.fn(async () => episode as SubtitleTarget | null) })
    mount(fake.value)
    await startPlaying()
    await waitFor(() => expect(fake.list).toHaveBeenCalledWith(episode.stableId))
    await openTracks()
    pressTimes('ArrowDown', 2)
    expect(screen.getByRole('button', { name: 'Buscar legenda (Inglês)' })).toHaveClass('tv-focus')
    expect(fake.search).not.toHaveBeenCalled()
    press('Enter')
    const dialog = await screen.findByRole('dialog', { name: 'Buscar legenda online' })
    await within(dialog).findByRole('button', { name: /^Versao\.en/ })
    expect(fake.search).toHaveBeenCalledTimes(1)
    expect(fake.search.mock.calls[0][0].language).toBe('en')
  })
})

describe('PlayerLayer — chave pessoal recusada no diálogo (feature 090, US3)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue(playbackOf())
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('avisa a chave daquele fornecedor, oferece "Usar o padrão do ccplayTv" e só troca quando a pessoa confirma', async () => {
    const useDefault = vi.fn(async (_providers: readonly string[]) => {})
    const fake = deps({ useDefault: useDefault as ExternalSubtitlesDeps['useDefault'] })
    fake.search.mockImplementationOnce(async (request) => ({
      results: [{ id: 'os:1', provider: 'opensubtitles', language: request.language, release: 'Versao.pt-BR', hearingImpaired: false }],
      unavailable: [],
      keyIssues: { subdl: 'rejected' },
    }))
    mount(fake.value)
    await startPlaying()
    await openTracks()
    pressTimes('ArrowDown', 2)
    press('Enter')
    const dialog = await screen.findByRole('dialog', { name: 'Buscar legenda online' })
    expect(await within(dialog).findByText('Sua chave do SubDL foi recusada.')).toBeInTheDocument()
    // Nada trocou sozinho: a chave pessoal só sai por uma ação explícita.
    expect(useDefault).not.toHaveBeenCalled()

    press('ArrowDown') // Versao.pt-BR
    press('ArrowDown') // Usar o padrão do ccplayTv (último item)
    const action = within(dialog).getByRole('button', { name: 'Usar o padrão do ccplayTv' })
    expect(action).toHaveClass('tv-focus')
    press('Enter')
    await waitFor(() => expect(useDefault).toHaveBeenCalledWith(['subdl']))
    await waitFor(() => expect(fake.search).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(within(dialog).queryByText('Sua chave do SubDL foi recusada.')).not.toBeInTheDocument())
    expect(within(dialog).queryByRole('button', { name: 'Usar o padrão do ccplayTv' })).not.toBeInTheDocument()
  })

  it('sem padrão a oferecer (build base), o aviso aparece mas a ação não', async () => {
    const fake = deps()
    fake.search.mockImplementationOnce(async (request) => ({
      results: [{ id: 'os:1', provider: 'opensubtitles', language: request.language, release: 'Versao.pt-BR', hearingImpaired: false }],
      unavailable: [],
      keyIssues: { opensubtitles: 'rate_limited' },
    }))
    mount(fake.value)
    await startPlaying()
    await openTracks()
    pressTimes('ArrowDown', 2)
    press('Enter')
    const dialog = await screen.findByRole('dialog', { name: 'Buscar legenda online' })
    expect(await within(dialog).findByText('Sua chave do OpenSubtitles atingiu o limite de hoje.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Usar o padrão do ccplayTv' })).not.toBeInTheDocument()
  })
})

