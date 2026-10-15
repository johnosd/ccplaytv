import Dexie from 'dexie'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, it } from 'vitest'
import { CatalogDb } from '../../lib/catalog/db'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from '../../lib/portal/deviceIdentity'
import { portalTables } from '../../lib/portal/portalTables'
import { readRelinkHint } from '../../lib/portal/unlink'
import { PortalBackupActions, type BackupActionsHandle } from './PortalBackupActions'

const databases: CatalogDb[] = []
afterEach(async () => { cleanup(); for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
const credentials = { deviceId: 'device-a', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
  deviceKey: '1732049818', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-1111-2222-3333-4444-5555-6666', recoveryCodeVersion: 1 }

async function setup(paired: boolean) {
  const db = new CatalogDb('test-072-actions-' + crypto.randomUUID())
  databases.push(db)
  if (paired) { await persistCredentialIssuance(db, credentials, 'enroll-a', 1); await acknowledgeCredentialIssuance(db, 'enroll-a', 1) }
  const handle = createRef<BackupActionsHandle>()
  render(<PortalBackupActions connection={{ database: db } as never} handleRef={handle} focusedIndex={3} />)
  await screen.findByText('Nenhum backup guardado ainda.')
  return { db, handle }
}

it('sem pareamento, Desvincular fica soft-disabled e não abre confirmação', async () => {
  const { handle } = await setup(false)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Desvincular esta TV' })).toHaveAttribute('aria-disabled', 'true'))
  act(() => handle.current?.activate(3))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('Desvincular pede confirmação com Cancelar em foco; Cancelar não muda nada; confirmar solta o pareamento e avisa', async () => {
  const { db, handle } = await setup(true)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Desvincular esta TV' })).not.toHaveAttribute('aria-disabled'))
  act(() => handle.current?.activate(3))
  const dialog = await screen.findByRole('dialog', { name: 'Desvincular esta TV do portal?' })
  expect(dialog.querySelector('.tv-focus')?.textContent).toBe('Cancelar')
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await portalTables(db).device.get('device')).toBeTruthy()

  act(() => handle.current?.activate(3))
  await screen.findByRole('dialog')
  // Sem agente montado (teste), o backup antes não acontece: o aviso diz isso.
  fireEvent.click(screen.getAllByRole('button', { name: 'Desvincular esta TV' }).at(-1)!)
  expect(await screen.findByText(/TV desvinculada/)).toBeInTheDocument()
  expect(await portalTables(db).device.get('device')).toBeUndefined()
  expect((await readRelinkHint(db))?.deviceId).toBe('device-a')
})
