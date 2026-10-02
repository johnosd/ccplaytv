/** Feature 045, US5 — EPG manual: Done do IME leva à ação sem enviar; erro próprio intacto. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type SourceRecord } from '../../lib/catalog/db'
import { IME_KEYCODES } from '../../lib/imeKeys'

const requestEpgSync = vi.fn()
vi.mock('../../lib/epg/epgRunner', () => ({
  requestEpgSync: (...args: unknown[]) => requestEpgSync(...args),
  isEpgSyncing: () => false,
  subscribeEpgSyncing: () => () => {},
  onEpgSyncFinished: () => () => {},
}))

import { EpgSettingsScreen } from './EpgSettingsScreen'

const SOURCE_ID = 'fonte-epg-ime'
const PROVIDER: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Sala',
  providerDns: 'http://painel.test',
  providerUsername: 'usuario-secreto',
  providerPassword: 'senha-secreta',
  connectionState: 'synced',
  createdAt: 1,
  updatedAt: 1,
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  render(<EpgSettingsScreen sourceId={SOURCE_ID} onBack={vi.fn()} />, { wrapper: Wrapper })
}

beforeEach(async () => {
  requestEpgSync.mockReset()
  await db.sources.put(PROVIDER)
})

afterEach(async () => {
  cleanup()
  await db.sources.delete(SOURCE_ID)
})

describe('EpgSettingsScreen — IME (feature 045)', () => {
  it('Done no endereço leva o foco a "Salvar endereço" e NÃO salva nem sincroniza', async () => {
    renderScreen()
    const field = await screen.findByLabelText(/Endereço XMLTV/)
    fireEvent.change(field, { target: { value: 'http://guia.exemplo.test/xmltv.xml' } })
    field.focus()

    fireEvent.keyDown(field, { key: 'Unidentified', keyCode: IME_KEYCODES.done[0] })

    expect(screen.getByRole('button', { name: 'Salvar endereço' })).toHaveFocus()
    expect(requestEpgSync).not.toHaveBeenCalled()
    expect((await db.sources.get(SOURCE_ID))?.epgManualUrl).toBeUndefined()
  })

  it('a dica do teclado é "done" e o erro próprio de endereço inválido continua igual', async () => {
    renderScreen()
    const field = await screen.findByLabelText(/Endereço XMLTV/)
    expect(field).toHaveAttribute('enterkeyhint', 'done')

    fireEvent.change(field, { target: { value: 'isto não é endereço' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar endereço' }))
    expect(await screen.findByText('Endereço inválido. Use um endereço começando com http:// ou https://')).toBeInTheDocument()
  })
})
