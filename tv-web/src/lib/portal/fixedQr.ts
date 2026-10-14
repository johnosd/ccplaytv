/**
 * Conteúdo do QR fixo (feature 071, FR-013/FR-014): endereço do site + ID + chave SÓ no fragmento da URL
 * (o fragmento nunca chega ao servidor nem a logs). Constitution 1.11.0, exceção (e): nunca em path, query,
 * requisição ou log — quem monta a URL é a TV, sem rede, e o site a consome no navegador.
 */
import { DEVICE_KEY_PATTERN, DISPLAY_ID_PATTERN } from './displayId'

export interface FixedQrInput {
  /** Origem do painel, ex.: `https://portal.exemplo`. */
  site: string
  /** `XX:XX:XX:XX:XX:XX` maiúsculo. */
  displayId: string
  /** 10 dígitos. */
  deviceKey: string
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Só `https:`; `http:` apenas em loopback (`npm run dev:portal`), que nunca é alcançável por um celular. */
function siteOrigin(site: string): string {
  const url = new URL(site)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname))) throw new Error('invalid_qr_site')
  return url.origin
}

export function buildFixedQrUrl(input: FixedQrInput): string {
  if (!DISPLAY_ID_PATTERN.test(input.displayId) || !DEVICE_KEY_PATTERN.test(input.deviceKey)) throw new Error('invalid_qr_credentials')
  const fragment = new URLSearchParams({ id: input.displayId, key: input.deviceKey })
  return `${siteOrigin(input.site)}/#${fragment.toString()}`
}
