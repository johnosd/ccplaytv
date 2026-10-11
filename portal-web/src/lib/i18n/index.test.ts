import { expect, it } from 'vitest'
import { resolveLocale, useT } from './index'
it('preserva pt como base e oferece en/es sem expor detalhes técnicos', () => {
  expect(resolveLocale('pt-BR')).toBe('pt')
  expect(resolveLocale('en-US')).toBe('en')
  expect(resolveLocale('es-AR')).toBe('es')
  expect(resolveLocale('fr')).toBe('pt')
  for (const lang of ['pt', 'en', 'es']) expect(useT(lang)('preparing')).toBeTruthy()
})
