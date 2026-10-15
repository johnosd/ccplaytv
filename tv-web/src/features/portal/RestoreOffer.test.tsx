import Dexie from 'dexie'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { readBackupState, writeBackupState } from '../../lib/backup/backupState'
import { CatalogDb } from '../../lib/catalog/db'
import { RestoreOffer } from './RestoreOffer'

const databases: CatalogDb[] = []
afterEach(async () => { cleanup(); for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
const counts = { favorites: 3, history: 7, progress: 2, categoryPreferences: 0, listPins: 0 }

it('oferece uma vez com foco em "Agora não"; recusar fecha e não reabre sozinho', async () => {
  const db = new CatalogDb('test-072-offer-' + crypto.randomUUID())
  databases.push(db)
  await writeBackupState(db, { state: 'offered', lastBackupAt: 50, offer: { createdAt: 50, counts } })
  render(<RestoreOffer connection={{ database: db } as never} />)
  const dialog = await screen.findByRole('dialog')
  expect(dialog.textContent).toContain('3 favoritos, 7 no histórico e 2 em andamento')
  expect(dialog.querySelector('.tv-focus')?.textContent).toBe('Agora não')
  fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(await readBackupState(db)).toMatchObject({ state: 'offered', offer: { dismissed: true } })
})
