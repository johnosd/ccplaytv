import { createRatedSelectionAccumulator, type FeaturedRatedOptions, type RatedFields } from './ratedSelection'

export interface RatedSelectionScheduling {
  /** Agenda uma tarefa de macrotask/quadros; não use apenas Promise.resolve(). */
  yieldControl?: () => Promise<void>
  batchSize?: number
  signal?: AbortSignal
}

function cancelled(): Error {
  return new DOMException('Seleção cancelada.', 'AbortError')
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw cancelled()
}

/** Seleção equivalente com pausas cooperativas entre lotes e fases custosas. */
export async function selectFeaturedRatedAsync<T>(
  items: Iterable<T> | AsyncIterable<T>,
  read: RatedFields<T>,
  options: FeaturedRatedOptions,
  scheduling: RatedSelectionScheduling = {},
): Promise<{ picked: T[]; eligibleCount: number }> {
  const signal = scheduling.signal
  // O canal só existe durante um cálculo. Não deixa handles nem trabalho no carregamento do módulo.
  const channel = scheduling.yieldControl === undefined && typeof MessageChannel !== 'undefined' ? new MessageChannel() : undefined
  const yieldControl = scheduling.yieldControl ?? (() => new Promise<void>((resolve) => {
    if (channel) {
      channel.port1.onmessage = () => resolve()
      channel.port2.postMessage(null)
    } else setTimeout(resolve, 0)
  }))
  const requestedBatch = scheduling.batchSize ?? 256
  const batchSize = Number.isFinite(requestedBatch) ? Math.max(1, Math.floor(requestedBatch)) : 256
  const accumulator = createRatedSelectionAccumulator(read, options)
  let count = 0
  const pause = async (): Promise<void> => {
    throwIfAborted(signal)
    await yieldControl()
    throwIfAborted(signal)
  }
  const consume = (item: T): void => {
    throwIfAborted(signal)
    accumulator.add(item)
    count += 1
  }
  try {
    throwIfAborted(signal)
    if (typeof (items as AsyncIterable<T>)[Symbol.asyncIterator] === 'function') {
      for await (const item of items as AsyncIterable<T>) {
        consume(item)
        if (count % batchSize === 0) await pause()
      }
    } else {
      for (const item of items as Iterable<T>) {
        consume(item)
        if (count % batchSize === 0) await pause()
      }
    }
    if (count > 0 && count % batchSize !== 0) await pause()
    throwIfAborted(signal)
    const steps = accumulator.finishSteps(batchSize)
    let step = steps.next()
    while (!step.done) {
      await pause()
      step = steps.next()
    }
    return step.value
  } finally {
    channel?.port1.close()
    channel?.port2.close()
  }
}
