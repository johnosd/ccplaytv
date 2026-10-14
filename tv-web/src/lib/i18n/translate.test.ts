import { describe, expect, it } from 'vitest'
import { buildTranslate, createTranslator, translate } from './translate'

const catalogs = {
  pt: { 'a.x': 'Olá', 'a.nome': 'Olá, {nome}!', 'a.fila': 'Fila: {n}', 'a.item.one': '{n} item', 'a.item.other': '{n} itens', 'a.so-pt': 'Só pt' },
  en: { 'a.x': 'Hello', 'a.nome': 'Hello, {nome}!', 'a.fila': 'Queue: {n}', 'a.item.one': '{n} item', 'a.item.other': '{n} items' },
  es: { 'a.x': 'Hola', 'a.item.one': '{n} elemento', 'a.item.other': '{n} elementos' },
}

describe('translate (feature 054)', () => {
  const { translateKey, pluralKey } = buildTranslate(catalogs)

  it('traduz e troca {marcadores}', () => {
    expect(translateKey('en', 'a.x')).toBe('Hello')
    expect(translateKey('en', 'a.nome', { nome: 'Ana' })).toBe('Hello, Ana!')
  })

  it('formata número pelo idioma', () => {
    expect(translateKey('pt', 'a.fila', { n: 1234.5 })).toBe('Fila: 1.234,5')
    expect(translateKey('en', 'a.fila', { n: 1234.5 })).toBe('Queue: 1,234.5')
  })

  it('chave ausente no idioma cai em pt; ausente em todos devolve a própria chave, nunca vazio', () => {
    expect(translateKey('es', 'a.so-pt')).toBe('Só pt')
    expect(translateKey('es', 'a.nao-existe')).toBe('a.nao-existe')
  })

  it('marcador sem parâmetro fica como está (visível, não some)', () => {
    expect(translateKey('en', 'a.nome')).toBe('Hello, {nome}!')
  })

  it('plural por Intl.PluralRules em pt, en e es', () => {
    expect(pluralKey('pt', 'a.item', 1)).toBe('1 item')
    expect(pluralKey('pt', 'a.item', 0)).toBe('0 itens') // singular só para exatamente 1 (como o app sempre fez)
    expect(pluralKey('en', 'a.item', 2)).toBe('2 items')
    expect(pluralKey('es', 'a.item', 1)).toBe('1 elemento')
    expect(pluralKey('es', 'a.item', 5)).toBe('5 elementos')
  })

  it('createTranslator devolve o mesmo objeto por idioma e usa os catálogos reais', () => {
    expect(createTranslator('en')).toBe(createTranslator('en'))
    expect(createTranslator('en').language).toBe('en')
    expect(createTranslator('en')('settings.language.label')).toBe('Language')
    expect(translate('es', 'settings.reducedMotion.label')).toBe('Reducir movimiento')
  })
})
