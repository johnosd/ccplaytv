import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RadioScreen } from './RadioScreen'
import { radioDb } from '../../lib/radio/radioDb'
import { RadioDirectoryError } from '../../lib/radio/radioDirectory'
import { listRadioFavorites, toggleRadioFavorite } from '../../lib/radio/radioFavorites'
import { BR_STATIONS, fakeRadioDirectory, fakeRadioEngine, radioKey, radioTap } from '../../testing/radioFakes'

// Feature 074, US2 (FR-020..FR-023): favoritos de estação — fora dos contratos travados.

beforeEach(async () => {
  window.localStorage.clear()
  await radioDb.directoryCache.clear()
  await radioDb.favorites.clear()
})

afterEach(cleanup)

async function renderRadio(directory = fakeRadioDirectory(), engine = fakeRadioEngine()) {
  render(<RadioScreen onBack={() => {}} directory={directory} createAdapter={engine.factory} />)
  expect(await screen.findByText('Rádio Alfa BR')).toBeInTheDocument()
  return { directory, engine }
}

/** Trilha: Escape vai ao país atual (índice 2); duas setas para cima = ★ Favoritos. */
async function openFavorites() {
  radioTap('Escape')
  radioTap('ArrowUp')
  radioTap('ArrowUp')
  radioTap('Enter')
}

describe('RadioScreen — favoritos (feature 074, US2)', () => {
  it('segurar OK favorita sem tocar, com estrela no card', async () => {
    const { engine } = await renderRadio()
    radioKey('keydown', 'Enter')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900)) // além do limiar real de segurar OK
    })
    radioKey('keyup', 'Enter')
    await waitFor(async () => expect((await listRadioFavorites()).map((item) => item.id)).toEqual(['radio-browser:a']))
    expect(engine.opened).toHaveLength(0)
    await waitFor(() => expect(document.querySelector('.radio-station.tv-focus .fav-star')).not.toBeNull())
  })

  it('★ Favoritos vazio é um estado focável que explica o gesto', async () => {
    await renderRadio()
    await openFavorites()
    expect(await screen.findByText('Nenhuma estação favorita ainda.')).toBeInTheDocument()
    expect(document.querySelector('.tv-focus')?.textContent).toBe('Voltar')
  })

  it('estação que saiu do diretório fica indisponível, e dá para desfavoritá-la', async () => {
    await toggleRadioFavorite(BR_STATIONS[0])
    const { engine } = await renderRadio(fakeRadioDirectory({ stationsByUuid: vi.fn(async () => []) }))
    await openFavorites()
    await waitFor(() => expect(document.querySelector('.radio-list')).not.toBeNull())
    radioTap('Enter')
    const bar = screen.getByRole('region', { name: 'Tocando agora' })
    await waitFor(() => expect(within(bar).getByText('Estação indisponível')).toBeInTheDocument())
    expect(engine.opened).toHaveLength(0)

    radioKey('keydown', 'ColorF2Yellow')
    await waitFor(async () => expect(await listRadioFavorites()).toEqual([]))
    expect(await screen.findByText('Nenhuma estação favorita ainda.')).toBeInTheDocument()
  })

  it('com o diretório fora, o favorito toca pela última URL conhecida', async () => {
    await toggleRadioFavorite(BR_STATIONS[1])
    const stationsByUuid = vi.fn(async () => {
      throw new RadioDirectoryError('offline')
    })
    const { engine } = await renderRadio(fakeRadioDirectory({ stationsByUuid }))
    await openFavorites()
    await waitFor(() => expect(document.querySelector('.radio-list')).not.toBeNull())
    radioTap('Enter')
    await waitFor(() => expect(engine.opened).toEqual(['https://stream.example/b']))
  })

  it('a lista mostra o país de cada favorito e não depende de lista IPTV', async () => {
    await toggleRadioFavorite({ ...BR_STATIONS[2], countryCode: 'AR' })
    await renderRadio()
    await openFavorites()
    const list = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('.radio-list')
      expect(element).not.toBeNull()
      return element!
    })
    expect(within(list).getByText('Rádio Gama BR')).toBeInTheDocument()
    expect(within(list).getByText('Argentina')).toBeInTheDocument()
    expect(screen.getByText('1 favorita')).toBeInTheDocument()
  })
})
