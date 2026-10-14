import { describe, expect, it, vi } from 'vitest'
import { sharedAttempt } from './sharedAttempt'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('sharedAttempt — leases e contexto (065/T013)', () => {
  it('compartilha dois consumidores e cancelar um preserva o outro', async () => {
    const owner = {}
    const controller = new AbortController()
    const body = deferred<string>()
    const operation = vi.fn(async () => body.promise)

    const first = sharedAttempt(owner, 'list-a|movie|pt', operation, controller.signal)
    const second = sharedAttempt(owner, 'list-a|movie|pt', operation)
    await vi.waitFor(() => expect(operation).toHaveBeenCalledTimes(1))

    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    body.resolve('resultado atual')
    await expect(second).resolves.toBe('resultado atual')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('abortar o último consumidor encerra a tentativa e permite uma nova', async () => {
    const owner = {}
    const controller = new AbortController()
    let operationSignal: AbortSignal | undefined
    const pending = sharedAttempt(owner, 'list-a|movie|pt', async signal => {
      operationSignal = signal
      return new Promise<string>(() => {})
    }, controller.signal)
    await vi.waitFor(() => expect(operationSignal).toBeDefined())

    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(operationSignal?.aborted).toBe(true)
    await expect(sharedAttempt(owner, 'list-a|movie|pt', async () => 'nova tentativa')).resolves.toBe('nova tentativa')
  })

  it('resposta tardia da tentativa antiga não remove uma nova tentativa na mesma chave', async () => {
    const owner = {}
    const oldController = new AbortController()
    const oldBody = deferred<string>()
    const newBody = deferred<string>()
    const starts: string[] = []
    const operation = vi.fn(async (_signal: AbortSignal) => {
      const context = starts.length === 0 ? 'old' : 'new'
      starts.push(context)
      return context === 'old' ? oldBody.promise : newBody.promise
    })

    const old = sharedAttempt(owner, 'list-a|movie|pt', operation, oldController.signal)
    await vi.waitFor(() => expect(operation).toHaveBeenCalledTimes(1))
    oldController.abort()
    await expect(old).rejects.toMatchObject({ name: 'AbortError' })
    const current = sharedAttempt(owner, 'list-a|movie|pt', operation)
    await vi.waitFor(() => expect(operation).toHaveBeenCalledTimes(2))

    // A tentativa antiga termina depois de a nova ocupar a mesma entrada.
    oldBody.resolve('antigo')
    const third = sharedAttempt(owner, 'list-a|movie|pt', operation)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(operation).toHaveBeenCalledTimes(2)
    newBody.resolve('atual')
    await expect(current).resolves.toBe('atual')
    await expect(third).resolves.toBe('atual')

    expect(starts).toEqual(['old', 'new'])
  })

  it('trocar lista ou idioma cria contextos independentes', async () => {
    const owner = {}
    const operation = vi.fn(async (signal: AbortSignal) => signal.aborted ? 'cancelada' : 'ok')
    await expect(sharedAttempt(owner, 'list-a|movie|pt', operation)).resolves.toBe('ok')
    await expect(sharedAttempt(owner, 'list-a|movie|en', operation)).resolves.toBe('ok')
    await expect(sharedAttempt(owner, 'list-b|movie|en', operation)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('falha compartilhada libera nova tentativa e bancos distintos não compartilham', async () => {
    const owner = { name: 'same-name' }
    const otherOwner = { name: 'same-name' }
    const body = deferred<string>()
    const operation = vi.fn(async () => body.promise)
    const first = sharedAttempt(owner, 'consulta', operation)
    const second = sharedAttempt(owner, 'consulta', operation)
    await vi.waitFor(() => expect(operation).toHaveBeenCalledTimes(1))
    const outcomes = Promise.allSettled([first, second])
    body.reject(new Error('synthetic failure'))
    expect((await outcomes).map(outcome => outcome.status)).toEqual(['rejected', 'rejected'])

    const nextOperation = vi.fn(async () => 'ok')
    await Promise.all([
      sharedAttempt(owner, 'consulta', nextOperation),
      sharedAttempt(otherOwner, 'consulta', nextOperation),
    ])
    expect(nextOperation).toHaveBeenCalledTimes(2)
  })
})
