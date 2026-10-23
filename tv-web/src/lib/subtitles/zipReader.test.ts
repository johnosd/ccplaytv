import { describe, expect, it } from 'vitest'
import { SubtitleError } from './types'
import { decodeSubtitleText, extractSubtitleFromZip, MAX_TEXT_BYTES } from './zipReader'

const enc = new TextEncoder()

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

interface FileSpec {
  name: string
  data: Uint8Array
  /** `0` = store; padrão `8` = deflate. */
  method?: 0 | 8
  /** Tamanho declarado (para simular um ZIP que mente). */
  declaredSize?: number
  flags?: number
}

/** ZIP mínimo sem CRC (o leitor não o confere) — o suficiente para exercitar o diretório central. */
async function zipOf(files: FileSpec[], { zip64 = false }: { zip64?: boolean } = {}): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const method = file.method ?? 8
    const body = method === 8 ? await deflateRaw(file.data) : file.data
    const name = enc.encode(file.name)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(6, file.flags ?? 0, true)
    lv.setUint16(8, method, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, file.declaredSize ?? file.data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    const header = new Uint8Array(46 + name.length)
    const hv = new DataView(header.buffer)
    hv.setUint32(0, 0x02014b50, true)
    hv.setUint16(8, file.flags ?? 0, true)
    hv.setUint16(10, method, true)
    hv.setUint32(20, body.length, true)
    hv.setUint32(24, file.declaredSize ?? file.data.length, true)
    hv.setUint16(28, name.length, true)
    hv.setUint32(42, offset, true)
    header.set(name, 46)
    parts.push(local, body)
    central.push(header)
    offset += local.length + body.length
  }
  const centralSize = central.reduce((sum, row) => sum + row.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, zip64 ? 0xffff : files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + 22)
  let at = 0
  for (const row of [...parts, ...central, end]) {
    out.set(row, at)
    at += row.length
  }
  return out
}

const SRT = '1\n00:00:01,000 --> 00:00:02,000\nOlá, ação!\n'
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('extractSubtitleFromZip — mesma regra do serviço (D-015)', () => {
  it('filme: o único SRT, deflate ou store', async () => {
    expect(text(await extractSubtitleFromZip(await zipOf([{ name: 'filme.srt', data: enc.encode(SRT) }])))).toBe(SRT)
    expect(text(await extractSubtitleFromZip(await zipOf([{ name: 'filme.vtt', data: enc.encode(SRT), method: 0 }])))).toBe(SRT)
  })

  it('pacote de temporada: escolhe exatamente o arquivo do episódio; sem casar (ou ambíguo) é ilegível', async () => {
    const pack = await zipOf([
      { name: 'Serie.S01E01.srt', data: enc.encode('um') },
      { name: 'Serie.S01E02.srt', data: enc.encode('dois') },
      { name: 'Serie.S01E03.srt', data: enc.encode('tres') },
    ])
    expect(text(await extractSubtitleFromZip(pack, { season: 1, episode: 2 }))).toBe('dois')
    await expect(extractSubtitleFromZip(pack, { season: 1, episode: 9 })).rejects.toMatchObject({ code: 'unreadable' })
    const twice = await zipOf([
      { name: 'a.S01E02.srt', data: enc.encode('x') },
      { name: 'b.1x02.srt', data: enc.encode('y') },
    ])
    await expect(extractSubtitleFromZip(twice, { season: 1, episode: 2 })).rejects.toMatchObject({ code: 'unreadable' })
    // S01E021 não é o episódio 2.
    const near = await zipOf([
      { name: 'S01E021.srt', data: enc.encode('x') },
      { name: 'S01E03.srt', data: enc.encode('y') },
    ])
    await expect(extractSubtitleFromZip(near, { season: 1, episode: 2 })).rejects.toMatchObject({ code: 'unreadable' })
  })

  it('só .ass (ou nada legível) é ilegível; arquivo cifrado é ignorado', async () => {
    await expect(extractSubtitleFromZip(await zipOf([{ name: 'filme.ass', data: enc.encode(SRT) }]))).rejects.toBeInstanceOf(SubtitleError)
    await expect(
      extractSubtitleFromZip(await zipOf([{ name: 'filme.srt', data: enc.encode(SRT), flags: 1 }])),
    ).rejects.toMatchObject({ code: 'unreadable' })
  })

  it('caminho com ../ só conta o nome-base e nunca sai do arquivo', async () => {
    const zip = await zipOf([{ name: '../../evil.srt', data: enc.encode(SRT) }])
    expect(text(await extractSubtitleFromZip(zip))).toBe(SRT)
  })

  it('bomba: tamanho declarado grande, declarado pequeno que mente, e entradas demais', async () => {
    const big = new Uint8Array(MAX_TEXT_BYTES + 10)
    await expect(extractSubtitleFromZip(await zipOf([{ name: 'a.srt', data: big }]))).rejects.toMatchObject({ code: 'unreadable' })
    // Declara 100 bytes, mas inflaria acima do teto: o contador real aborta.
    await expect(
      extractSubtitleFromZip(await zipOf([{ name: 'a.srt', data: big, declaredSize: 100 }])),
    ).rejects.toMatchObject({ code: 'unreadable' })
    const many = await zipOf(Array.from({ length: 51 }, (_, i) => ({ name: `f${i}.srt`, data: enc.encode('x') })))
    await expect(extractSubtitleFromZip(many)).rejects.toMatchObject({ code: 'unreadable' })
  })

  it('ZIP64 e lixo que não é ZIP são recusados', async () => {
    await expect(extractSubtitleFromZip(await zipOf([{ name: 'a.srt', data: enc.encode(SRT) }], { zip64: true }))).rejects.toMatchObject({
      code: 'unreadable',
    })
    await expect(extractSubtitleFromZip(enc.encode('isto não é um zip'))).rejects.toMatchObject({ code: 'unreadable' })
  })
})

describe('decodeSubtitleText — UTF-8, cp1252, ilegível', () => {
  it('UTF-8 com e sem BOM', () => {
    expect(decodeSubtitleText(enc.encode('Olá'))).toBe('Olá')
    expect(decodeSubtitleText(new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode('Olá')]))).toBe('Olá')
  })

  it('cp1252 quando não é UTF-8; byte indefinido no cp1252 é ilegível', () => {
    expect(decodeSubtitleText(new Uint8Array([0x61, 0xe7, 0xe3, 0x6f]))).toBe('ação')
    expect(() => decodeSubtitleText(new Uint8Array([0x61, 0x81, 0xe7]))).toThrow(SubtitleError)
  })

  it('vazio e acima de 1 MiB são ilegíveis', () => {
    expect(() => decodeSubtitleText(enc.encode('   \n'))).toThrow(SubtitleError)
    expect(() => decodeSubtitleText(new Uint8Array(MAX_TEXT_BYTES + 1).fill(0x61))).toThrow(SubtitleError)
  })
})
