import { afterEach, expect, it, vi } from 'vitest'
import { runImport } from './importRunner'

class FakeWorker {
  static current: FakeWorker
  onmessage?: (event: MessageEvent) => void
  onerror?: () => void
  sent: unknown[] = []
  terminated = false
  constructor() { FakeWorker.current = this }
  postMessage(message: { type: string }) {
    this.sent.push(message)
    if (message.type === 'start') queueMicrotask(() => this.emit({ type: 'started', runId: 'run-fixture' }))
  }
  terminate() { this.terminated = true }
  emit(message: unknown) { this.onmessage?.({ data: message } as MessageEvent) }
}
afterEach(() => vi.unstubAllGlobals())

it('Worker recebe vínculo remoto e handle conserva cancel/completion', async () => {
  vi.stubGlobal('Worker', FakeWorker)
  const remote = { operationId: 'operation-fixture', configRevision: 3 }
  const handle = await runImport('source-fixture', { remote, batchSize: 10 })
  expect(FakeWorker.current.sent[0]).toEqual({ type: 'start', sourceId: 'source-fixture', batchSize: 10, remote })
  expect(handle.ranInWorker).toBe(true)
  handle.cancel()
  expect(FakeWorker.current.sent[1]).toEqual({ type: 'cancel' })
  FakeWorker.current.emit({ type: 'done', run: { id: 'run-fixture', status: 'completed' } })
  expect((await handle.completion).status).toBe('completed')
  expect(FakeWorker.current.terminated).toBe(true)
})
