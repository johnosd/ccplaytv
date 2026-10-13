import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it } from 'vitest'
import { AddSourceScreen } from './AddSourceScreen'
import type { SourceOut } from './importApi'
import { db } from '../../lib/catalog/db'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(async () => { cleanup(); await db.sources.clear() })

// US2/AC1-AC3, FR-010, FR-011 — Constitution 1.10.0 (credencial local visível na edição da própria TV, com olho)
it('editar lista Xtream mostra servidor, usuário e senha salvos em texto visível; o olho oculta e reexibe os três', async () => {
  await db.sources.put({ id: 'src-prov', type: 'provider_credentials', displayName: 'Casa', providerDns: 'http://painel.exemplo.test:8080',
    providerUsername: 'joao-usuario', providerPassword: 'senha-secreta-123', connectionState: 'synced', createdAt: 1, updatedAt: 1 } as never)
  const existing: SourceOut = { id: 'src-prov', type: 'provider_credentials', display_name: 'Casa', connection_state: 'synced',
    last_successful_sync_at: null, provider_import_mode: 'xtream_api', limited_reason: null,
    provider_dns: 'http://painel.exemplo.test:8080', last_truncated_by_storage: false, last_discarded_by_type: 0 }

  render(<AddSourceScreen existingSource={existing} onSourceCreated={() => {}} onBack={() => {}} />, { wrapper })

  const server = screen.getByLabelText('Servidor') as HTMLInputElement
  const user = screen.getByLabelText('Usuário') as HTMLInputElement
  const password = screen.getByLabelText('Senha') as HTMLInputElement
  await waitFor(() => expect(password).toHaveValue('senha-secreta-123'))
  expect(user).toHaveValue('joao-usuario')
  expect(server).toHaveValue('http://painel.exemplo.test:8080')
  for (const field of [server, user, password]) expect(field.type).not.toBe('password')

  fireEvent.click(screen.getByRole('button', { name: /^Ocultar/ }))
  for (const label of ['Servidor', 'Usuário', 'Senha']) expect((screen.getByLabelText(label) as HTMLInputElement).type).toBe('password')
  fireEvent.click(screen.getByRole('button', { name: /^Mostrar/ }))
  for (const label of ['Servidor', 'Usuário', 'Senha']) expect((screen.getByLabelText(label) as HTMLInputElement).type).not.toBe('password')
})
