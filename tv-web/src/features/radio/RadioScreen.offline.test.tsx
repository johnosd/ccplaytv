import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RadioScreen } from './RadioScreen'
import { radioDb } from '../../lib/radio/radioDb'
import { writeCachedStations } from '../../lib/radio/radioCache'
import { RadioDirectoryError } from '../../lib/radio/radioDirectory'
import { BR_STATIONS, fakeRadioDirectory, fakeRadioEngine, radioTap } from '../../testing/radioFakes'

// Feature 074, US3 (FR-024, SC-007): sem rede ou com o diretório fora do ar.

const offlineError = () => {
  throw new RadioDirectoryError('offline')
}

beforeEach(async () => {
  window.localStorage.clear()
  await radioDb.directoryCache.clear()
  await radioDb.favorites.clear()
})

afterEach(() => {
  cleanup()
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
})

describe('RadioScreen — sem rede (feature 074, US3)', () => {
  it('abre do cache vencido com aviso e "Tentar de novo" focável acima da 1ª estação (SC-007)', async () => {
    await writeCachedStations('country:BR', BR_STATIONS, 0) // vencido: gravado em 1970
    const listStations = vi.fn(async () => offlineError())
    render(<RadioScreen onBack={() => {}} directory={fakeRadioDirectory({ listStations })} createAdapter={fakeRadioEngine().factory} />)

    expect(await screen.findByText('Pode estar desatualizado — o diretório de rádios não respondeu.')).toBeInTheDocument()
    expect(screen.getByText('Rádio Alfa BR')).toBeInTheDocument()

    radioTap('ArrowUp') // da 1ª estação para o aviso
    expect(document.querySelector('.tv-focus')?.textContent).toBe('Tentar de novo')
    radioTap('Enter')
    await waitFor(() => expect(listStations).toHaveBeenCalledTimes(2))
    // OK no aviso devolve o foco à 1ª estação (a lista vencida volta a aparecer, ainda com o aviso).
    await waitFor(() => expect(document.querySelector('.radio-station.tv-focus')?.textContent).toContain('Rádio Alfa BR'))
    radioTap('ArrowUp')
    radioTap('ArrowDown') // do aviso de volta à lista
    expect(document.querySelector('.radio-station.tv-focus')?.textContent).toContain('Rádio Alfa BR')
  })

  it('sem cache e sem países: erro focável, ★ Favoritos e "Tentar carregar países" na trilha', async () => {
    const directory = fakeRadioDirectory({ listCountries: vi.fn(async () => offlineError()), listStations: vi.fn(async () => offlineError()) })
    render(<RadioScreen onBack={() => {}} directory={directory} createAdapter={fakeRadioEngine().factory} />)
    expect(await screen.findByText('Sem conexão com a internet.')).toBeInTheDocument()
    expect(document.querySelector('.tv-focus')?.textContent).toBe('Tentar de novo')

    radioTap('Escape')
    const trail = document.querySelector<HTMLElement>('.radio-column-trail')!
    expect(within(trail).getByText('★ Favoritos')).toBeInTheDocument()
    expect(await within(trail).findByText('Tentar carregar países')).toBeInTheDocument()
    radioTap('ArrowDown') // Brasil (entrada inicial sem lista de países)
    radioTap('ArrowDown') // Tentar carregar países
    radioTap('Enter')
    await waitFor(() => expect(directory.listCountries).toHaveBeenCalledTimes(2))
  })

  it('tocar sem rede mostra "Sem conexão" sem prender o foco (US3-AC3)', async () => {
    const engine = fakeRadioEngine()
    render(<RadioScreen onBack={() => {}} directory={fakeRadioDirectory()} createAdapter={engine.factory} />)
    expect(await screen.findByText('Rádio Alfa BR')).toBeInTheDocument()
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    radioTap('Enter')
    engine.fail()
    expect(within(screen.getByRole('region', { name: 'Tocando agora' })).getByText('Sem conexão')).toBeInTheDocument()
    radioTap('ArrowDown')
    expect(document.querySelector('.radio-station.tv-focus')?.textContent).toContain('Rádio Beta BR')
  })
})
