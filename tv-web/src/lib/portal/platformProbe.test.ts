import { webcrypto } from 'node:crypto'
import { expect, it } from 'vitest'
import { platformProbeDestination, runPlatformProbe } from './platformProbe'
it('mede crypto real, rejeita adulteração e nunca retorna o DUID bruto ou digest', async () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const options = { crypto: webcrypto as unknown as Crypto, storage, getDuid: () => 'fake-private-duid', protocol: 'file:', wallNow: 2000, monotonicNow: 100 }
  const first = await runPlatformProbe(options)
  expect(first).toMatchObject({ duid: 'passed', duidStability: 'first_run', es256: 'passed', es256Tamper: 'passed', signatureBytes: 64, aesGcm: 'passed', aesAadTamper: 'passed', persistence: 'passed' })
  const again = await runPlatformProbe({ ...options, wallNow: 1999 })
  expect(again.duidStability).toBe('passed')
  expect(again.observedWallRollback).toBe(true)
  expect(JSON.stringify(again)).not.toMatch(/fake-private|duidDigest/)
})
it('falha de API/armazenamento não expõe erro nem o identificador', async () => {
  const report = await runPlatformProbe({ crypto: webcrypto as unknown as Crypto, protocol: 'https:', getDuid: () => { throw Error('fake-private-duid') }, storage: { getItem: () => { throw Error('private') }, setItem: () => { throw Error('private') } } })
  expect(report.duid).toBe('failed')
  expect(report.persistence).toBe('failed')
  expect(JSON.stringify(report)).not.toContain('private')
})

it('restringe o relatório ao coletor local e recusa destinos ambíguos sem lançar erro', () => {
  for (const destination of ['http://192.168.0.6:8769/platform-probe', 'http://localhost:8769/platform-probe', 'http://127.0.0.1:8769/platform-probe']) {
    expect(platformProbeDestination(destination)).toBeInstanceOf(URL)
  }
  for (const destination of ['invalid', 'http://192.168.exemplo.test/platform-probe', 'http://192.168.0.6.evil.test/platform-probe', 'http://192.168.999.1/platform-probe', 'https://localhost/platform-probe', 'http://user:secret@localhost/platform-probe', 'http://localhost/platform-probe?token=secret', 'http://localhost/platform-probe#secret', 'http://localhost/other']) {
    expect(platformProbeDestination(destination)).toBeNull()
  }
})
