import Dexie from 'dexie'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, it } from 'vitest'
import { CatalogDb } from '../../lib/catalog/db'
import { PortalBackupActions, type BackupActionsHandle } from './PortalBackupActions'

const databases: CatalogDb[] = []
afterEach(async () => { cleanup(); for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

async function setup() {
  const db = new CatalogDb('test-075-backup-' + crypto.randomUUID())
  databases.push(db)
  const handle = createRef<BackupActionsHandle>()
  render(<PortalBackupActions connection={{ database: db } as never} handleRef={handle} focusedIndex={0} />)
  await screen.findByText('Nenhum backup guardado ainda.')
  return { handle }
}

it('tem só Fazer backup agora, Restaurar e Apagar; Desvincular saiu daqui (vive no Avançado)', async () => {
  await setup()
  expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Fazer backup agora', 'Restaurar backup', 'Apagar backup'])
  expect(screen.queryByRole('button', { name: 'Desvincular esta TV' })).not.toBeInTheDocument()
})

it('sem backup guardado, Restaurar e Apagar ficam soft-disabled e não abrem confirmação', async () => {
  const { handle } = await setup()
  for (const name of ['Restaurar backup', 'Apagar backup']) expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true')
  act(() => handle.current?.activate(1))
  act(() => handle.current?.activate(2))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('sem portal configurado explica o motivo e mantém as ações focáveis', () => {
  render(<PortalBackupActions handleRef={createRef<BackupActionsHandle>()} focusedIndex={0} />)
  expect(screen.getByText(/O portal ainda não está disponível neste app/)).toBeInTheDocument()
  const buttons = screen.getAllByRole('button')
  expect(buttons).toHaveLength(3)
  for (const button of buttons) expect(button).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(buttons[0])
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.querySelector('.tv-focus')).not.toBeNull()
})
