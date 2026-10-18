/**
 * 081/FR-007: chaves públicas de licença que um pacote comercial nunca pode confiar, seja qual for o kid.
 * Só a parte pública (kty/crv/x/y), que não é segredo.
 */
export const revokedLicenseKeys = Object.freeze([
  // Homologação `ccplaytv-511322`, kid `v1`: a chave privada foi exposta (073 R-016, de novo em 2026-10-17).
  // Copiada do JWKS público `GET https://portal.ccplaytv.com/portal/v1/license-keys` em 2026-10-17.
  Object.freeze({ kty: 'EC', crv: 'P-256', x: '3Sv3gBx1kL6HqP31x9Y1TVDo6VixEldOpmsmZ1DdYxY', y: 'L8uS4uH0RLPoWLpJ29mJRU_BVRpURTZOaScM773cE0I' }),
])
