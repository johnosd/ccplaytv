import { describe, expect, it } from 'vitest'
import { classifySample, summarize } from './spikeSummary.mjs'

const base = { played: true, videoBytes: 1000, audioBytes: 500, errKind: null, timedOut: false }

describe('spikeSummary (feature 047, spike)', () => {
  it('classifica vídeo+áudio, parciais, rede, demux e tempo esgotado', () => {
    expect(classifySample(base)).toBe('ok')
    expect(classifySample({ ...base, audioBytes: 0 })).toBe('so-video')
    expect(classifySample({ ...base, played: false, videoBytes: 0 })).toBe('so-audio')
    expect(classifySample({ ...base, played: false, videoBytes: 0, audioBytes: 0, errKind: 'NetworkError' })).toBe('rede')
    expect(classifySample({ ...base, played: false, videoBytes: 0, audioBytes: 0, errKind: 'MediaError' })).toBe('erro-demux')
    expect(classifySample({ ...base, played: false, videoBytes: 0, audioBytes: 0, timedOut: true })).toBe('timeout')
    expect(classifySample({ ...base, played: false, videoBytes: 0, audioBytes: 0 })).toBe('sem-decodificacao')
  })

  it('decide seguir só com mais da metade decodificando e imprime apenas contagens', () => {
    const seguir = summarize(['ok', 'ok', 'ok', 'timeout', 'erro-demux'])
    expect(seguir.verdict).toBe('seguir')
    expect(seguir.lines[0]).toBe('3 de 5 canais amostrados decodificaram vídeo e áudio')

    expect(summarize(['ok', 'rede']).verdict).toBe('parar') // metade exata não é maioria
    expect(summarize([]).verdict).toBe('parar')

    const texto = summarize(['ok', 'rede', 'erro-demux', 'so-video']).lines.join('\n')
    expect(texto).not.toMatch(/https?:|@|\.ts\b|\/live\//) // nada de URL, credencial ou caminho
  })
})
