import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider, useT } from './I18nProvider'
import { APP_LANGUAGE_STORAGE_KEY, resetAppLanguageForTests, writeAppLanguage } from './appLanguage'

function Label() {
  const t = useT()
  return <p data-testid="label">{t('settings.reducedMotion.label')}</p>
}

beforeEach(() => {
  window.localStorage.clear()
  resetAppLanguageForTests()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
  document.documentElement.removeAttribute('lang')
})

describe('I18nProvider / useT (feature 054)', () => {
  it('padrão é pt (sistema pt-BR nos testes) e o <html lang> acompanha', () => {
    render(
      <I18nProvider>
        <Label />
      </I18nProvider>,
    )
    expect(screen.getByTestId('label')).toHaveTextContent('Reduzir movimento')
    expect(document.documentElement.lang).toBe('pt-BR')
  })

  it('trocar o idioma re-renderiza o consumidor na hora, sem remontá-lo', () => {
    render(
      <I18nProvider>
        <Label />
      </I18nProvider>,
    )
    const before = screen.getByTestId('label')
    act(() => {
      writeAppLanguage('es')
    })
    expect(screen.getByTestId('label')).toBe(before) // mesmo nó: não houve remontagem
    expect(before).toHaveTextContent('Reducir movimiento')
    expect(document.documentElement.lang).toBe('es-ES')
    expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('es')
  })

  it('fora do provedor também funciona (usa o idioma vigente, não lança)', () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'en')
    render(<Label />)
    expect(screen.getByTestId('label')).toHaveTextContent('Reduce motion')
  })

  it('armazenamento que falha na gravação: a troca vale na sessão', () => {
    const blocked = { getItem: () => null, setItem: () => { throw new Error('cheio') } }
    render(
      <I18nProvider>
        <Label />
      </I18nProvider>,
    )
    act(() => {
      writeAppLanguage('en', blocked)
    })
    expect(screen.getByTestId('label')).toHaveTextContent('Reduce motion')
  })
})
