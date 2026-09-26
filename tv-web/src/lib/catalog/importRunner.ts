/**
 * Escolhe onde a importação roda e apresenta a mesma forma nos dois casos.
 *
 * Existe por causa do risco R-002: o pacote Tizen lista arquivos
 * explicitamente, e um Worker que não entre no `.wgt` falha **só na TV** —
 * passa no navegador e nos testes. Aqui, se o Worker não puder ser criado,
 * a importação continua na thread principal (plano B de research.md R4),
 * mais lenta porém funcional, em vez de a tela simplesmente não abrir.
 *
 * Quem chama não sabe qual caminho foi usado: recebe o mesmo `ImportHandle`
 * que o pipeline devolve.
 */

import { startImport, type ImportHandle, type ImportOptions } from './importPipeline'
import type { ImportRunRecord } from './db'
import type { WorkerResponse } from './importWorker'

export interface RunnerOptions extends Pick<ImportOptions, 'onProgress' | 'batchSize'> {
  /** Força a thread principal — usado em teste e no plano B. */
  mainThread?: boolean
}

export interface ImportRun extends ImportHandle {
  /** Qual caminho foi de fato usado, para a medição da US1 poder registrar. */
  ranInWorker: boolean
}

function createWorker(): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined
  try {
    // A URL relativa com `import.meta.url` é o que permite ao empacotador
    // emitir o arquivo do Worker como um recurso próprio.
    return new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' })
  } catch {
    return undefined
  }
}

export async function runImport(
  sourceId: string,
  options: RunnerOptions = {},
): Promise<ImportRun> {
  const worker = options.mainThread ? undefined : createWorker()
  if (!worker) {
    const handle = await startImport(sourceId, options)
    return { ...handle, ranInWorker: false }
  }

  return new Promise<ImportRun>((resolve, reject) => {
    let settled = false
    let finish: (run: ImportRunRecord) => void = () => {}
    let abort: (error: Error) => void = () => {}
    const completion = new Promise<ImportRunRecord>((done, fail) => {
      finish = done
      abort = fail
    })

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'started' && !settled) {
        settled = true
        resolve({
          runId: message.runId,
          cancel: () => worker.postMessage({ type: 'cancel' }),
          completion,
          ranInWorker: true,
        })
        return
      }
      if (message.type === 'progress') {
        options.onProgress?.(message.run)
        return
      }
      if (message.type === 'done') {
        finish(message.run)
        worker.terminate()
        return
      }
      if (message.type === 'error') {
        const error = new Error(`Importação falhou no Worker (${message.name}).`)
        if (settled) abort(error)
        else reject(error)
        worker.terminate()
      }
    }

    worker.onerror = () => {
      // O Worker nem chegou a rodar — provavelmente não entrou no pacote.
      // Cair para a thread principal aqui é o que torna R-002 recuperável
      // em campo, em vez de uma tela morta.
      worker.terminate()
      if (settled) {
        abort(new Error('Worker de importação indisponível.'))
        return
      }
      settled = true
      startImport(sourceId, options).then(
        (handle) => resolve({ ...handle, ranInWorker: false }),
        reject,
      )
    }

    worker.postMessage({ type: 'start', sourceId, batchSize: options.batchSize })
  })
}
