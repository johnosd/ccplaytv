import { expect, it } from 'vitest'
import { checkTmdbKey } from './tmdbKeyFormat'

const V3 = '0123456789abcdef0123456789ABCDEF'
const V4 = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.c2lnbmF0dXJlLXZhbHVl'

it('aceita v3 (32 hexadecimais) e v4 (JWT) e apara espaços e quebras de linha da colagem', () => {
  expect(checkTmdbKey(V3)).toEqual({ ok: true, key: V3, format: 'v3' })
  expect(checkTmdbKey('  ' + V3 + '\n')).toEqual({ ok: true, key: V3, format: 'v3' })
  expect(checkTmdbKey(V4)).toEqual({ ok: true, key: V4, format: 'v4' })
})

it('recusa o que a TV recusaria, sem devolver o texto digitado', () => {
  for (const raw of ['', 'curta', V3.slice(0, 31), V3 + 'a', 'g'.repeat(32), 'abc def'.repeat(6), 'eyJabc.def', V4 + '.extra', V4.replace('.', ' '),
    'eyJ' + 'a'.repeat(300) + '.' + 'b'.repeat(200) + '.' + 'c'.repeat(200)]) {
    const result = checkTmdbKey(raw)
    expect(result).toEqual({ ok: false })
    expect(JSON.stringify(result)).not.toContain(raw || '\u0000')
  }
})
