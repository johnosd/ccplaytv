/**
 * Corpo HTTP do XMLTV → pedaços de texto (feature 030,
 * `logic/sincronizacao-epg.md` §3).
 *
 * Gzip é decidido **pelo conteúdo** (os dois primeiros bytes `1f 8b`), nunca
 * pela extensão (FR-002) — e `Content-Encoding: gzip` de transporte não
 * conta: o `fetch` já entrega o corpo descomprimido nesse caso (research
 * R2/R4). A descompressão é por fluxo (`DecompressionStream`, presente no
 * Chromium 108 do alvo, R-007).
 */
import type { EpgErrorKind } from '../catalog/db'

/** Falha já categorizada de uma sincronização — nunca carrega mensagem da rede. */
export class EpgFailure extends Error {
  kind: EpgErrorKind
  constructor(kind: EpgErrorKind) {
    super(`EPG: ${kind}`)
    this.name = 'EpgFailure'
    this.kind = kind
  }
}

const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

/** Quanto texto se aceita esperar até achar `<tv` antes de dar o corpo como "não é XMLTV". */
const ROOT_SEARCH_LIMIT = 64 * 1024
const TV_ROOT = /<tv[\s>]/

async function* decodeReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  firstValue?: Uint8Array,
): AsyncGenerator<string> {
  if (firstValue !== undefined) yield decoder.decode(firstValue, { stream: true })
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    yield decoder.decode(value, { stream: true })
  }
  const tail = decoder.decode()
  if (tail !== '') yield tail
}

/**
 * Lê o corpo em pedaços de texto sem nunca ter o arquivo inteiro na memória.
 * O decodificador é `stream: true` de propósito (caractere multibyte partido
 * entre dois pedaços) — mesmo cuidado de `linesFromResponse` (`m3uParser.ts`).
 */
export async function* textChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  try {
    const first = await reader.read()
    if (first.done) return
    const isGzip = first.value.length >= 2 && first.value[0] === GZIP_MAGIC_0 && first.value[1] === GZIP_MAGIC_1

    if (!isGzip) {
      yield* decodeReader(reader, decoder, first.value)
      return
    }

    // Reemite o primeiro pedaço já lido e segue com o resto, por dentro do descompressor.
    const rest = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(first.value)
      },
      async pull(controller) {
        const next = await reader.read()
        if (next.done) controller.close()
        else controller.enqueue(next.value)
      },
      cancel(reason) {
        return reader.cancel(reason)
      },
    })
    const inflated = rest.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
    const inflatedReader = inflated.getReader()
    try {
      yield* decodeReader(inflatedReader, decoder)
    } finally {
      await inflatedReader.cancel().catch(() => {
        // Já encerrado ou com erro próprio: nada a cancelar.
      })
    }
  } finally {
    // Abandonar no meio (erro de leitura/gravação) tem que soltar a conexão —
    // `releaseLock` sozinho deixaria o corpo continuar chegando.
    await reader.cancel().catch(() => {
      // Fluxo já encerrado.
    })
  }
}

/**
 * Recusa cedo um corpo que não é XMLTV (ex.: uma página HTML de erro do
 * painel): o primeiro conteúdo útil precisa conter `<tv`. Nada é lido além
 * disso antes de decidir, e nada é gravado.
 */
export async function* requireXmltvRoot(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  let head = ''
  let verified = false
  for await (const chunk of chunks) {
    if (verified) {
      yield chunk
      continue
    }
    head += chunk
    if (TV_ROOT.test(head)) {
      verified = true
      yield head
      head = ''
    } else if (head.length > ROOT_SEARCH_LIMIT) {
      throw new EpgFailure('not_xmltv')
    }
  }
  if (!verified) throw new EpgFailure('not_xmltv')
}
