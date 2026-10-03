import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translate'
import { buildTrailerCandidates, trailerButtonLabel, type TrailerVideoRef } from './trailerCandidates'

/** Feature 054, Fase 11 (US3): o trailer segue o idioma do app, com fallback en → qualquer um (SC-004). */

const ref = (videoId: string, language: string | undefined, extra: Partial<TrailerVideoRef> = {}): TrailerVideoRef => ({
  videoId,
  kind: 'trailer',
  official: true,
  ...(language ? { language } : {}),
  ...extra,
})

const ES = 'aaaaaaaaaaa'
const EN = 'bbbbbbbbbbb'
const PT = 'ccccccccccc'
const JA = 'ddddddddddd'

describe('ordem dos trailers por idioma do app (feature 054)', () => {
  const all = [ref(JA, 'ja'), ref(PT, 'pt'), ref(EN, 'en'), ref(ES, 'es')]

  it('app em espanhol: es primeiro, depois en, depois o resto', () => {
    expect(buildTrailerCandidates(undefined, all, 'es').map((c) => c.videoId)).toEqual([ES, EN, JA, PT])
  })

  it('app em inglês: en primeiro (o idioma e o fallback coincidem)', () => {
    expect(buildTrailerCandidates(undefined, all, 'en')[0].videoId).toBe(EN)
  })

  it('sem trailer no idioma do app: cai para inglês e, sem inglês, para o que existir — nunca fica sem botão', () => {
    const noEs = [ref(JA, 'ja'), ref(EN, 'en')]
    expect(buildTrailerCandidates(undefined, noEs, 'es').map((c) => c.videoId)).toEqual([EN, JA])

    const onlyJa = buildTrailerCandidates(undefined, [ref(JA, 'ja')], 'es')
    expect(onlyJa).toHaveLength(1)
    expect(trailerButtonLabel(onlyJa[0], createTranslator('es'))).toMatch(/^▶ /)
  })

  it('o trailer do provedor continua primeiro, em qualquer idioma', () => {
    const provider = [ref('eeeeeeeeeee', undefined)]
    expect(buildTrailerCandidates(provider, all, 'es')[0].videoId).toBe('eeeeeeeeeee')
  })
})

describe('rótulo do botão de trailer por idioma do app (feature 054)', () => {
  const candidate = (language: string | undefined) => buildTrailerCandidates(undefined, [ref(EN, language)], 'es')[0]

  it('idioma diferente do app aparece, com o nome no idioma do app (fallback visível)', () => {
    expect(trailerButtonLabel(candidate('en'), createTranslator('es'))).toBe('▶ Tráiler · Inglés')
    expect(trailerButtonLabel(candidate('en'), createTranslator('pt'))).toBe('▶ Trailer · Inglês')
  })

  it('idioma igual ao do app, ou desconhecido, não leva sufixo', () => {
    expect(trailerButtonLabel(candidate('es'), createTranslator('es'))).toBe('▶ Tráiler')
    expect(trailerButtonLabel(candidate(undefined), createTranslator('es'))).toBe('▶ Tráiler')
  })

  it('o mesmo trailer em inglês, com o app em inglês, não leva sufixo; em português leva', () => {
    expect(trailerButtonLabel(candidate('en'), createTranslator('en'))).toBe('▶ Trailer')
    expect(trailerButtonLabel(candidate('pt'), createTranslator('en'))).toBe('▶ Trailer · Portuguese')
  })
})
