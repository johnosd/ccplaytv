import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { resetAppLanguageForTests, writeAppLanguage } from '../lib/i18n/appLanguage'
import { TmdbRatingBadge } from './TmdbRatingBadge'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
})

it('formata a nota no idioma do app, sem foco, e omite notas sem votos suficientes', () => {
  const { container, rerender } = render(<TmdbRatingBadge rating={{ average: 7.83, votes: 50 }} />)
  expect(container).toHaveTextContent('TMDB 7,8')
  expect(container.querySelector('button, a, input, [tabindex]')).toBeNull()
  act(() => writeAppLanguage('en'))
  expect(container).toHaveTextContent('TMDB 7.8')
  rerender(<TmdbRatingBadge rating={{ average: 7.83, votes: 49 }} />)
  expect(container).toBeEmptyDOMElement()
  rerender(<TmdbRatingBadge />)
  expect(container).toBeEmptyDOMElement()
})
