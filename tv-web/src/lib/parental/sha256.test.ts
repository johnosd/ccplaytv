import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'

const bytes = (text: string) => new TextEncoder().encode(text)

async function subtleHex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('sha256Hex (feature 066, reserva do PIN)', () => {
  it('bate com os vetores do FIPS 180-2', () => {
    expect(sha256Hex(bytes(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex(bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex(bytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('dá o mesmo resultado do crypto.subtle em tamanhos ao redor do bloco e com acentos', async () => {
    for (const length of [1, 55, 56, 63, 64, 65, 200]) {
      const data = bytes('ç'.repeat(length))
      expect(sha256Hex(data)).toBe(await subtleHex(data))
    }
  })
})
