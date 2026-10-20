import { expect, it } from 'vitest'
import { formatDisplayIdInput, normalizeDisplayId, typedDisplayId } from './displayId'

// 081/T046: o campo travava porque cada tecla reescrevia o valor e o 3º caractere sumia ("A0C" → "A0").
it('digitar caractere a caractere nunca perde o que foi digitado', () => {
  let field = ''
  for (const key of 'a08cfd190a8c') {
    field = typedDisplayId(field + key)
    expect(field.endsWith(key)).toBe(true)
  }
  expect(field).toBe('a08cfd190a8c')
  expect(formatDisplayIdInput(field)).toBe('A0-8C-FD-19-0A-8C')
  expect(normalizeDisplayId(field)).toBe('A0:8C:FD:19:0A:8C')
})

it('aceita colar com dois-pontos, hífens ou espaços e descarta o que não cabe num MAC', () => {
  expect(typedDisplayId('2a:34:de:ad:a3:dd')).toBe('2a:34:de:ad:a3:dd')
  expect(typedDisplayId('xyz2A-34!')).toBe('2A-34')
  expect(typedDisplayId('2A-34-DE-AD-A3-DD-99')).toHaveLength(17)
  expect(normalizeDisplayId(' 2a-34-de-ad-a3-dd ')).toBe('2A:34:DE:AD:A3:DD')
  expect(normalizeDisplayId('2A 34')).toBe('2A 34')
})

it('formatação ao sair do campo mantém o par incompleto e limita a 12 dígitos', () => {
  expect(formatDisplayIdInput('A0C')).toBe('A0-C')
  expect(formatDisplayIdInput('')).toBe('')
  expect(formatDisplayIdInput('A0-8C-FD-19-0A-8C-FF')).toBe('A0-8C-FD-19-0A-8C')
})
