import { useQuery } from '@tanstack/react-query'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000'

export type CatalogItemKind = 'channel' | 'movie' | 'series' | 'episode' | 'unclassified'

export interface CatalogItemOut {
  id: string
  kind: CatalogItemKind
  name: string
  original_group: string | null
  published: boolean
  /** Derivado no backend de `playback_url IS NOT NULL` — nunca a URL em si. */
  playable: boolean
}

export interface CatalogItemListResponse {
  items: CatalogItemOut[]
  next_cursor: string | null
}

export interface CatalogItemPlayback {
  item_id: string
  kind: CatalogItemKind
  /**
   * URL de reprodução direta. **Sensível**: pode conter credenciais do
   * provedor no caminho. Vive só na memória da sessão de reprodução — não é
   * persistida, não é logada, não é reusada entre tentativas (ADR-002 §5).
   */
  url: string
  container_hint: string | null
}

export class CatalogApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`)

  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    const message =
      (detail && typeof detail === 'object' && 'detail' in detail
        ? String((detail as { detail?: unknown }).detail)
        : null) ?? response.statusText
    throw new CatalogApiError(response.status, message)
  }

  return (await response.json()) as T
}

export function useChannels(sourceId: string | null) {
  return useQuery({
    queryKey: ['catalog-items', sourceId, 'channel'],
    queryFn: () =>
      apiFetch<CatalogItemListResponse>(
        `/catalog-items?source_id=${encodeURIComponent(sourceId ?? '')}&kind=channel`,
      ),
    enabled: sourceId !== null,
  })
}

/**
 * Busca a informação de reprodução de um item.
 *
 * Deliberadamente **não** é um `useQuery`: informação de reprodução não é
 * estado de tela e não pode ser cacheada nem revalidada em background — a URL
 * é sensível e pode expirar ou ser revogada. Cada tentativa de play chama
 * isto de novo, pelo id do item (contracts/playback-api.md, regras 2 a 4).
 */
export async function fetchPlayback(itemId: string): Promise<CatalogItemPlayback> {
  return apiFetch<CatalogItemPlayback>(`/catalog-items/${itemId}/playback`)
}
