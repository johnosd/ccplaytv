import { describe, expect, it } from 'vitest'
import {
  MAX_TRAILER_CANDIDATES,
  buildTrailerCandidates,
  isYoutubeVideoId,
  trailerButtonLabel,
  trailerRefsFromTmdbVideos,
} from './trailerCandidates'

describe('isYoutubeVideoId', () => {
  it('aceita 11 caracteres [A-Za-z0-9_-] e nada mais', () => {
    expect(isYoutubeVideoId('M7lc1UVf-VE')).toBe(true)
    expect(isYoutubeVideoId('abc_DEF-123')).toBe(true)
    expect(isYoutubeVideoId('curto')).toBe(false)
    expect(isYoutubeVideoId('doze-chars-12')).toBe(false)
    expect(isYoutubeVideoId('espaco aqui')).toBe(false)
    expect(isYoutubeVideoId(undefined)).toBe(false)
    expect(isYoutubeVideoId(12345678901)).toBe(false)
  })
})

describe('trailerRefsFromTmdbVideos', () => {
  it('forma inesperada vira lista vazia, nunca erro', () => {
    expect(trailerRefsFromTmdbVideos(undefined)).toEqual([])
    expect(trailerRefsFromTmdbVideos(null)).toEqual([])
    expect(trailerRefsFromTmdbVideos('x')).toEqual([])
    expect(trailerRefsFromTmdbVideos({})).toEqual([])
    expect(trailerRefsFromTmdbVideos({ results: 'x' })).toEqual([])
    expect(trailerRefsFromTmdbVideos({ results: [null, 1, 'x', {}] })).toEqual([])
  })

  it('idioma ausente ou vazio fica sem language; official só se for boolean', () => {
    const refs = trailerRefsFromTmdbVideos({
      results: [
        { site: 'YouTube', type: 'Trailer', key: 'aaaaaaaaaaa', iso_639_1: '', official: 'sim' },
        { site: 'YouTube', type: 'Teaser', key: 'bbbbbbbbbbb', official: false },
      ],
    })
    expect(refs).toEqual([
      { videoId: 'aaaaaaaaaaa', kind: 'trailer' },
      { videoId: 'bbbbbbbbbbb', kind: 'teaser', official: false },
    ])
  })
})

describe('buildTrailerCandidates', () => {
  it('só o provedor: mantém a origem provider', () => {
    expect(buildTrailerCandidates([{ videoId: 'provTrail01', kind: 'trailer' }], undefined)).toEqual([
      { videoId: 'provTrail01', kind: 'trailer', origin: 'provider' },
    ])
  })

  it('só o TMDB: ordena e marca a origem tmdb', () => {
    const result = buildTrailerCandidates(undefined, [
      { videoId: 'enTrailer01', kind: 'trailer', language: 'en' },
      { videoId: 'ptTrailer01', kind: 'trailer', language: 'pt' },
    ])
    expect(result.map((c) => [c.videoId, c.origin])).toEqual([
      ['ptTrailer01', 'tmdb'],
      ['enTrailer01', 'tmdb'],
    ])
  })

  it('oficial vem antes do idioma: o oficial em inglês passa o não oficial em português (R-012)', () => {
    const result = buildTrailerCandidates(undefined, [
      { videoId: 'ptAgregador', kind: 'trailer', language: 'pt', official: false },
      { videoId: 'enDistribui', kind: 'trailer', language: 'en', official: true },
      { videoId: 'ptDistribui', kind: 'trailer', language: 'pt', official: true },
    ])
    expect(result.map((c) => c.videoId)).toEqual(['ptDistribui', 'enDistribui', 'ptAgregador'])
  })

  it('idioma preferido vence entre oficiais; sem ele, cai no inglês e depois em qualquer outro', () => {
    const refs = [
      { videoId: 'frOficial01', kind: 'trailer' as const, language: 'fr', official: true },
      { videoId: 'enOficial01', kind: 'trailer' as const, language: 'en', official: true },
      { videoId: 'esOficial01', kind: 'trailer' as const, language: 'es', official: true },
    ]
    expect(buildTrailerCandidates(undefined, refs, 'es').map((c) => c.videoId)).toEqual([
      'esOficial01',
      'enOficial01',
      'frOficial01',
    ])
    expect(buildTrailerCandidates(undefined, refs, 'de').map((c) => c.videoId)).toEqual([
      'enOficial01',
      'frOficial01',
      'esOficial01',
    ])
  })

  it('app em pt: pt-BR > inglês > pt de outra região; oficial continua antes do idioma (R-012)', () => {
    const result = buildTrailerCandidates(undefined, [
      { videoId: 'ptPortugal1', kind: 'trailer', language: 'pt', region: 'PT', official: true },
      { videoId: 'enOficial01', kind: 'trailer', language: 'en', region: 'US', official: true },
      { videoId: 'ptBrasil001', kind: 'trailer', language: 'pt', region: 'BR', official: true },
      { videoId: 'ptBrAgregad', kind: 'trailer', language: 'pt', region: 'BR', official: false },
    ])
    expect(result.map((c) => c.videoId)).toEqual(['ptBrasil001', 'enOficial01', 'ptPortugal1', 'ptBrAgregad'])
  })

  it('sem pt-BR, o pt-PT ainda fica na lista (atrás do inglês) — a região nunca tira trailer', () => {
    expect(buildTrailerCandidates(undefined, [{ videoId: 'ptPortugal1', kind: 'trailer', language: 'pt', region: 'PT' }]).map((c) => c.videoId)).toEqual([
      'ptPortugal1',
    ])
  })

  it('empate mantém a ordem em que o TMDB entregou', () => {
    const result = buildTrailerCandidates(undefined, [
      { videoId: 'zzzzzzzzzzz', kind: 'trailer', language: 'en' },
      { videoId: 'aaaaaaaaaaa', kind: 'trailer', language: 'en' },
    ])
    expect(result.map((c) => c.videoId)).toEqual(['zzzzzzzzzzz', 'aaaaaaaaaaa'])
  })

  it('corta em MAX_TRAILER_CANDIDATES', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ videoId: `video${String(i).padStart(6, '0')}`, kind: 'trailer' as const }))
    expect(buildTrailerCandidates(undefined, many)).toHaveLength(MAX_TRAILER_CANDIDATES)
  })

  it('o mesmo vídeo vindo das duas fontes fica com a origem provider', () => {
    const result = buildTrailerCandidates([{ videoId: 'sameVideo01', kind: 'trailer' }], [{ videoId: 'sameVideo01', kind: 'trailer', language: 'pt' }])
    expect(result).toHaveLength(1)
    expect(result[0].origin).toBe('provider')
  })
})

describe('trailerButtonLabel', () => {
  it('idioma desconhecido ou português não aparece; código sem nome conhecido cai no código', () => {
    expect(trailerButtonLabel({ videoId: 'aaaaaaaaaaa', kind: 'trailer', origin: 'tmdb' })).toBe('▶ Trailer')
    expect(trailerButtonLabel({ videoId: 'aaaaaaaaaaa', kind: 'trailer', language: 'pt', origin: 'tmdb' })).toBe('▶ Trailer')
    expect(trailerButtonLabel({ videoId: 'aaaaaaaaaaa', kind: 'trailer', language: 'zz', origin: 'tmdb' })).toMatch(/^▶ Trailer · /)
  })

  it('português de outra região leva o país; pt-BR não leva sufixo', () => {
    expect(trailerButtonLabel({ videoId: 'aaaaaaaaaaa', kind: 'trailer', language: 'pt', region: 'BR', origin: 'tmdb' })).toBe('▶ Trailer')
    expect(trailerButtonLabel({ videoId: 'aaaaaaaaaaa', kind: 'trailer', language: 'pt', region: 'PT', origin: 'tmdb' })).toBe(
      '▶ Trailer · Português (Portugal)',
    )
  })

  it('trailerRefsFromTmdbVideos guarda a região (iso_3166_1)', () => {
    expect(trailerRefsFromTmdbVideos({ results: [{ site: 'YouTube', type: 'Trailer', key: 'aaaaaaaaaaa', iso_639_1: 'pt', iso_3166_1: 'BR' }] })).toEqual([
      { videoId: 'aaaaaaaaaaa', kind: 'trailer', language: 'pt', region: 'BR' },
    ])
  })
})
