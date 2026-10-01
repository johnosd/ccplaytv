import { describe, expect, it } from 'vitest'
import { createJsonArrayItemParser, readJsonArrayStream } from './jsonArrayStream'

const SAMPLE = [
  { stream_id: 1, name: 'Canal {Um}', category_id: '10' },
  { stream_id: 2, name: 'Aspas \\"escapadas\\" e \\\\ barra', category_id: '10', extra: { a: [1, 2, { b: '}' }] } },
  { stream_id: 3, name: 'Acentuação — ç ã é', category_id: '11', tags: ['[x]', '{y}'] },
]

function collect(chunks: string[]) {
  const items: Record<string, unknown>[] = []
  const parser = createJsonArrayItemParser((item) => items.push(item))
  for (const chunk of chunks) parser.push(chunk)
  parser.end()
  return items
}

describe('jsonArrayStream (feature 038, R0-3)', () => {
  it('entrega cada objeto do array, igual ao JSON.parse inteiro', () => {
    const text = JSON.stringify(SAMPLE)
    expect(collect([text])).toEqual(SAMPLE)
  })

  it('funciona com o texto cortado em qualquer ponto (inclusive dentro de string e escape)', () => {
    const text = JSON.stringify(SAMPLE)
    for (let size = 1; size <= 17; size += 1) {
      const chunks = []
      for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
      expect(collect(chunks)).toEqual(SAMPLE)
    }
  })

  it('ignora elementos que não são objetos e objetos malformados', () => {
    expect(collect(['[1, "x", null, {"ok": true}, {"quebrado": }, {"b": 2}]'])).toEqual([{ ok: true }, { b: 2 }])
  })

  it('array vazio ou resposta que não é array: nada', () => {
    expect(collect(['[]'])).toEqual([])
    expect(collect(['{"user_info": {"auth": 0}}'])).toEqual([])
  })

  it('lê um corpo em fluxo (bytes UTF-8 cortados no meio de um caractere)', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(SAMPLE))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 5) controller.enqueue(bytes.slice(i, i + 5))
        controller.close()
      },
    })
    const items: Record<string, unknown>[] = []
    await readJsonArrayStream(body, (item) => items.push(item))
    expect(items).toEqual(SAMPLE)
  })

  it('cancelado: para de ler com AbortError', async () => {
    const controller = new AbortController()
    controller.abort()
    const body = new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(new TextEncoder().encode('[{"a":1}]')) })
    await expect(readJsonArrayStream(body, () => {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
