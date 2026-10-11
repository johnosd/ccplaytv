import Dexie from 'dexie'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../../lib/catalog/db'
import { PortalConnection } from '../../lib/portal/portalConnection'
import { persistCredentialIssuance, acknowledgeCredentialIssuance } from '../../lib/portal/deviceIdentity'
import { PortalLicensePanel, type PortalPanelHandle } from './PortalLicensePanel'
const databases: CatalogDb[] = []
afterEach(async () => { cleanup(); for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
async function setup() {
  const db = new CatalogDb('test-069-panel-' + crypto.randomUUID()); databases.push(db)
  const credentials = { deviceId: 'device-a', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
    deviceKey: 'b'.repeat(42) + 'A', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A',
    recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }
  await persistCredentialIssuance(db, credentials, 'enrollment-a', Date.now())
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  const connection = new PortalConnection(db, { request: vi.fn() as never }, 'https://portal.test', () => 'fixture-duid')
  const handleRef = createRef<PortalPanelHandle>()
  const invite = vi.spyOn(connection, 'invite').mockResolvedValue({ deviceId: 'device-a', invite: {
    token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 299000).toISOString(), qrDataUrl: 'data:image/png;base64,aGVsbG8=' } })
  const rotate = vi.spyOn(connection, 'rotate').mockResolvedValue((await db.table('portalDevice').get('device'))!)
  render(<PortalLicensePanel focusedAction={0} handleRef={handleRef} connection={connection} />)
  await screen.findByText('ID da TV: device-a')
  return { db, connection, credentials, handleRef, invite, rotate }
}
it('foco não consulta; chave exige confirmação explícita e RETURN oculta sem revogar', async () => {
  const { credentials, invite, rotate } = await setup()
  expect(invite).not.toHaveBeenCalled()
  expect(document.body.textContent).not.toContain(credentials.deviceKey)
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar chave da TV' }))
  let dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
  expect(dialog.textContent).not.toContain(credentials.deviceKey)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Mostrar agora' }))
  expect(screen.getByText(credentials.deviceKey)).toBeInTheDocument()
  fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain(credentials.deviceKey)
  fireEvent.click(screen.getByRole('button', { name: 'Revogar acessos ao portal' }))
  dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  expect(rotate).not.toHaveBeenCalled()
})
it('QR desaparece no pagehide e resposta atrasada não o reexibe', async () => {
  const { invite } = await setup()
  fireEvent.click(screen.getByRole('button', { name: 'Gerar QR para o portal' }))
  await screen.findByRole('img', { name: 'QR de acesso temporário ao portal desta TV' })
  fireEvent(window, new Event('pagehide'))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  let finish!: (result: Awaited<ReturnType<PortalConnection['invite']>>) => void
  invite.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  fireEvent.click(screen.getByRole('button', { name: 'Gerar QR para o portal' }))
  await waitFor(() => expect(invite).toHaveBeenCalledTimes(2))
  fireEvent(window, new Event('pagehide'))
  await act(async () => finish({ deviceId: 'device-a', invite: { token: 'a'.repeat(43),
    expiresAt: new Date(Date.now() + 299000).toISOString(), qrDataUrl: 'data:image/png;base64,aGVsbG8=' } }))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it('ACK concluído pelo agente compartilhado encerra recuperação sem acusar expiração', async () => {
  const { db, connection } = await setup()
  let finish!: (result: 'waiting' | 'ready' | 'expired') => void
  vi.spyOn(connection, 'pollRecovery').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await act(async () => { await db.table('portalDevice').put({ id: 'bootstrap', createdAt: Date.now(),
    pendingAck: { operationId: 'recovery-fixture', authEpoch: 1, createdAt: Date.now(), purpose: 'recovery' } }) })
  await screen.findByText('Leia este QR no celular, informe o código guardado e confirme o ID desta TV. Aguarde a conclusão aqui antes de guardar o novo código.')
  await waitFor(() => expect(connection.pollRecovery).toHaveBeenCalled())
  await act(async () => { await db.table('portalDevice').delete('bootstrap') })
  await screen.findByText('Acesso atualizado. Guarde o novo código da licença.')
  await act(async () => finish('expired'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
