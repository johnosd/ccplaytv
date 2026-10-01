/**
 * Leitura incremental de um array JSON de objetos (feature 038, `research.md`
 * R0-3). As listagens do Xtream (`get_live_streams`, `get_vod_streams`,
 * `get_series`) são arrays de objetos planos com até ~12 MB: em vez de juntar o
 * texto inteiro e chamar `JSON.parse` uma vez (duas cópias grandes na memória
 * da TV), este leitor entrega **um objeto por vez**, conforme os blocos chegam.
 *
 * Só separa os elementos de primeiro nível pela profundidade das chaves
 * (ignorando chaves dentro de strings e escapes); cada elemento é um
 * `JSON.parse` pequeno. Elemento que não é objeto é ignorado; objeto
 * malformado também (a fonte continua utilizável).
 */

export interface JsonArrayItemParser {
  push(chunk: string): void
  end(): void
}

export function createJsonArrayItemParser(onItem: (item: Record<string, unknown>) => void): JsonArrayItemParser {
  let arrayStarted = false
  let depth = 0 // profundidade dentro do elemento atual (0 = entre elementos)
  let inString = false
  let escaped = false
  let parts: string[] = [] // pedaços do elemento atual vindos de blocos anteriores

  function emit(text: string): void {
    try {
      const value: unknown = JSON.parse(text)
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) onItem(value as Record<string, unknown>)
    } catch {
      // Objeto malformado: pula, nunca derruba a leitura inteira.
    }
  }

  return {
    push(chunk: string) {
      let start = depth > 0 ? 0 : -1 // início do elemento neste bloco
      for (let i = 0; i < chunk.length; i += 1) {
        const ch = chunk.charCodeAt(i)
        if (!arrayStarted) {
          if (ch === 0x5b /* [ */) arrayStarted = true
          continue
        }
        if (inString) {
          if (escaped) escaped = false
          else if (ch === 0x5c /* \ */) escaped = true
          else if (ch === 0x22 /* " */) inString = false
          continue
        }
        if (depth === 0) {
          if (ch === 0x7b /* { */) {
            depth = 1
            start = i
          }
          continue
        }
        if (ch === 0x22) inString = true
        else if (ch === 0x7b || ch === 0x5b) depth += 1
        else if (ch === 0x7d /* } */ || ch === 0x5d /* ] */) {
          depth -= 1
          if (depth === 0) {
            parts.push(chunk.slice(start, i + 1))
            emit(parts.join(''))
            parts = []
            start = -1
          }
        }
      }
      if (depth > 0 && start >= 0) parts.push(chunk.slice(start))
    },
    end() {
      parts = []
    },
  }
}

/**
 * Lê um corpo HTTP em fluxo e entrega cada objeto do array. Respeita o
 * cancelamento: com o sinal abortado, para de ler e lança `AbortError`.
 */
export async function readJsonArrayStream(
  body: ReadableStream<Uint8Array>,
  onItem: (item: Record<string, unknown>) => void,
  signal?: AbortSignal,
  /**
   * Chamado depois de cada pedaço lido (feature 039, T031): a leitura espera a
   * promessa — é onde quem lê descarrega o que acumulou, sem segurar tudo.
   */
  afterChunk?: () => Promise<void>,
): Promise<void> {
  const parser = createJsonArrayItemParser(onItem)
  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Leitura cancelada.', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
      if (afterChunk) await afterChunk()
    }
    parser.push(decoder.decode())
    parser.end()
  } finally {
    reader.releaseLock()
  }
}
