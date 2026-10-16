import Dexie from 'dexie'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../../../lib/catalog/db'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from '../../../lib/portal/deviceIdentity'
import { PortalConnection } from '../../../lib/portal/portalConnection'
import { PortalLicenseTab } from './PortalLicenseTab'
import type { SettingsTabHandle, SettingsTabProps } from './settingsTab'

const fixture = vi.hoisted(() => ({ connection: undefined as unknown, commercial: false }))
vi.mock('../../../lib/portal/portalRuntime', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/portal/portalRuntime')>()),
  getPortalConnection: () => fixture.connection,
}))
vi.mock('../../../lib/licensing/licenseRuntime', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/licensing/licenseRuntime')>()),
  get commercialBuild() { return fixture.commercial },
}))

const databases: CatalogDb[] = []
afterEach(async () => {
  cleanup(); fixture.connection = undefined; fixture.commercial = false
  for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) }
})

async function setup(commercial: boolean) {
  fixture.commercial = commercial
  const db = new CatalogDb('test-075-tab-' + crypto.randomUUID()); databases.push(db)
  await persistCredentialIssuance(db, { deviceId: 'device-a', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
    deviceKey: '1732049818', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-1111-2222-3333-4444-5555-6666',
    recoveryCodeVersion: 1 }, 'enroll-a', Date.now())
  await acknowledgeCredentialIssuance(db, 'enroll-a', 1)
  fixture.connection = new PortalConnection(db, { request: vi.fn() as never }, 'https://portal.test', () => 'fixture-duid')
  const handleRef = createRef<SettingsTabHandle>()
  const props: SettingsTabProps = { focused: true, activeSourceId: null, exitToTabs: vi.fn(), goToTopbar: vi.fn(), showToast: vi.fn(), handleRef,
    navigation: { onAddSource: vi.fn(), onEditSource: vi.fn(), onResyncStarted: vi.fn(), onSourceDeleted: vi.fn() } }
  render(<PortalLicenseTab {...props} />)
  await screen.findByRole('img', { name: 'QR de acesso ao portal desta TV' })
  act(() => handleRef.current!.onEnter())
  return { props, handleRef }
}
const focusedName = () => document.querySelector('.tv-focus')?.textContent
// Lê o handle a cada tecla: ele é recriado a cada render com o foco atual.
const press = (handleRef: { current: SettingsTabHandle | null }, direction: 'up' | 'down' | 'left' | 'right') => act(() => handleRef.current!.onDirection(direction))


it('build não comercial: foco inicial em Avançado; ↑ vai à topbar; ← sai para as abas; ↓ não passa do último', async () => {
  const { props, handleRef: handle } = await setup(false)
  expect(focusedName()).toBe('Avançado')
  press(handle, 'up')
  expect(props.goToTopbar).toHaveBeenCalledTimes(1)
  press(handle, 'left')
  expect(props.exitToTabs).toHaveBeenCalledTimes(1)
  press(handle, 'down')
  expect(focusedName()).toBe('Avançado')
})

it('build comercial: ↑/↓ percorrem Comprar, Atualizar e Avançado; ←/→ alternam Comprar e Atualizar; só 3 botões', async () => {
  const { props, handleRef: handle } = await setup(true)
  expect(focusedName()).toBe('Comprar licença')
  press(handle, 'right')
  await waitFor(() => expect(focusedName()).toBe('Atualizar'))
  press(handle, 'left')
  await waitFor(() => expect(focusedName()).toBe('Comprar licença'))
  press(handle, 'down'); press(handle, 'down')
  await waitFor(() => expect(focusedName()).toBe('Avançado'))
  press(handle, 'left')
  expect(props.exitToTabs).toHaveBeenCalledTimes(1)
  press(handle, 'up')
  await waitFor(() => expect(focusedName()).toBe('Atualizar'))
  press(handle, 'up'); press(handle, 'up')
  expect(props.goToTopbar).toHaveBeenCalledTimes(1)
  expect(document.querySelectorAll('.portal-license-panel button').length).toBe(3)
})

it('SELECT em Avançado abre a subtela com o foco no olho; ↑/↓ param nas pontas; ← e Voltar fecham com o foco em Avançado', async () => {
  const { props, handleRef: handle } = await setup(false)
  act(() => handle.current!.onSelect())
  await screen.findByRole('region', { name: 'Avançado' })
  expect(focusedName()).toBe('Mostrar código de recuperação')
  press(handle, 'up')
  expect(focusedName()).toBe('Mostrar código de recuperação')
  expect(props.goToTopbar).not.toHaveBeenCalled()
  for (const name of ['Gerar nova chave e código', 'Recuperar pelo site', 'Desvincular esta TV']) {
    press(handle, 'down')
    await waitFor(() => expect(focusedName()).toBe(name))
  }
  press(handle, 'down')
  expect(focusedName()).toBe('Desvincular esta TV')
  press(handle, 'left')
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Avançado' })).not.toBeInTheDocument())
  expect(focusedName()).toBe('Avançado')
  expect(props.exitToTabs).not.toHaveBeenCalled()
})

it('onBack só consome na subtela (true) e devolve false na tela principal', async () => {
  const { handleRef: handle } = await setup(false)
  expect(handle.current!.onBack!()).toBe(false)
  act(() => handle.current!.onSelect())
  await screen.findByRole('region', { name: 'Avançado' })
  let consumed: boolean | undefined
  act(() => { consumed = handle.current!.onBack!() })
  expect(consumed).toBe(true)
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Avançado' })).not.toBeInTheDocument())
  expect(handle.current!.onBack!()).toBe(false)
})
it('rolagem: a primeira ação volta ao topo do painel e as demais mostram o bloco inteiro do item, não só o botão', async () => {
  const scrollTo = vi.fn()
  const blocos: Element[] = []
  const original = HTMLElement.prototype.scrollIntoView
  HTMLElement.prototype.scrollIntoView = function (this: Element) { blocos.push(this) }
  try {
    const { handleRef: handle } = await setup(false)
    // O painel real rola dentro de `.settings-panel`; aqui a aba já está montada, então o contêiner é simulado.
    const panel = document.querySelector('.portal-license-panel')!.closest('div')!
    panel.classList.add('settings-panel'); panel.scrollTo = scrollTo as never
    act(() => handle.current!.onSelect())
    await screen.findByRole('region', { name: 'Avançado' })
    const advanced = document.querySelector('.portal-advanced')!
    advanced.parentElement!.classList.add('settings-panel'); (advanced.parentElement as HTMLElement).scrollTo = scrollTo as never
    press(handle, 'up')
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0 }))
    blocos.length = 0
    press(handle, 'down')
    await waitFor(() => expect(focusedName()).toBe('Gerar nova chave e código'))
    expect(blocos.at(-1)).toHaveClass('portal-advanced-item')
    expect(blocos.at(-1)!.querySelector('h3')!.textContent).toBe('Gerar nova chave e código')
    press(handle, 'up')
    await waitFor(() => expect(focusedName()).toBe('Mostrar código de recuperação'))
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0 })
  } finally { HTMLElement.prototype.scrollIntoView = original }
})