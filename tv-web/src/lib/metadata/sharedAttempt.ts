import { requestAbortError } from './requestDeadline'

interface Attempt<T> {
  controller: AbortController
  consumers: Set<symbol>
  promise: Promise<T>
  finished: boolean
}

const attemptsByOwner = new WeakMap<object, Map<string, Attempt<unknown>>>()

/** Compartilha uma chamada por banco/chave sem deixar o cancelamento de um consumidor cancelar os demais. */
export function sharedAttempt<T>(
  owner: object,
  key: string,
  operation: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(requestAbortError())
  let attempts = attemptsByOwner.get(owner)
  if (!attempts) {
    attempts = new Map()
    attemptsByOwner.set(owner, attempts)
  }
  const map = attempts
  let attempt = map.get(key) as Attempt<T> | undefined
  if (!attempt || attempt.controller.signal.aborted) {
    const created: Attempt<T> = {
      controller: new AbortController(),
      consumers: new Set(),
      promise: Promise.resolve(undefined as T),
      finished: false,
    }
    created.promise = Promise.resolve().then(() => operation(created.controller.signal)).finally(() => {
      created.finished = true
      if (map.get(key) === created) map.delete(key)
    })
    map.set(key, created as Attempt<unknown>)
    attempt = created
  }

  const active = attempt
  const consumer = Symbol()
  active.consumers.add(consumer)
  return new Promise<T>((resolve, reject) => {
    let released = false
    const release = () => {
      if (released) return
      released = true
      signal?.removeEventListener('abort', cancel)
      active.consumers.delete(consumer)
      if (!active.finished && active.consumers.size === 0 && map.get(key) === active) {
        map.delete(key)
        active.controller.abort()
      }
    }
    const cancel = () => {
      release()
      reject(requestAbortError())
    }
    signal?.addEventListener('abort', cancel, { once: true })
    active.promise.then(value => {
      if (released) return
      release()
      resolve(value)
    }, error => {
      if (released) return
      release()
      reject(error)
    })
  })
}
