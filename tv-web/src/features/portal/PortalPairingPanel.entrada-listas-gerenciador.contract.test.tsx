import Dexie from 'dexie'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../../lib/catalog/db'
import { PortalConnection } from '../../lib/portal/portalConnection'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from '../../lib/portal/deviceIdentity'
import { PortalPairingPanel } from './PortalPairingPanel'

const databases: CatalogDb[] = []
afterEach(async () => { cleanup(); for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

const DISPLAY_ID = 'A0:8C:FD:19:0A:8C'
const DEVICE_KEY = '1732049818'

// US1/AC1, FR-002, FR-003, FR-004, FR-023 — Constitution 1.10.0 (chave sempre visível só na tela Adicionar; nunca em URL/QR)
it('mostra ID no formato MAC, chave de 10 dígitos, endereço do painel e QR sem ação extra; a chave nunca vai na requisição do convite', async () => {
  const db = new CatalogDb('test-070-pairing-' + crypto.randomUUID()); databases.push(db)
  await persistCredentialIssuance(db, { deviceId: 'device-a', displayId: DISPLAY_ID, bearer: 'device-a.' + 'a'.repeat(42) + 'A',
    deviceKey: DEVICE_KEY, authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A',
    recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }, 'enrollment-a', Date.now())
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  const request = vi.fn(async (path: string) => {
    if (path === '/portal/v1/device/invites') {
      return { token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 299000).toISOString(), qrDataUrl: 'data:image/png;base64,aGVsbG8=' }
    }
    return {}
  })
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')

  render(<PortalPairingPanel connection={connection} onBack={vi.fn()} />)

  expect(await screen.findByText(DISPLAY_ID)).toBeInTheDocument()
  expect(screen.getByText(DEVICE_KEY)).toBeInTheDocument()
  expect(document.body.textContent).toContain('https://portal.test')
  expect(await screen.findByRole('img', { name: /QR/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/Em breve/i)
  for (const [path, options] of request.mock.calls as unknown as [string, unknown][]) {
    expect(path + JSON.stringify(options ?? {})).not.toContain(DEVICE_KEY)
  }
})
