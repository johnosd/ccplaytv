// Contrato da feature 076 (Portal & licença simplificada, Avançado). Travado pelo sdd-plan: o sdd-execute só faz passar.
import Dexie from 'dexie'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../../../lib/catalog/db'
import type { LicenseSnapshot } from '../../../lib/licensing/licenseMonitor'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from '../../../lib/portal/deviceIdentity'
import { PortalConnection } from '../../../lib/portal/portalConnection'
import { PortalLicenseTab } from './PortalLicenseTab'
import type { SettingsTabHandle, SettingsTabProps } from './settingsTab'

const fixture = vi.hoisted(() => ({
  connection: undefined as unknown,
  commercial: false,
  snapshot: { decision: { allowed: false, reason: 'not_activated' } } as unknown,
  listeners: new Set<() => void>(),
}))

vi.mock('../../../lib/portal/portalRuntime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/portal/portalRuntime')>()),
  getPortalConnection: () => fixture.connection,
}))

vi.mock('../../../lib/licensing/licenseRuntime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/licensing/licenseRuntime')>()),
  get commercialBuild() { return fixture.commercial },
  licenseMonitor: {
    subscribe: (listener: () => void) => { fixture.listeners.add(listener); return () => { fixture.listeners.delete(listener) } },
    getSnapshot: () => fixture.snapshot,
  },
}))

const KEY = '1732049818'
const CODE = '0000-1111-2222-3333-4444-5555-6666'
const databases: CatalogDb[] = []

afterEach(async () => {
  cleanup()
  fixture.connection = undefined; fixture.commercial = false; fixture.listeners.clear()
  fixture.snapshot = { decision: { allowed: false, reason: 'not_activated' } }
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) }
})

async function pairedConnection() {
  const db = new CatalogDb('test-076-' + crypto.randomUUID()); databases.push(db)
  await persistCredentialIssuance(db, { deviceId: 'device-a', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
    deviceKey: KEY, authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: CODE, recoveryCodeVersion: 1 }, 'enroll-a', Date.now())
  await acknowledgeCredentialIssuance(db, 'enroll-a', 1)
  const request = vi.fn()
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  fixture.connection = connection
  return { db, connection, request }
}

async function renderTab() {
  const handleRef = createRef<SettingsTabHandle>()
  const props: SettingsTabProps = { focused: true, activeSourceId: null, exitToTabs: vi.fn(), goToTopbar: vi.fn(), showToast: vi.fn(), handleRef,
    navigation: { onAddSource: vi.fn(), onEditSource: vi.fn(), onResyncStarted: vi.fn(), onSourceDeleted: vi.fn() } }
  render(<PortalLicenseTab {...props} />)
  await screen.findByRole('img', { name: 'QR de acesso ao portal desta TV' })
  return handleRef
}

const focused = () => document.querySelector('.tv-focus')
const buttonLabels = (root: HTMLElement = document.body) => within(root).getAllByRole('button').map(button => button.textContent?.trim())

it('US1-AC1/AC2/AC4/FR-001/FR-002/SC-001: build comercial — só Comprar, Atualizar e Avançado; sem código nem olho; lembrete de guardar o código', async () => {
  const { request } = await pairedConnection()
  fixture.commercial = true
  fixture.snapshot = { decision: { allowed: true }, state: 'trial', expiresAt: Date.now() + 86400000 } as LicenseSnapshot
  const handle = await renderTab()
  expect(buttonLabels()).toEqual(['Comprar licença', 'Atualizar', 'Avançado'])
  expect(screen.getByText('Guarde seu código de recuperação em Avançado.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Mais opções' })).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain(CODE)
  expect(document.body.textContent).not.toContain('••••')
  expect(screen.getByText('173 204 9818')).toBeInTheDocument()
  act(() => handle.current!.onEnter())
  await waitFor(() => expect(focused()).toHaveAccessibleName('Comprar licença'))
  expect(request).not.toHaveBeenCalled()
})

it('US1-AC3/FR-003/FR-004: build não comercial — sem cartão Licença e o foco inicial cai em Avançado', async () => {
  await pairedConnection()
  const handle = await renderTab()
  expect(screen.queryByRole('heading', { name: 'Licença' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Comprar licença|Renovar licença|Atualizar/ })).not.toBeInTheDocument()
  expect(buttonLabels()).toEqual(['Avançado'])
  act(() => handle.current!.onEnter())
  await waitFor(() => expect(focused()).toHaveAccessibleName('Avançado'))
})

it('US2-AC1/AC5/FR-005/FR-006/SC-002: Avançado abre uma subtela (não um modal) com 4 itens na ordem, cada um com o texto de para que serve', async () => {
  await pairedConnection()
  await renderTab()
  fireEvent.click(screen.getByRole('button', { name: 'Avançado' }))
  const advanced = await screen.findByRole('region', { name: 'Avançado' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(within(advanced).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent))
    .toEqual(['Código de recuperação', 'Gerar nova chave e código', 'Recuperar pelo site', 'Desvincular esta TV'])
  expect(buttonLabels(advanced)).toEqual(['Mostrar código de recuperação', 'Gerar nova chave e código', 'Recuperar pelo site', 'Desvincular esta TV'])
  expect(within(advanced).getByText(/não é uma licença comprada/)).toBeInTheDocument()
  expect(within(advanced).getByText(/sessões abertas no site são encerradas/)).toBeInTheDocument()
  expect(within(advanced).getByText(/perdeu o acesso ao portal/)).toBeInTheDocument()
  expect(within(advanced).getByText(/sem apagar listas e dados/)).toBeInTheDocument()
  expect(focused()).toHaveAccessibleName('Mostrar código de recuperação')
  expect(document.body.textContent).not.toContain(CODE)
})

it('US2-AC2/AC3/AC4/FR-007/FR-008/SC-004: o código só aparece por SELECT no olho, sem modal; Voltar fecha a subtela com o foco em Avançado e o código oculto', async () => {
  await pairedConnection()
  const handle = await renderTab()
  fireEvent.click(screen.getByRole('button', { name: 'Avançado' }))
  await screen.findByRole('region', { name: 'Avançado' })
  expect(document.body.textContent).not.toContain(CODE)
  act(() => handle.current!.onSelect())
  expect(await screen.findByText(CODE)).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(focused()).toHaveAccessibleName('Ocultar código de recuperação')
  let consumed: boolean | undefined
  act(() => { consumed = handle.current!.onBack!() })
  expect(consumed).toBe(true)
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Avançado' })).not.toBeInTheDocument())
  expect(focused()).toHaveAccessibleName('Avançado')
  expect(document.body.textContent).not.toContain(CODE)
  fireEvent.click(screen.getByRole('button', { name: 'Avançado' }))
  await screen.findByRole('region', { name: 'Avançado' })
  expect(document.body.textContent).not.toContain(CODE)
  let consumedAtMain: boolean | undefined
  act(() => { handle.current!.onBack!() })
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Avançado' })).not.toBeInTheDocument())
  act(() => { consumedAtMain = handle.current!.onBack!() })
  expect(consumedAtMain).toBe(false)
})

it('US3-AC1/FR-010: gerar nova chave só após confirmar, uma rotação, volta à tela principal com a nova chave e o código novo oculto', async () => {
  const { db, connection } = await pairedConnection()
  const rotate = vi.spyOn(connection, 'rotate').mockImplementation(async () => {
    const device = (await db.table('portalDevice').get('device'))!
    const next = { ...device, deviceKey: '9876543210', recoveryCode: '9999-8888-7777-6666-5555-4444-3333', recoveryCodeVersion: 2 }
    await db.table('portalDevice').put(next)
    return next
  })
  await renderTab()
  fireEvent.click(screen.getByRole('button', { name: 'Avançado' }))
  const advanced = await screen.findByRole('region', { name: 'Avançado' })
  fireEvent.click(within(advanced).getByRole('button', { name: 'Gerar nova chave e código' }))
  const confirm = await screen.findByRole('dialog')
  expect(rotate).not.toHaveBeenCalled()
  fireEvent.click(within(confirm).getByRole('button', { name: 'Gerar nova chave e código' }))
  await waitFor(() => expect(rotate).toHaveBeenCalledTimes(1))
  expect(rotate).toHaveBeenCalledWith('revoke')
  expect(await screen.findByText('987 654 3210')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Avançado' })).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain('9999-8888-7777-6666-5555-4444-3333')
})
