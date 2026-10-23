import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RadioScreen } from './RadioScreen'
import { CONNECT_TIMEOUT_MS } from './useRadioPlayback'
import { radioDb } from '../../lib/radio/radioDb'
import { RadioDirectoryError } from '../../lib/radio/radioDirectory'
import { I18nProvider } from '../../lib/i18n/I18nProvider'
import { resetAppLanguageForTests, writeAppLanguage } from '../../lib/i18n/appLanguage'
import { BR_STATIONS, fakeRadioDirectory, fakeRadioEngine, radioKey, radioTap } from '../../testing/radioFakes'
import { writeLastRadioCountry } from './radioSessionMemory'

beforeEach(async () => {
  window.localStorage.clear()
  resetAppLanguageForTests()
  await radioDb.directoryCache.clear()
  await radioDb.favorites.clear()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  resetAppLanguageForTests()
})

function nowPlaying() {
  return screen.getByRole('region', { name: 'Tocando agora' })
}

function focusedTrailLabel(): string | null | undefined {
  return document.querySelector('.side-category-nav-item.tv-focus .side-category-nav-label')?.textContent
}

async function renderRadio(directory = fakeRadioDirectory(), engine = fakeRadioEngine()) {
  const view = render(<RadioScreen onBack={() => {}} directory={directory} createAdapter={engine.factory} />)
  expect(await screen.findByText('Rádio Alfa BR')).toBeInTheDocument()
  return { ...view, directory, engine }
}

describe('RadioScreen (feature 074)', () => {
  it('mostra o recorte "N mais ouvidas de total" e o país traduzido na trilha', async () => {
    await renderRadio()
    expect(screen.getByText('3 mais ouvidas de 500')).toBeInTheDocument()
    radioTap('Escape')
    expect(focusedTrailLabel()).toBe('Brasil')
  })

  it('nomes de país seguem o idioma do app (en)', async () => {
    act(() => writeAppLanguage('en'))
    render(
      <I18nProvider>
        <RadioScreen onBack={() => {}} directory={fakeRadioDirectory()} createAdapter={fakeRadioEngine().factory} />
      </I18nProvider>,
    )
    expect(await screen.findByText('Rádio Alfa BR')).toBeInTheDocument()
    expect(await screen.findByText('Brazil')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Now playing' })).toBeInTheDocument()
  })

  it('volta à mesma estação por identidade depois de remontar (FR-003)', async () => {
    const engine = fakeRadioEngine()
    const first = await renderRadio(fakeRadioDirectory(), engine)
    radioTap('ArrowDown') // Beta
    first.unmount()
    await renderRadio(fakeRadioDirectory(), engine)
    radioTap('Enter')
    expect(engine.opened).toEqual(['https://stream.example/b'])
  })

  it('carregando tem "Voltar" focado, que leva à trilha (FR-004)', async () => {
    const directory = fakeRadioDirectory({ listStations: vi.fn(() => new Promise<never>(() => {})) })
    render(<RadioScreen onBack={() => {}} directory={directory} createAdapter={fakeRadioEngine().factory} />)
    expect(await screen.findByText('Carregando estações…')).toBeInTheDocument()
    expect(document.querySelector('.tv-focus')?.textContent).toBe('Voltar')
    radioTap('Enter')
    await waitFor(() => expect(focusedTrailLabel()).toBe('Brasil'))
  })

  it('erro sem cache tem "Tentar de novo" focado, que busca de novo (FR-004/FR-024)', async () => {
    const listStations = vi.fn(async () => {
      throw new RadioDirectoryError('offline')
    })
    render(<RadioScreen onBack={() => {}} directory={fakeRadioDirectory({ listStations })} createAdapter={fakeRadioEngine().factory} />)
    expect(await screen.findByText('Sem conexão com a internet.')).toBeInTheDocument()
    expect(document.querySelector('.tv-focus')?.textContent).toBe('Tentar de novo')
    radioTap('Enter')
    await waitFor(() => expect(listStations).toHaveBeenCalledTimes(2))
  })

  it('o clique só vai ao diretório depois que a estação começa a tocar (FR-019)', async () => {
    const { directory, engine } = await renderRadio()
    radioTap('Enter')
    expect(directory.reportClick).not.toHaveBeenCalled()
    engine.play()
    expect(directory.reportClick).toHaveBeenCalledWith('a')
    expect(within(nowPlaying()).getByText('Ao vivo')).toBeInTheDocument()
  })

  it('OK na estação que toca para; a tecla Stop também para (FR-014/FR-016)', async () => {
    const { engine } = await renderRadio()
    radioTap('Enter')
    engine.play()
    radioTap('Enter')
    expect(within(nowPlaying()).getByText('Nada tocando')).toBeInTheDocument()

    radioTap('Enter')
    engine.play()
    radioKey('keydown', 'MediaStop')
    expect(within(nowPlaying()).getByText('Nada tocando')).toBeInTheDocument()
    expect(engine.closed).toBe(2)
  })

  it('sair da tela fecha a sessão (FR-015)', async () => {
    const { engine, unmount } = await renderRadio()
    radioTap('Enter')
    engine.play()
    unmount()
    expect(engine.closed).toBe(1)
  })

  it('falha mostra "Tentar de novo" e "Próxima estação" sem tocar sozinha; a próxima só com OK (FR-017)', async () => {
    const { engine } = await renderRadio()
    radioTap('Enter')
    engine.fail()
    expect(within(nowPlaying()).getByText('Estação indisponível')).toBeInTheDocument()
    expect(engine.opened).toEqual(['https://stream.example/a'])

    radioTap('ArrowUp') // primeira estação → barra
    expect(document.querySelector('.tv-focus')?.textContent).toBe('Tentar de novo')
    radioTap('ArrowRight')
    expect(document.querySelector('.tv-focus')?.textContent).toBe('Próxima estação')
    radioTap('Enter')
    expect(engine.opened).toEqual(['https://stream.example/a', 'https://stream.example/b'])
  })

  it('15 s sem tocar vira "Estação indisponível" (D-015)', async () => {
    const { engine } = await renderRadio()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    radioTap('Enter')
    act(() => {
      vi.advanceTimersByTime(CONNECT_TIMEOUT_MS)
    })
    expect(within(nowPlaying()).getByText('Estação indisponível')).toBeInTheDocument()
    expect(engine.closed).toBe(1)
  })

  it('→ pagina a lista e nunca toca; nada liga o plano de vídeo nem a proteção de tela (FR-006/FR-018, R-006)', async () => {
    const request = vi.fn()
    ;(window as unknown as { tizen?: unknown }).tizen = { power: { request, release: vi.fn() } }
    try {
      const { engine } = await renderRadio()
      radioTap('ArrowRight')
      expect(document.querySelector('.radio-station.tv-focus')?.textContent).toContain('Rádio Beta BR')
      expect(engine.opened).toHaveLength(0)
      radioTap('Enter')
      engine.play()
      expect(document.documentElement.classList.contains('video-plane-visible')).toBe(false)
      expect(request).not.toHaveBeenCalled()
    } finally {
      delete (window as unknown as { tizen?: unknown }).tizen
    }
  })

  it('estações do mundo mostram o país de cada uma', async () => {
    const world = [BR_STATIONS[0], { ...BR_STATIONS[1], countryCode: 'AR' }]
    const directory = fakeRadioDirectory({
      listStations: vi.fn(async (query) => (query.countryCode === null ? world : BR_STATIONS)),
    })
    await renderRadio(directory)
    radioTap('Escape')
    radioTap('ArrowUp') // Mais ouvidas no mundo
    radioTap('Enter')
    expect(await screen.findByText('2 mais ouvidas do mundo')).toBeInTheDocument()
    expect(within(document.querySelector<HTMLElement>('.radio-list')!).getByText('Argentina')).toBeInTheDocument()
  })
  // T038 (074, FR-011, `logic/radio-tela.md` §3.2): a entrada inicial é validada contra a lista de países.
  describe('entrada inicial inválida', () => {
    it('último país sumiu do diretório: cai no país da TV, depois no Brasil (T038)', async () => {
      writeLastRadioCountry('ZZ')
      const directory = fakeRadioDirectory()
      await renderRadio(directory)
      expect(directory.listStations).toHaveBeenLastCalledWith({ countryCode: 'BR' }, expect.anything())
      radioTap('Escape')
      expect(focusedTrailLabel()).toBe('Brasil')
    })

    it('país da TV fora do diretório e sem país salvo: usa o Brasil (T038)', async () => {
      // jsdom informa `en-US`: o país da TV é US, que o diretório de teste não tem.
      const directory = fakeRadioDirectory()
      await renderRadio(directory)
      expect(directory.listStations).toHaveBeenLastCalledWith({ countryCode: 'BR' }, expect.anything())
    })

    it('nem o Brasil existe: cai em Mundo, sem pedir um país que não existe (T038)', async () => {
      writeLastRadioCountry('ZZ')
      const directory = fakeRadioDirectory({ listCountries: vi.fn(async () => [{ code: 'PT', directoryName: 'Portugal', stationCount: 50 }]) })
      render(<RadioScreen onBack={() => {}} directory={directory} createAdapter={fakeRadioEngine().factory} />)
      await waitFor(() => expect(directory.listStations).toHaveBeenLastCalledWith({ countryCode: null }, expect.anything()))
    })

    it('o país válido salvo não é trocado (T038)', async () => {
      writeLastRadioCountry('BR')
      const directory = fakeRadioDirectory()
      await renderRadio(directory)
      expect(directory.listStations).toHaveBeenCalledTimes(1)
      expect(directory.listStations).toHaveBeenLastCalledWith({ countryCode: 'BR' }, expect.anything())
    })
  })
})
