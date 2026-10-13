/**
 * ID do dispositivo exibido na TV e no painel (feature 070, D-002): formato `XX:XX:XX:XX:XX:XX`.
 * Não é segredo nem autentica sozinho; a identidade interna (`deviceId`) não muda.
 */
export const DISPLAY_ID_PATTERN = /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/

/** Chave do dispositivo da 070 (D-003): 10 dígitos decimais. */
export const DEVICE_KEY_PATTERN = /^\d{10}$/

/**
 * Normaliza um MAC lido da plataforma (`aa-bb-…`, `aabb…`, minúsculas, espaços nas pontas) para o formato exibido.
 * Inválido, ausente, todo zero, broadcast ou multicast → `undefined` (o servidor gera um ID no mesmo formato).
 */
export function displayIdFromMac(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const hex = raw.trim().replace(/[:.-]/g, '').toUpperCase()
  if (!/^[0-9A-F]{12}$/.test(hex) || /^(?:0{12}|F{12})$/.test(hex)) return undefined
  // Bit menos significativo do 1º octeto = multicast: nunca identifica um aparelho.
  if ((parseInt(hex.slice(0, 2), 16) & 1) === 1) return undefined
  return hex.match(/../g)!.join(':')
}
