export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

export class RequestTimeoutError extends Error {
  constructor() {
    super('request:timeout')
    this.name = 'RequestTimeoutError'
  }
}

export function requestAbortError(): Error {
  const error = new Error('request:cancelled')
  error.name = 'AbortError'
  return error
}

export function isRequestAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export interface RequestDeadlineOptions {
  signal?: AbortSignal
  timeoutMs?: number
  now?: () => number
}

/**
 * Mantém o prazo sobre a operação inteira, incluindo a leitura do corpo.
 * O AbortController próprio também cobre implementações de fetch que só
 * observam o sinal depois de a promise de transporte ser criada.
 */
export function requestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: RequestDeadlineOptions = {},
): Promise<T> {
  if (options.signal?.aborted) return Promise.reject(requestAbortError())

  const controller = new AbortController()
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
    }
    const finish = (value: T | unknown, failed: boolean) => {
      if (settled) return
      settled = true
      cleanup()
      if (failed) reject(value)
      else resolve(value as T)
    }
    const onAbort = () => {
      controller.abort()
      finish(requestAbortError(), true)
    }

    options.signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      controller.abort()
      finish(new RequestTimeoutError(), true)
    }, options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)

    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(value => finish(value, false), error => finish(error, true))
  })
}
