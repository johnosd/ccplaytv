import Dexie from 'dexie'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../../lib/catalog/db'
import { PortalRequestError } from '../../lib/portal/portalClient'
import { PortalConnection } from '../../lib/portal/portalConnection'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from '../../lib/portal/deviceIdentity'
import { registerPortalRefresh } from '../../lib/portal/portalRuntime'
import { db as appDb } from '../../lib/catalog/db'
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

it('falha no cadastro/upgrade mostra a mensagem e o código, mantendo ID/chave locais e as ações', async () => {
  const connection = await connectionWith(() => ({}))
  vi.spyOn(connection, 'ensurePairing').mockRejectedValue(new PortalRequestError('rate_limited'))
  render(<PortalPairingPanel connection={connection} onBack={vi.fn()} />)
  expect(await screen.findByText('Código do erro: rate_limited')).toBeInTheDocument()
  expect(screen.getByText('A0:8C:FD:19:0A:8C')).toBeInTheDocument()
  expect(screen.getByText('1732049818')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
})

it('Recarregar usa o Atualizar do agente: lista nova avisa e chama onReloaded; sem novidades fica na tela', async () => {
  const connection = await connectionWith(() => ({}))
  const onReloaded = vi.fn()
  let change = true
  unregisters.push(registerPortalRefresh(async scope => {
    expect(scope).toBe('lists')
    // O fingerprint do Atualizar lê o banco do app (o mesmo que o agente de produção altera).
    if (change) await appDb.sources.put({ id: 'nova', type: 'm3u_url', displayName: 'Nova', m3uUrl: 'https://fixture.test/l', createdAt: 1, updatedAt: 1, connectionState: 'synced' })
    return { ok: true }
  }))
  render(<PortalPairingPanel connection={connection} onBack={vi.fn()} onReloaded={onReloaded} />)
  await screen.findByRole('img', { name: /QR/ })
  fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
  expect(await screen.findByText('Listas atualizadas.')).toBeInTheDocument()
  expect(onReloaded).toHaveBeenCalledTimes(1)
  await appDb.sources.delete('nova')
  change = false
  cleanup()
  render(<PortalPairingPanel connection={connection} onBack={vi.fn()} onReloaded={onReloaded} />)
  await screen.findByRole('img', { name: /QR/ })
  fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
  expect(await screen.findByText('Sem novidades.')).toBeInTheDocument()
  expect(onReloaded).toHaveBeenCalledTimes(1)
})

it('Recarregar sem internet mostra o aviso e mantém os botões; nada é perdido', async () => {
  const connection = await connectionWith(() => ({}))
  const onReloaded = vi.fn()
  unregisters.push(registerPortalRefresh(async () => ({ ok: false, code: 'offline' })))
  render(<PortalPairingPanel connection={connection} onBack={vi.fn()} onReloaded={onReloaded} />)
  await screen.findByRole('img', { name: /QR/ })
  fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
  expect(await screen.findByText('Sem internet. Verifique a rede e tente de novo.')).toBeInTheDocument()
  expect(onReloaded).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
})
it('a tela do site só tem Recarregar e Voltar (nova chave fica em Portal & licença, 071/A006)', async () => {
  const connection = await connectionWith(path => (path.endsWith('/invites') ? invite() : {}))
  render(<PortalPairingPanel connection={connection} onBack={vi.fn()} />)
  await screen.findByRole('img', { name: /QR/ })
  expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Recarregar', 'Voltar'])
  expect(screen.queryByRole('button', { name: 'Gerar nova chave' })).not.toBeInTheDocument()
})