import { describe, expect, it } from 'vitest'
import { en } from './en'
import { es } from './es'
import { portalAdvanced } from './portalAdvanced'
import { pt } from './pt'

describe('textos do Avançado (feature 076)', () => {
  const keys = Object.keys(portalAdvanced.pt)

  it('existem nos três idiomas e o conjunto de chaves é o mesmo', () => {
    expect(Object.keys(portalAdvanced.en)).toEqual(keys)
    expect(Object.keys(portalAdvanced.es)).toEqual(keys)
    for (const key of keys) expect(pt[key as keyof typeof pt], key).toBeTruthy()
  })

  it('"código da licença" não existe em nenhum texto da TV: o código é de recuperação e não é uma licença comprada (FR-009)', () => {
    const forbidden = /c[oó]digo (da|de) licen[cç]a|c[oó]digo de licencia|licen[cs]e code/i
    for (const catalog of [pt, en, es]) {
      for (const [key, value] of Object.entries(catalog)) expect(value, key).not.toMatch(forbidden)
    }
  })

  it('o texto do código diz que não é uma licença comprada e manda guardar fora da TV nos três idiomas', () => {
    expect(portalAdvanced.pt['portal.advanced.codeText']).toMatch(/não é uma licença comprada/)
    expect(portalAdvanced.pt['portal.advanced.codeText']).toMatch(/fora da TV/)
    expect(portalAdvanced.en['portal.advanced.codeText']).toMatch(/not a purchased license/)
    expect(portalAdvanced.en['portal.advanced.codeText']).toMatch(/outside the TV/)
    expect(portalAdvanced.es['portal.advanced.codeText']).toMatch(/no es una licencia comprada/)
    expect(portalAdvanced.es['portal.advanced.codeText']).toMatch(/fuera de la TV/)
  })
})
