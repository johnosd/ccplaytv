import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { db } from '../../lib/catalog/db'
import type { PortalSyncOptions } from '../../lib/portal/portalSync'
import { usePortalIntegration } from './usePortalIntegration'
const fixture = vi.hoisted(() => ({ options: undefined as PortalSyncOptions | undefined }))
vi.mock('../../lib/portal/portalRuntime', () => ({ getPortalConnection: () => ({ origin: 'https://fixture.test' }),
  portalQuickMode: () => false, subscribePortalQuick: () => () => {} }))
vi.mock('../../lib/portal/portalSync', () => ({ createPortalSync: (options: PortalSyncOptions) => {
  fixture.options = options
  return { flushDeletions: async () => {}, pull: async () => {}, publishSnapshot: async () => {} }
} }))
afterEach(() => { cleanup(); fixture.options = undefined })
function setup() {
  const leaveSource = vi.fn()
  const sourceDeleted = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Host() { return usePortalIntegration({ activeSourceId: 'source-a', leaveSource, sourceDeleted, catalogChanged: vi.fn(), openPortal: vi.fn() }) }
  render(<QueryClientProvider client={queryClient}><Host /></QueryClientProvider>)
  return { leaveSource, sourceDeleted }
}
const mutation = { operationId: 'operation-a', deviceId: 'device-a', sourceId: 'source-a', expectedRevision: 1, action: 'delete' as const }
it('RETURN cancela sem encerrar a lista; confirmar encerra antes de liberar o commit', async () => {
  const { leaveSource } = setup()
  let result!: Promise<boolean>
  act(() => { result = fixture.options!.confirmDestructive(mutation, new AbortController().signal) })
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
  fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true })
  expect(await result).toBe(false)
  expect(leaveSource).not.toHaveBeenCalled()
  act(() => { result = fixture.options!.confirmDestructive(mutation, new AbortController().signal) })
  fireEvent.keyDown(document.body, { key: 'ArrowRight', bubbles: true })
  fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })
  expect(leaveSource).toHaveBeenCalledTimes(1)
  expect(await result).toBe(true)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('suspend/abort fecha confirmação e não autoriza alteração; não cria identidade local', async () => {
  const { leaveSource } = setup()
  const controller = new AbortController()
  let result!: Promise<boolean>
  act(() => { result = fixture.options!.confirmDestructive(mutation, controller.signal) })
  act(() => controller.abort())
  expect(await result).toBe(false)
  expect(leaveSource).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await db.table('portalDevice').get('device')).toBeUndefined()
})
