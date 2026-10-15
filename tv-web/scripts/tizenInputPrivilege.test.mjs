import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('o pacote Tizen declara a permissão oficial para registrar CH+/CH−', () => {
  const manifest = readFileSync(new URL('../../CCPlayTv/config.xml', import.meta.url), 'utf8')
  const privileges = [...manifest.matchAll(/<tizen:privilege\b[^>]*\bname=["']([^"']+)["']/g)]
    .map((match) => match[1])

  expect(privileges).toContain('http://tizen.org/privilege/tv.inputdevice')
  expect(privileges).not.toContain('http://tizen.org/privilege/tvinputdevice')
})
