import { describe, it, expect } from 'vitest'
import {
  mediaCapabilities,
  resolveCapabilities,
  type EngineCapabilities,
  type PlayableKind,
} from './capabilities'

describe('mediaCapabilities', () => {
  it('canal ao vivo não permite nada', () => {
    expect(mediaCapabilities('channel')).toEqual({
      canPause: false,
      canSeek: false,
      reportsPosition: false,
      reportsDuration: false,
    })
  })

  it('filme permite tudo', () => {
    expect(mediaCapabilities('movie')).toEqual({
      canPause: true,
      canSeek: true,
      reportsPosition: true,
      reportsDuration: true,
    })
  })

  it('episódio permite tudo, como filme — o contrato não muda quando séries chegar', () => {
    expect(mediaCapabilities('episode')).toEqual(mediaCapabilities('movie'))
  })

  it('série não é reproduzível diretamente: tudo falso, sem lançar', () => {
    expect(() => mediaCapabilities('series')).not.toThrow()
    expect(mediaCapabilities('series')).toEqual({
      canPause: false,
      canSeek: false,
      reportsPosition: false,
      reportsDuration: false,
    })
  })

  it('item não classificado: tudo falso, sem lançar', () => {
    expect(() => mediaCapabilities('unclassified')).not.toThrow()
    expect(mediaCapabilities('unclassified')).toEqual({
      canPause: false,
      canSeek: false,
      reportsPosition: false,
      reportsDuration: false,
    })
  })
})

describe('resolveCapabilities', () => {
  const engineFull: EngineCapabilities = {
    canPause: true,
    canSeek: true,
    reportsPosition: true,
    reportsDuration: true,
  }

  it('motor que sabe buscar, mas mídia ao vivo, não pode buscar', () => {
    // É a interseção que existe pra impedir a Live TV de ganhar barra de
    // busca por acaso: o motor tem a capacidade, a mídia não permite.
    const resolved = resolveCapabilities(engineFull, 'channel')
    expect(resolved.canSeek).toBe(false)
    expect(resolved.canPause).toBe(false)
    expect(resolved.reportsPosition).toBe(false)
    expect(resolved.reportsDuration).toBe(false)
  })

  it('motor que sabe tudo, mídia filme, resolve tudo permitido', () => {
    expect(resolveCapabilities(engineFull, 'movie')).toEqual({
      canPause: true,
      canSeek: true,
      reportsPosition: true,
      reportsDuration: true,
    })
  })

  it('motor degradado (sem busca) limita mesmo um filme', () => {
    const engineNoSeek: EngineCapabilities = { ...engineFull, canSeek: false }
    const resolved = resolveCapabilities(engineNoSeek, 'movie')
    expect(resolved.canSeek).toBe(false)
    expect(resolved.canPause).toBe(true)
  })

  it('cada kind resolvido contra o motor completo bate com mediaCapabilities', () => {
    const kinds: PlayableKind[] = ['channel', 'movie', 'episode', 'series', 'unclassified']
    for (const kind of kinds) {
      expect(resolveCapabilities(engineFull, kind)).toEqual(mediaCapabilities(kind))
    }
  })
})
