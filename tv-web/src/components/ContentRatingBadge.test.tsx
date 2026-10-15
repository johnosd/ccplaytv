import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { resetAppLanguageForTests, writeAppLanguage } from '../lib/i18n/appLanguage'
import { ContentRatingBadge } from './ContentRatingBadge'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
})

it('L tem nome acessível livre e cor brasileira; TV-MA e Espanha são neutros', () => {
  render(<ContentRatingBadge certifications={{ BR: 'L', US: 'TV-MA', ES: '13' }} />)
  expect(screen.getByLabelText('Classificação indicativa: livre')).toHaveClass('content-rating-badge--br-l')
  act(() => writeAppLanguage('en'))
  expect(screen.getByLabelText('Content rating: TV-MA')).toHaveAttribute('class', 'content-rating-badge')
  act(() => writeAppLanguage('es'))
  expect(screen.getByLabelText('Calificación por edades: 13')).toHaveAttribute('class', 'content-rating-badge')
})
