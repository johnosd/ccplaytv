import Dexie from 'dexie'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../../lib/catalog/db'
import { PortalConnection } from '../../lib/portal/portalConnection'
import { persistCredentialIssuance, acknowledgeCredentialIssuance } from '../../lib/portal/deviceIdentity'
import { registerPixPurchaseOpener } from '../../lib/licensing/pixPurchaseRuntime'
import { PortalLicensePanel, type PortalPanelHandle } from './PortalLicensePanel'

const build = vi.hoisted(() => ({ commercial: false }))
vi.mock('../../lib/licensing/licenseRuntime', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/licensing/licenseRuntime')>()),
  get commercialBuild() { return build.commercial },
}))

const databases: CatalogDb[] = []
afterEach(async () => { cleanup(); build.commercial = false; for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
async function setup() {
  const db = new CatalogDb('test-075-panel-' + crypto.randomUUID()); databases.push(db)
  const credentials = { deviceId: 'device-a', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
    deviceKey: '1732049818', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A',
    recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }
  await persistCredentialIssuance(db, credentials, 'enrollment-a', Date.now())
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  const connection = new PortalConnection(db, { request: vi.fn() as never }, 'https://portal.test', () => 'fixture-duid')
  const handleRef = createRef<PortalPanelHandle>()
  render(<PortalLicensePanel view="main" focused focusedId={undefined} handleRef={handleRef} connection={connection} />)
  await screen.findByRole('img', { name: 'QR de acesso ao portal desta TV' })
  return { db, connection, credentials, handleRef }
}

it('o QR fixo e a chave não somem em segundo plano (ADR-019); o código continua fora do DOM', async () => {
  const { credentials } = await setup()
  fireEvent(window, new Event('pagehide'))
  expect(screen.getByRole('img', { name: 'QR de acesso ao portal desta TV' })).toBeInTheDocument()
  expect(screen.getByText('173 204 9818')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain(credentials.recoveryCode)
})

it('ACK concluído pelo agente compartilhado encerra recuperação sem acusar expiração', async () => {
  const { db, connection } = await setup()
  let finish!: (result: 'waiting' | 'ready' | 'expired') => void
  vi.spyOn(connection, 'pollRecovery').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await act(async () => { await db.table('portalDevice').put({ id: 'bootstrap', createdAt: Date.now(),
    pendingAck: { operationId: 'recovery-fixture', authEpoch: 1, createdAt: Date.now(), purpose: 'recovery' } }) })
  await screen.findByText('Leia este QR no celular, informe o código guardado e confirme o ID desta TV. Aguarde a conclusão aqui antes de guardar o novo código.')
  await vi.waitFor(() => expect(connection.pollRecovery).toHaveBeenCalled())
  await act(async () => { await db.table('portalDevice').delete('bootstrap') })
  await screen.findByText('Acesso atualizado. Guarde o novo código de recuperação.')
  await act(async () => finish('expired'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

// 073/D-010, D-011: Comprar licença abre a tela de Pix pelo registro; sem quem a abra, explica.
it('Comprar licença pede a tela de Pix ao registro e, sem registro, avisa que a compra está indisponível', async () => {
  build.commercial = true
  const { handleRef } = await setup()
  expect(screen.getByRole('button', { name: 'Comprar licença' })).toBeInTheDocument()
  act(() => handleRef.current!.activate('purchase'))
  expect(await screen.findByText('A compra está indisponível no momento.')).toBeInTheDocument()
  const opener = vi.fn()
  const release = registerPixPurchaseOpener(opener)
  try {
    act(() => handleRef.current!.activate('purchase'))
    expect(opener).toHaveBeenCalledOnce()
    expect(opener.mock.calls[0][0]).toMatchObject({ onLicensed: expect.any(Function), onBack: expect.any(Function) })
  } finally { release() }
  expect(screen.queryByText('A compra está indisponível no momento.')).not.toBeInTheDocument()
})

it('as ações seguem Comprar → Atualizar → Avançado no build comercial e só Avançado fora dele', async () => {
  const { handleRef } = await setup()
  expect(handleRef.current!.actions).toEqual(['advanced'])
  expect(handleRef.current!.initial).toBe('advanced')
  expect(handleRef.current!.mainInitial).toBe('advanced')
  cleanup()
  build.commercial = true
  const second = await setup()
  expect(second.handleRef.current!.actions).toEqual(['purchase', 'refresh', 'advanced'])
  expect(second.handleRef.current!.initial).toBe('purchase')
})

it('a tela principal lembra de guardar o código de recuperação e não mostra o código nem o olho', async () => {
  const { credentials } = await setup()
  expect(screen.getByText('Guarde seu código de recuperação em Avançado.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /código/i })).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain(credentials.recoveryCode)
  expect(document.body.textContent).not.toContain('••••')
})
