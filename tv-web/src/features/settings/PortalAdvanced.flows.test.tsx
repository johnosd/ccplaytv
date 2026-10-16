import Dexie from 'dexie'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRef, useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../../lib/catalog/db'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from '../../lib/portal/deviceIdentity'
import { PortalConnection } from '../../lib/portal/portalConnection'
import { portalTables } from '../../lib/portal/portalTables'
import { readRelinkHint } from '../../lib/portal/unlink'
import { PortalLicensePanel, type PortalPanelHandle } from './PortalLicensePanel'
import type { PortalActionId, PortalView } from './portalActions'

const databases: CatalogDb[] = []
afterEach(async () => { cleanup(); for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
const credentials = { deviceId: 'device-a', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
  deviceKey: '1732049818', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-1111-2222-3333-4444-5555-6666', recoveryCodeVersion: 1 }

// A visão e o foco são estado da aba; aqui um invólucro faz o papel dela.
function Tab({ connection, handleRef }: { connection: PortalConnection; handleRef: React.Ref<PortalPanelHandle> }) {
  const [state, setState] = useState<{ view: PortalView; focusedId?: PortalActionId }>({ view: 'main' })
  return <PortalLicensePanel view={state.view} focused focusedId={state.focusedId} handleRef={handleRef} connection={connection}
    onActionFocus={focusedId => setState(current => ({ ...current, focusedId }))} onView={(view, focusedId) => setState({ view, focusedId })} />
}

async function setup(paired: boolean) {
  const db = new CatalogDb('test-076-flows-' + crypto.randomUUID()); databases.push(db)
  if (paired) { await persistCredentialIssuance(db, credentials, 'enroll-a', 1); await acknowledgeCredentialIssuance(db, 'enroll-a', 1) }
  const connection = new PortalConnection(db, { request: vi.fn() as never }, 'https://portal.test', () => 'fixture-duid')
  if (!paired) vi.spyOn(connection, 'ensurePairing').mockResolvedValue(undefined as never)
  render(<Tab connection={connection} handleRef={createRef<PortalPanelHandle>()} />)
  if (paired) await screen.findByRole('img', { name: 'QR de acesso ao portal desta TV' })
  else await screen.findByText(/não está vinculada ao portal/)
  return { db, connection }
}
const openAdvanced = async () => { fireEvent.click(screen.getByRole('button', { name: 'Avançado' })); return screen.findByRole('region', { name: 'Avançado' }) }
const focusedText = () => document.querySelector('.tv-focus')?.textContent

it('RETURN na confirmação fecha só a confirmação: a subtela continua e o foco fica no item', async () => {
  await setup(true)
  const advanced = await openAdvanced()
  fireEvent.click(within(advanced).getByRole('button', { name: 'Gerar nova chave e código' }))
  const confirm = await screen.findByRole('dialog')
  expect(confirm.querySelector('.tv-focus')?.textContent).toBe('Cancelar')
  fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('region', { name: 'Avançado' })).toBeInTheDocument()
  expect(focusedText()).toBe('Gerar nova chave e código')
})

it('Cancelar não gira a chave e a confirmação explica o efeito completo', async () => {
  const { connection } = await setup(true)
  const rotate = vi.spyOn(connection, 'rotate')
  const advanced = await openAdvanced()
  fireEvent.click(within(advanced).getByRole('button', { name: 'Gerar nova chave e código' }))
  const confirm = await screen.findByRole('dialog')
  expect(confirm.textContent).toContain('o site é desconectado')
  expect(confirm.textContent).toContain('código de recuperação')
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(rotate).not.toHaveBeenCalled()
  expect(screen.getByRole('region', { name: 'Avançado' })).toBeInTheDocument()
})

it('sem vínculo, nova chave e Desvincular não abrem confirmação (soft-disabled com o motivo) e Recuperar segue disponível', async () => {
  await setup(false)
  const advanced = await openAdvanced()
  expect(within(advanced).getAllByText('Disponível depois que esta TV for vinculada ao portal.')).toHaveLength(3)
  for (const name of ['Gerar nova chave e código', 'Desvincular esta TV']) {
    const item = within(advanced).getByRole('button', { name })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(item)
  }
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(within(advanced).getByRole('button', { name: 'Recuperar pelo site' })).not.toHaveAttribute('aria-disabled')
})

it('Desvincular pede confirmação; confirmar solta o pareamento, guarda o lembrete e a principal mostra Vincular de novo', async () => {
  const { db } = await setup(true)
  let advanced = await openAdvanced()
  fireEvent.click(within(advanced).getByRole('button', { name: 'Desvincular esta TV' }))
  let confirm = await screen.findByRole('dialog', { name: 'Desvincular esta TV do portal?' })
  expect(confirm.querySelector('.tv-focus')?.textContent).toBe('Cancelar')
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }))
  expect(await portalTables(db).device.get('device')).toBeTruthy()

  advanced = screen.getByRole('region', { name: 'Avançado' })
  fireEvent.click(within(advanced).getByRole('button', { name: 'Desvincular esta TV' }))
  confirm = await screen.findByRole('dialog', { name: 'Desvincular esta TV do portal?' })
  // Sem agente montado (teste), o backup antes não acontece: o aviso diz isso.
  fireEvent.click(within(confirm).getByRole('button', { name: 'Desvincular esta TV' }))
  expect(await screen.findByText(/TV desvinculada/)).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Avançado' })).not.toBeInTheDocument()
  expect(await portalTables(db).device.get('device')).toBeUndefined()
  expect((await readRelinkHint(db))?.deviceId).toBe('device-a')
  expect(await screen.findByRole('button', { name: 'Vincular de novo' })).toBeInTheDocument()
})

it('Recuperar pelo site volta à principal com o QR temporário no lugar do fixo; o fixo volta no pagehide', async () => {
  const { connection } = await setup(true)
  vi.spyOn(connection, 'recovery').mockResolvedValue({ deviceId: 'device-a', invite: {
    token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 299000).toISOString(), qrDataUrl: 'data:image/png;base64,aGVsbG8=' } })
  const advanced = await openAdvanced()
  fireEvent.click(within(advanced).getByRole('button', { name: 'Recuperar pelo site' }))
  expect(await screen.findByRole('img', { name: 'QR temporário de recuperação desta TV' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Avançado' })).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'QR de acesso ao portal desta TV' })).not.toBeInTheDocument()
  expect(screen.getByText(/QR válido por \d+ segundos/)).toBeInTheDocument()
  act(() => { fireEvent(window, new Event('pagehide')) })
  expect(await screen.findByRole('img', { name: 'QR de acesso ao portal desta TV' })).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'QR temporário de recuperação desta TV' })).not.toBeInTheDocument()
})
