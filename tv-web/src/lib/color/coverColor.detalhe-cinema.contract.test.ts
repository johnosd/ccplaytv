/**
 * Contrato da feature 059 (detalhe Cinema) — travado em
 * `sdd/specs/059-detalhe-cinema-filme-serie/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/cor-da-capa.md` §2.
 */
import { describe, expect, it } from 'vitest'
import { dominantColorFromPixels } from './coverColor'

/** `count` pixels RGBA iguais. */
function pixels(...groups: Array<[count: number, rgba: [number, number, number, number]]>): Uint8ClampedArray {
  const out: number[] = []
  for (const [count, rgba] of groups) for (let i = 0; i < count; i++) out.push(...rgba)
  return new Uint8ClampedArray(out)
}

function parse(color: string | null): { r: number; g: number; b: number; lightness: number } {
  const match = /^rgb\((\d{1,3}), (\d{1,3}), (\d{1,3})\)$/.exec(color ?? '')
  if (!match) throw new Error(`cor fora do formato rgb(r, g, b): ${String(color)}`)
  const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return { r, g, b, lightness: (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255 }
}

describe('dominantColorFromPixels — contrato da feature 059', () => {
  // FR-002 (cor da capa com fallback neutro), SC-001 (texto legível sobre o fundo)
  it('ignora transparente, preto e branco; capa sem cor útil dá null; a cor devolvida mantém o matiz e fica escura o bastante para o texto', () => {
    expect(dominantColorFromPixels(pixels([100, [0, 0, 0, 255]]))).toBeNull()
    expect(dominantColorFromPixels(pixels([100, [255, 0, 0, 0]]))).toBeNull()
    expect(dominantColorFromPixels(pixels([100, [255, 255, 255, 255]]))).toBeNull()
    expect(dominantColorFromPixels(pixels([100, [128, 128, 128, 255]]))).toBeNull() // cinza: sem matiz
    expect(dominantColorFromPixels(pixels([95, [0, 0, 0, 255]], [5, [255, 0, 0, 255]]))).toBeNull() // menos de 10% útil

    const red = parse(dominantColorFromPixels(pixels([80, [255, 0, 0, 255]], [20, [0, 0, 0, 255]])))
    expect(red.r).toBeGreaterThan(150)
    expect(red.g).toBeLessThan(20)
    expect(red.b).toBeLessThan(20)
    expect(red.lightness).toBeGreaterThanOrEqual(0.27)
    expect(red.lightness).toBeLessThanOrEqual(0.43)

    const pastel = parse(dominantColorFromPixels(pixels([100, [250, 200, 200, 255]])))
    expect(pastel.r).toBeGreaterThan(pastel.g)
    expect(pastel.lightness).toBeLessThanOrEqual(0.43)

    const navy = parse(dominantColorFromPixels(pixels([100, [10, 20, 60, 255]])))
    expect(navy.b).toBeGreaterThan(navy.r)
    expect(navy.lightness).toBeGreaterThanOrEqual(0.27)
  })
})
