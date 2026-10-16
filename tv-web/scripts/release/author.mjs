// Feature 078 (FR-007a, SAM-SEC-AUTHOR, INT-SEC-CUSTODY): identidade pública do
// certificado de autor, lida de `author-signature.xml` DENTRO do pacote. Só
// `issuer` e `fingerprint256` do X509 público; nunca o perfil de certificado
// do desenvolvedor, a chave privada nem a senha. Regras em logic/gate.md §7.3.
import { X509Certificate } from 'node:crypto'
import { STATUS } from './checklist.mjs'

/** @typedef {{ issuer: string, fingerprint: string }} AuthorCertificate */

const normalizeFingerprint = (value) => String(value ?? '').replace(/[^0-9a-f]/gi, '').toLowerCase()

/**
 * @param {string} authorSignatureXml
 * @returns {AuthorCertificate | null} `null` se não houver certificado legível
 */
export function readAuthorCertificate(authorSignatureXml) {
  const base64 = /<(?:\w+:)?X509Certificate>([^<]+)<\/(?:\w+:)?X509Certificate>/.exec(authorSignatureXml ?? '')?.[1]
  if (!base64) return null
  try {
    const certificate = new X509Certificate(Buffer.from(base64.replace(/\s+/g, ''), 'base64'))
    return { issuer: certificate.issuer.replace(/\r?\n/g, ', '), fingerprint: normalizeFingerprint(certificate.fingerprint256) }
  } catch {
    return null
  }
}

/**
 * @param {{ certificate: AuthorCertificate | null, publishedFingerprint?: string | null }} input
 * @returns {import('./checklist.mjs').CheckResult}
 */
export function checkAuthor({ certificate, publishedFingerprint }) {
  const id = 'SAM-SEC-AUTHOR'
  if (!certificate) {
    return { id, status: STATUS.BLOCKED, detail: 'certificado de autor ilegível ou ausente em author-signature.xml', nextAction: 'empacotar com o perfil de certificado Samsung (quickstart §2)' }
  }
  if (/Tizen Developers CA/i.test(certificate.issuer)) {
    return { id, status: STATUS.BLOCKED, detail: 'certificado de autor emitido pela Tizen Developers CA: instala só em emulador, o Seller Office exige o certificado Samsung', nextAction: 'empacotar com o perfil de certificado Samsung (quickstart §2)' }
  }
  if (publishedFingerprint) {
    return normalizeFingerprint(publishedFingerprint) === certificate.fingerprint
      ? { id, status: STATUS.PASS, detail: 'mesma assinatura de autor da versão publicada' }
      : { id, status: STATUS.BLOCKED, detail: 'assinatura de autor diferente da versão publicada: a atualização será recusada', nextAction: 'empacotar com o mesmo certificado de autor da publicação anterior' }
  }
  return { id, status: STATUS.PASS, detail: `primeira versão: certificado de autor registrado (SHA-256 ${certificate.fingerprint})` }
}

/**
 * @param {{ custody: { authorCertSha256?: string | null, backup?: { verifiedAt?: string | null } | null } | undefined, certificate: AuthorCertificate | null }} input
 * @returns {import('./checklist.mjs').CheckResult}
 */
export function checkCustody({ custody, certificate }) {
  const id = 'INT-SEC-CUSTODY'
  if (!custody?.authorCertSha256) {
    return { id, status: STATUS.BLOCKED, detail: 'identidade do certificado de autor não registrada em release/samsung/custody.json', nextAction: 'registrar o fingerprint público do certificado em custody.json' }
  }
  if (certificate && normalizeFingerprint(custody.authorCertSha256) !== certificate.fingerprint) {
    return { id, status: STATUS.BLOCKED, detail: 'custody.json registra outro certificado que o do pacote', nextAction: 'corrigir custody.json ou empacotar com o certificado registrado' }
  }
  if (!custody.backup?.verifiedAt) {
    return { id, status: STATUS.BLOCKED, detail: 'sem backup verificado do certificado de autor: perdê-lo impede atualizar o app publicado', nextAction: 'guardar backup do certificado e registrar backup.verifiedAt em custody.json' }
  }
  return { id, status: STATUS.PASS, detail: 'certificado registrado com backup verificado' }
}
