import { expect, it } from 'vitest'
import { checkPrivacy } from './privacy.mjs'

const URL_OK = 'https://johnosd.github.io/ccplaytv/privacidade/'
const item = { id: 'SAM-KIT-PRIVACY', owner: 'produto', status: 'Pending' }

it('URL http ou com query/credencial bloqueia sem ecoar a URL', () => {
  for (const privacyUrl of ['http://johnosd.github.io/ccplaytv/privacidade/', `${URL_OK}?token=abc`, 'https://u:p@exemplo.org/privacidade']) {
    const result = checkPrivacy({ privacyUrl, item })
    expect(result.status, privacyUrl).toBe('Blocked')
    expect(JSON.stringify(result)).not.toContain('abc')
  }
})

it('HTTPS sem evidência fica Pending; evidência de outra URL ou sem 200 não conta; a certa passa', () => {
  expect(checkPrivacy({ privacyUrl: URL_OK, item }).status).toBe('Pending')
  expect(checkPrivacy({ privacyUrl: URL_OK, item, evidence: [{ url: 'https://outro.example/privacidade/', status: 200, date: '2026-10-16' }] }).status).toBe('Pending')
  expect(checkPrivacy({ privacyUrl: URL_OK, item, evidence: [{ url: URL_OK, status: 404, date: '2026-10-16' }] }).status).toBe('Pending')
  expect(checkPrivacy({ privacyUrl: URL_OK, item, evidence: [{ url: URL_OK, status: 200, date: '2026-10-16' }] }).status).toBe('Pass')
})

it('Not Applicable só com motivo registrado', () => {
  expect(checkPrivacy({ privacyUrl: URL_OK, item: { ...item, status: 'Not Applicable' } }).status).toBe('Blocked')
  expect(checkPrivacy({ privacyUrl: URL_OK, item: { ...item, status: 'Not Applicable', naReason: 'variante sem coleta' } }).status).toBe('Not Applicable')
})
