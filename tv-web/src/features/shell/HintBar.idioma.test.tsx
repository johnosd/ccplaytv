import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../../lib/i18n/I18nProvider'
import { resetAppLanguageForTests, writeAppLanguage } from '../../lib/i18n/appLanguage'
import { HintBar } from './HintBar'

/** Feature 054 (convergência, C-001): o nome acessível da faixa de teclas acompanha o idioma do app. */

beforeEach(() => {
  window.localStorage.clear()
  resetAppLanguageForTests()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
})

describe('HintBar — nome acessível por idioma', () => {
  it('pt, en e es', () => {
    render(
      <I18nProvider>
        <HintBar hints={[{ keyLabel: 'OK', action: 'Select' }]} />
      </I18nProvider>,
    )
    expect(screen.getByRole('note', { name: 'Teclas do controle remoto' })).toBeInTheDocument()
    act(() => writeAppLanguage('en'))
    expect(screen.getByRole('note', { name: 'Remote control keys' })).toBeInTheDocument()
    act(() => writeAppLanguage('es'))
    expect(screen.getByRole('note', { name: 'Teclas del mando a distancia' })).toBeInTheDocument()
  })
})
