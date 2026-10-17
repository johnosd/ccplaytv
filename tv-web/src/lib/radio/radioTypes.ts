/**
 * Tipos da Rádio (feature 074, ADR-018). Uma estação vem do diretório Radio Browser e NÃO pertence a nenhuma lista: este
 * módulo não importa `lib/catalog` nem `lib/portal` (ADR-018 §2).
 */

/** Prefixo da identidade estável de uma estação (ADR-018 §4) — nunca a URL do stream. */
export const RADIO_ID_PREFIX = 'radio-browser:'

/** `radio-browser:<stationuuid>`. */
export function radioStationId(uuid: string): string {
  return `${RADIO_ID_PREFIX}${uuid}`
}

/** País do diretório (`/json/countries`). O nome exibido sai do código, no idioma do app (`countryNames.ts`). */
export interface RadioCountry {
  /** ISO 3166-1 alfa-2, em maiúsculas. */
  code: string
  /** Nome que o diretório devolve (inglês) — só fallback de exibição. */
  directoryName: string
  stationCount: number
}

/** Estação já validada e normalizada (`logic/diretorio.md` §3). */
export interface RadioStation {
  /** `radio-browser:<uuid>` — chave de favorito, foco e memória. */
  id: string
  uuid: string
  /** Texto de provedor: nunca traduzido. */
  name: string
  /** `url_resolved` do diretório. Não é segredo, mas nunca é chave de nada nem aparece em tela/erro/log. */
  streamUrl: string
  /** Favicon http(s) sem credencial; ausente = iniciais. */
  artUrl?: string
  /** ISO alfa-2 em maiúsculas; vazio quando o diretório não informa. */
  countryCode: string
  tags: string[]
  codec?: string
  bitrate?: number
  hls: boolean
  /** `clickcount` — só ordena. */
  popularity: number
}

/** Item da trilha da Rádio, por identidade (nunca índice). */
export type RadioEntryKey = 'favorites' | 'world' | `country:${string}`
