import Dexie from 'dexie'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../../lib/catalog/db'
import { PortalRequestError } from '../../lib/portal/portalClient'
import { PortalConnection } from '../../lib/portal/portalConnection'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from '../../lib/portal/deviceIdentity'
import { registerPortalSyncNow } from '../../lib/portal/portalRuntime'
import { PortalPairingPanel } from './PortalPairingPanel'

const databases: CatalogDb[] = []
const unregisters: (() => void)[] = []
afterEach(async () => {
  cleanup()
  for (const off of unregisters.splice(0)) off()
  for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) }
})

async function connectionWith(request: (path: string) => unknown) {
  const db = new CatalogDb('test-070-panel-' + crypto.randomUUID()); databases.push(db)
  await persistCredentialIssuance(db, { deviceId: 'device-a', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
    deviceKey: '1732049818', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A',
    recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }, 'enrollment-a', Date.now())
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  return new PortalConnection(db, { request: vi.fn(async (path: string) => request(path)) as never }, 'https://portal.test', () => 'fixture-duid')
}
const invite = () => ({ token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 299000).toISOString(), qrDataUrl: 'data:image/png;base64,aGVsbG8=' })

it('sem portal configurado: estado honesto, só Voltar focável, sem ID/chave/QR inventados', () => {
  const onBack = vi.fn()
  render(<PortalPairingPanel onBack={onBack} />)
  expect(screen.getByRole('status')).toHaveTextContent('não está disponível')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/\d{10}|[0-9A-F]{2}(:[0-9A-F]{2}){5}/)
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
  expect(onBack).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: 'Recarregar' })).not.toBeInTheDocument()
})

it('falha ao gerar o convite mostra a mensagem e o código, mantendo ID/chave locais e as ações', async () => {
  const connection = await connectionWith(path => { if (path.endsWith('/invites')) throw new PortalRequestError('rate_limited'); return {} })
  render(<PortalPairingPanel connection={connection} onBack={vi.fn()} />)
  expect(await screen.findByText('Código do erro: rate_limited')).toBeInTheDocument()
  expect(screen.getByText('A0:8C:FD:19:0A:8C')).toBeInTheDocument()
  expect(screen.getByText('1732049818')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
})

it('Recarregar usa o ciclo do agente: sucesso avisa e chama onReloaded; falha mostra o código', async () => {
  const connection = await connectionWith(path => (path.endsWith('/invites') ? invite() : {}))
  const onReloaded = vi.fn()
  let next: { ok: boolean; code?: string } = { ok: true }
  unregisters.push(registerPortalSyncNow(async () => next))
  render(<PortalPairingPanel connection={connection} onBack={vi.fn()} onReloaded={onReloaded} />)
  await screen.findByRole('img', { name: /QR/ })
  fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
  expect(await screen.findByText('Listas atualizadas.')).toBeInTheDocument()
  expect(onReloaded).toHaveBeenCalledTimes(1)
  next = { ok: false, code: 'offline' }
  fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
  expect(await screen.findByText('Código do erro: offline')).toBeInTheDocument()
  expect(onReloaded).toHaveBeenCalledTimes(1)
})

it('"Gerar nova chave" exige confirmação: Cancelar não rotaciona; confirmar chama a rotação revoke', async () => {
  const connection = await connectionWith(path => (path.endsWith('/invites') ? invite() : {}))
  const rotate = vi.spyOn(connection, 'rotate').mockResolvedValue((await connection.ready()))
  render(<PortalPairingPanel connection={connection} onBack={vi.fn()} />)
  await screen.findByRole('img', { name: /QR/ })
  fireEvent.click(screen.getByRole('button', { name: 'Gerar nova chave' }))
  let dialog = screen.getByRole('dialog', { name: 'Gerar nova chave do dispositivo?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  expect(rotate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Gerar nova chave' }))
  dialog = screen.getByRole('dialog', { name: 'Gerar nova chave do dispositivo?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gerar nova chave' }))
  await vi.waitFor(() => expect(rotate).toHaveBeenCalledWith('revoke'))
})
