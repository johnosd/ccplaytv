import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { EpgFailure, requireXmltvRoot, textChunks } from './epgFetch'

function bodyOf(bytes: Uint8Array, chunkSize = bytes.length): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize))
      offset += chunkSize
    },
  })
}

async function readAll(chunks: AsyncIterable<string>): Promise<string> {
  let text = ''
  for await (const chunk of chunks) text += chunk
  return text
}

const XML = '<?xml version="1.0"?><tv><programme channel="a"><title>Olá, ação — é</title></programme></tv>'

describe('textChunks (FR-002/FR-003)', () => {
  it('XML puro: decodifica sem corromper acento partido entre pedaços', async () => {
    const bytes = new TextEncoder().encode(XML)
    // Pedaços de 3 bytes cortam caracteres multibyte no meio.
    expect(await readAll(textChunks(bodyOf(bytes, 3)))).toBe(XML)
  })

  it('gzip reconhecido pelo conteúdo, mesmo sem extensão nem cabeçalho', async () => {
    const bytes = new Uint8Array(gzipSync(Buffer.from(XML)))
    expect(bytes[0]).toBe(0x1f)
    expect(await readAll(textChunks(bodyOf(bytes, 20)))).toBe(XML)
  })

  it('corpo que já chegou descomprimido (Content-Encoding de transporte) segue como texto', async () => {
    expect(await readAll(textChunks(bodyOf(new TextEncoder().encode(XML))))).toBe(XML)
  })

  it('corpo vazio não emite nada', async () => {
    expect(await readAll(textChunks(bodyOf(new Uint8Array(0))))).toBe('')
  })

  it('gzip corrompido falha em vez de gravar lixo', async () => {
    const bytes = new Uint8Array(gzipSync(Buffer.from(XML)))
    const corrupted = bytes.slice(0, 12)
    await expect(readAll(textChunks(bodyOf(corrupted)))).rejects.toBeDefined()
  })
})

async function* fromStrings(...parts: string[]): AsyncGenerator<string> {
  for (const part of parts) yield part
}

describe('requireXmltvRoot', () => {
  it('deixa passar um XMLTV, inclusive com a raiz partida entre pedaços', async () => {
    expect(await readAll(requireXmltvRoot(fromStrings('<?xml?><t', 'v><programme/></tv>')))).toBe('<?xml?><tv><programme/></tv>')
  })

  it('recusa uma página HTML de erro como not_xmltv, sem repassar nada', async () => {
    const consumed: string[] = []
    const run = async () => {
      for await (const chunk of requireXmltvRoot(fromStrings('<html><body>403 Forbidden</body></html>'))) consumed.push(chunk)
    }
    await expect(run()).rejects.toMatchObject({ kind: 'not_xmltv' })
    expect(consumed).toEqual([])
    await expect(run()).rejects.toBeInstanceOf(EpgFailure)
  })

  it('corpo vazio também é not_xmltv', async () => {
    await expect(readAll(requireXmltvRoot(fromStrings()))).rejects.toMatchObject({ kind: 'not_xmltv' })
  })
})
