/**
 * Conteúdo do QR fixo (feature 071, FR-013/FR-014): endereço do site + ID + chave SÓ no fragmento da URL
 * (o fragmento nunca chega ao servidor nem a logs). STUB do sdd-plan — implementar na T016.
 */
export interface FixedQrInput {
  /** Origem do painel, ex.: `https://portal.exemplo`. */
  site: string
  /** `XX:XX:XX:XX:XX:XX` maiúsculo. */
  displayId: string
  /** 10 dígitos. */
  deviceKey: string
}

export function buildFixedQrUrl(_input: FixedQrInput): string {
  throw new Error('not implemented')
}