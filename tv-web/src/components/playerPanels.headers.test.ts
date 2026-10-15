/** Feature 058 (T012, FR-005): linha "Headers da lista" no Info do stream — só nomes. */
import { describe, expect, it } from 'vitest'
import { buildInfoRows } from './playerPanels'
import { createTranslator } from '../lib/i18n/translate'

const t = createTranslator('pt')
const rowOf = (headers: Parameters<typeof buildInfoRows>[4]) =>
  buildInfoRows(null, undefined, true, t, headers).rows.find((r) => r.key === 'headers')

describe('buildInfoRows — headers da lista (feature 058)', () => {
  it('aplicados: só os nomes', () => {
    expect(rowOf({ applied: ['User-Agent'], refused: [] })).toEqual({ key: 'headers', label: 'Headers da lista', value: 'User-Agent' })
  })

  it('com recusados: acrescenta "não enviados"', () => {
    expect(rowOf({ applied: ['User-Agent'], refused: ['Referer'] })?.value).toBe('User-Agent · não enviados: Referer')
    expect(rowOf({ applied: [], refused: ['User-Agent', 'Referer'] })?.value).toBe('não enviados: User-Agent, Referer')
  })

  it('sem headers declarados: nenhuma linha, e a frase de "sem dados técnicos" não muda', () => {
    expect(rowOf({ applied: [], refused: [] })).toBeUndefined()
    expect(rowOf(undefined)).toBeUndefined()
    expect(buildInfoRows(null, undefined, true, t, { applied: ['User-Agent'], refused: [] }).noTechnicalData).toBe(true)
  })

  it('"Conexão" continua a última linha', () => {
    const { rows } = buildInfoRows(null, undefined, true, t, { applied: ['User-Agent'], refused: [] })
    expect(rows.at(-1)?.key).toBe('connection')
  })
})
