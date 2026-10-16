// Contrato da feature 075 (redesenho de Portal & licença, ADR-019). Travado pelo sdd-plan: o sdd-execute só faz passar.
import Dexie from 'dexie'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
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
  const db = new CatalogDb('test-075-' + crypto.randomUUID()); databases.push(db)
  await persistCredentialIssuance(db, { deviceId: 'device-a', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
    deviceKey: KEY, authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: CODE, recoveryCodeVersion: 1 }, 'enroll-a', Date.now())
  await acknowledgeCredentialIssuance(db, 'enroll-a', 1)
  const request = vi.fn()
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  fixture.connection = connection
  return { db, connection, request }
}

function renderTab() {
  const handleRef = createRef<SettingsTabHandle>()
  const props: SettingsTabProps = { focused: true, activeSourceId: null, exitToTabs: vi.fn(), goToTopbar: vi.fn(), showToast: vi.fn(), handleRef,
    navigation: { onAddSource: vi.fn(), onEditSource: vi.fn(), onResyncStarted: vi.fn(), onSourceDeleted: vi.fn() } }
  render(<PortalLicenseTab {...props} />)
  return handleRef
}

const focused = () => document.querySelector('.tv-focus')

it('US1-AC1/FR-002/FR-003/FR-016/SC-005: QR, ID e chave agrupada à vista sem nenhuma ação nem requisição; código e botões antigos ausentes', async () => {
  const { request } = await pairedConnection()
  renderTab()
  expect(await screen.findByRole('img', { name: 'QR de acesso ao portal desta TV' })).toBeInTheDocument()
  expect(screen.getByText('A0:8C:FD:19:0A:8C')).toBeInTheDocument()
  expect(screen.getByText('173 204 9818')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain(CODE)
  for (const old of ['Gerar QR para o portal', 'Mostrar chave da TV', 'Revogar acessos ao portal', 'Fazer backup agora']) {
    expect(screen.queryByRole('button', { name: old })).not.toBeInTheDocument()
  }
  expect(request).not.toHaveBeenCalled()
})

it('US2-AC1/AC2/FR-009: build comercial — foco inicial em Comprar com teste; em Atualizar com licença ativa, que mostra Renovar', async () => {
  await pairedConnection()
  fixture.commercial = true
  fixture.snapshot = { decision: { allowed: true }, state: 'trial', expiresAt: Date.now() + 86400000 } as LicenseSnapshot
  const handle = renderTab()
  await screen.findByRole('img', { name: 'QR de acesso ao portal desta TV' })
  act(() => handle.current!.onEnter())
  await waitFor(() => expect(focused()).toHaveAccessibleName('Comprar licença'))
  act(() => {
    fixture.snapshot = { decision: { allowed: true }, state: 'active', expiresAt: Date.now() + 86400000 * 300 } as LicenseSnapshot
    for (const listener of fixture.listeners) listener()
  })
  expect(await screen.findByRole('button', { name: 'Renovar licença' })).toBeInTheDocument()
  act(() => handle.current!.onEnter())
  await waitFor(() => expect(focused()).toHaveAccessibleName(/Atualizar/))
})

it('FR-004/FR-017/SC-003/Constitution: Foco Visível e Sem Becos Sem Saída — sem portal: mensagem, no máximo 4 botões e um focado ao entrar', async () => {
  const handle = renderTab()
  expect(await screen.findByText(/O portal ainda não está disponível neste app/)).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'QR de acesso ao portal desta TV' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Gerar QR para o portal' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('button').length).toBeLessThanOrEqual(4)
  act(() => handle.current!.onEnter())
  await waitFor(() => expect(focused()).not.toBeNull())
  expect(focused()!.tagName).toBe('BUTTON')
})
