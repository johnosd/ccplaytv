import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APP_LANGUAGE_STORAGE_KEY, resetAppLanguageForTests } from '../../lib/i18n/appLanguage'
import { createTranslator } from '../../lib/i18n/translate'
import { trailerButtonLabel } from '../../lib/trailer/trailerCandidates'
import { groupBySeason } from '../series/episodeNavigation'
import { OriginTag } from './DetailMetadata'
import { metadataFactRows } from './detailMetadataFormat'
import { trailerActionLabel, trailerActionToast } from './trailerAction'
import { groupLabelDisplay, vodGroupDisplay } from './vodGroupDisplay'
import { buildShowcaseRows } from './vodShowcaseRows'

/** Feature 054, Fase 6: Filmes, Séries, vitrine e detalhe em outros idiomas — textos do app mudam, nomes do provedor não. */

const en = createTranslator('en')
const es = createTranslator('es')

beforeEach(() => {
  window.localStorage.clear()
  resetAppLanguageForTests()
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
})

describe('Filmes/Séries em outros idiomas (feature 054)', () => {
  it('grupo: só o rótulo "Sem categoria" do app é traduzido; nomes do provedor e prefixo "Filmes |" seguem a regra de sempre', () => {
    expect(vodGroupDisplay(undefined, es)).toBe('Sin categoría')
    expect(groupLabelDisplay('', en)).toBe('Uncategorized')
    expect(vodGroupDisplay('Filmes | Lançamentos', en)).toBe('Lançamentos')
    expect(groupLabelDisplay('Ação & Aventura', en)).toBe('Ação & Aventura')
  })

  it('fileiras da vitrine: títulos fixos traduzidos; categoria do provedor intacta', () => {
    const rows = buildShowcaseRows(
      { section: 'movies', hasContinue: true, hasFavorites: true, hasAdded: true, categoryNames: ['Terror'] },
      es,
    )
    expect(rows.map((row) => row.title)).toEqual([
      'Seguir viendo',
      'Top 10 de películas de la semana',
      '★ Favoritos',
      'Añadidos recientemente',
      'Mejor valoradas',
      'Porque viste',
      'Terror',
    ])
  })

  it('botão de trailer: idioma só aparece quando NÃO é o do app (aviso de fallback)', () => {
    const inEnglish = { videoId: 'aaaaaaaaaaa', kind: 'trailer' as const, language: 'en', origin: 'tmdb' as const }
    expect(trailerButtonLabel(inEnglish, en)).toBe('▶ Trailer')
    expect(trailerButtonLabel(inEnglish, es)).toBe('▶ Tráiler · Inglés')
    expect(trailerButtonLabel(inEnglish)).toBe('▶ Trailer · Inglês')
    expect(trailerActionLabel({ status: 'unavailable', tmdbConfigured: true }, en)).toBe('Trailer — unavailable')
    expect(trailerActionToast({ status: 'unavailable', tmdbConfigured: false }, es)).toContain('Integraciones')
  })

  it('temporadas e fatos de metadata por idioma', () => {
    const episode = (season: number | null) =>
      ({ id: `e${season}`, season_number: season, episode_number: 1, name: 'x' }) as unknown as Parameters<typeof groupBySeason>[0][number]
    expect(groupBySeason([episode(1), episode(null)], en).map((season) => season.label)).toEqual(['Season 1', 'Episodes'])
    const rows = metadataFactRows({ genres: { value: 'Ação', origin: 'tmdb' }, country: { value: 'Brasil', origin: 'provider' } }, false, es)
    expect(rows.map((row) => row.label)).toEqual(['Género', 'País'])
    expect(rows.map((row) => row.value)).toEqual(['Ação', 'Brasil']) // valores do TMDB/provedor não são traduzidos por nós
  })

  it('selo de origem: "Dados: TMDB" e "em {idioma}" no idioma do app', () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'en')
    render(<OriginTag origin="tmdb" language="es" />)
    expect(screen.getByText('Data: TMDB · in spanish')).toBeInTheDocument()
  })
})
