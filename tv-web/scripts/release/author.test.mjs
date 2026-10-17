import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { checkAuthor, checkCustody, readAuthorCertificate } from './author.mjs'

// Certificados autoassinados descartáveis (chaves privadas jogadas fora): só o X509 público.
const SAMSUNG_LIKE = 'MIIDJTCCAg2gAwIBAgIUSQPGihmbQdtFB4cPUGGVEAxUSo4wDQYJKoZIhvcNAQELBQAwITEfMB0GA1UEAwwWRml4dHVyZSBTYW1zdW5nIEF1dGhvcjAgFw0yNjEwMTYyMTQ5MDZaGA8yMTI2MDkyMjIxNDkwNlowITEfMB0GA1UEAwwWRml4dHVyZSBTYW1zdW5nIEF1dGhvcjCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAO+ysmZLeoTICnGqSOAh0i3A0U8AqWp3eL1IwwA8rKXuKxKDfoKYl2FUywhxuXQ2c6d+P7QIKoO5oWI9+zpfoR+ausobiQyoiAonW4zwLucnkvCb9PETXeys1wP7KuQrUnBaqmgUA1ulTswi9JjhuiIAL82dWLzPykq4R5uthr4SjQwJLFRWPPpXwTCvWwGukwvLvPL5z9yFn1f5I8md9lmTOQ/1G3+qdg2KVYnZ1hXN+kLNCsgoeophLpf/MZ+nszwbQIOklwanKu7oXA831xPdbWaeZq50ViCdFVJx7N+QzGvMnVl6no/+xOgj7jqB4n6ZuiFXxXLHl2LqMTqXNx8CAwEAAaNTMFEwHQYDVR0OBBYEFNBUol42j6GtVGnKwhAOQ97ByKdjMB8GA1UdIwQYMBaAFNBUol42j6GtVGnKwhAOQ97ByKdjMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAGkK1KHG63Y6sPbPjBfGRA+7fZuUgBukP7KadYsjaKuAFV+4dsW4adtTzWvc/1aDUqbGEWkMZ30gvXQTUl6JLHwNOe9kAJgRPzMdSFmeYOCgk1q0lbW7GLdZpdAvZi9Kh3tRGhwyGvYDRVzZbPUhDdZk49C3/EllQQzwo+Xms2T87JiX5WfiGvi5ap56zRIYkG3jOwMB+/GhQVN2r1vE+0XRvNF7/cHy8rExRLRrmd4pAnx2Nr5d9ehRxVLjM1J8v81/R6ywu0YN7On3g8R9Zkcg9jbXv41mhwU+5D+wTehdLw9umLgr79sS2EZNG9bxMoh8F4rvdjWEMKuShTtOZCw='
const TIZEN_DEV_CA = 'MIIDHzCCAgegAwIBAgIURJMNnOzKk33CFxgboWsHmP0y/jQwDQYJKoZIhvcNAQELBQAwHjEcMBoGA1UEAwwTVGl6ZW4gRGV2ZWxvcGVycyBDQTAgFw0yNjEwMTYyMTQ5MDdaGA8yMTI2MDkyMjIxNDkwN1owHjEcMBoGA1UEAwwTVGl6ZW4gRGV2ZWxvcGVycyBDQTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALvU76P4rhDx8PcHgCzTfy9Qz8V4P+i1/ltB0/fPmqSBqQNLBQ0zTuL8L8LOQsKG6b49YElk6XbJYvfOBzxjV1MBxinMy/ppsg0wC1BRs7F+NoBDIEhuNqoyLar80NwU0yYWzJV2gcNdmaRc9EyNj69VN1gkLVpRpPF2jlg6Ml6y0cwL8uO5kL5VmmipT3ul+Vg/u9oZc5iTcfEZ90wCyqaBLzerOQOlAc0qt5/Anv2fXvaPiyTi2nQByaXTASBmJhUbvmdqHHDr0YFCRtgAxNE29HUq5WbbhxbKBmPAv5DCHnSZfrUx9EfSHRZDPZomdTbXLefXQhOcIvmtCGUqVz0CAwEAAaNTMFEwHQYDVR0OBBYEFAtVXKwqQM6PIMJW05fz5vPv/fpEMB8GA1UdIwQYMBaAFAtVXKwqQM6PIMJW05fz5vPv/fpEMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBACV/p4hP0H06hDk5jfIMC/ie4hf4EeqwdMdAUJutTrYSheD7PojLttSDbFcn7Hkvcr/9mt1KE+s3A/BpTTHD56enttXNXng4FNanGK6bLA9fgOZznl8WgkwHLSjVZ0aI7g5nwHdkaO9oQwRF6lvqqE+iekoolkNsla1Uby0ZUF4rq4BzI0tsTXJH0fW+8pudigaK8tQ7XHp2NcEg98esJuYSSnoPqfuEhmqGQ+WtREyM333d/CUIziCAYPveQxmvfKUrL52tDolZh8jJYCR9I6sslGRvCot0y+uYyoiWYEUaQz2K5CCqdldZcP42J6H4dEXXJD2ajDsUxIX5lDFxBPA='
const xml = (b64) => `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><KeyInfo><X509Data><X509Certificate>\n${b64}\n</X509Certificate></X509Data></KeyInfo></Signature>`
const fingerprint = (b64) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex')

it('lê emissor e fingerprint do certificado de author-signature.xml; lixo vira null', () => {
  const cert = readAuthorCertificate(xml(SAMSUNG_LIKE))
  expect(cert.fingerprint).toBe(fingerprint(SAMSUNG_LIKE))
  expect(cert.issuer).toContain('Fixture Samsung Author')
  expect(readAuthorCertificate('<Signature/>')).toBeNull()
  expect(readAuthorCertificate(xml('bm90IGEgY2VydA=='))).toBeNull()
})

it('SAM-SEC-AUTHOR: Tizen Developers CA bloqueia; publicado igual passa, diferente bloqueia; primeira versão registra', () => {
  const samsung = readAuthorCertificate(xml(SAMSUNG_LIKE))
  const tizen = readAuthorCertificate(xml(TIZEN_DEV_CA))
  expect(checkAuthor({ certificate: tizen }).status).toBe('Blocked')
  expect(checkAuthor({ certificate: null }).status).toBe('Blocked')
  expect(checkAuthor({ certificate: samsung }).status).toBe('Pass')
  expect(checkAuthor({ certificate: samsung, publishedFingerprint: fingerprint(SAMSUNG_LIKE).toUpperCase() }).status).toBe('Pass')
  expect(checkAuthor({ certificate: samsung, publishedFingerprint: fingerprint(TIZEN_DEV_CA) }).status).toBe('Blocked')
})

it('INT-SEC-CUSTODY: exige identidade igual à do pacote e backup verificado', () => {
  const certificate = readAuthorCertificate(xml(SAMSUNG_LIKE))
  const fp = fingerprint(SAMSUNG_LIKE)
  const backup = { location: 'cofre', verifiedAt: '2026-10-16', by: 'release' }
  expect(checkCustody({ custody: { authorCertSha256: null, backup: null }, certificate }).status).toBe('Blocked')
  expect(checkCustody({ custody: { authorCertSha256: fp, backup: null }, certificate }).status).toBe('Blocked')
  expect(checkCustody({ custody: { authorCertSha256: fingerprint(TIZEN_DEV_CA), backup }, certificate }).status).toBe('Blocked')
  expect(checkCustody({ custody: { authorCertSha256: fp, backup }, certificate }).status).toBe('Pass')
})
