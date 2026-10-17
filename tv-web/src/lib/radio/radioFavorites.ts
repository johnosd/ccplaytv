import { radioDb, type RadioDb } from './radioDb'
import type { RadioStation } from './radioTypes'

/**
 * Favoritos de estação (feature 074, US2; FR-020..FR-023; `data-model.md` §2). Só no aparelho, no banco próprio da
 * Rádio, fora do backup da ADR-017 e de qualquer lista. Chave = identidade da estação, nunca a URL.
 */

export interface RadioFavorite {
  /** `radio-browser:<uuid>` — a chave; nunca a URL do stream. */
  id: string
  uuid: string
  /** Retrato da estação no momento em que foi favoritada — para listar sem rede (FR-021). */
  name: string
  artUrl?: string
  countryCode: string
  /** Última URL conhecida: só fallback quando o diretório não responde (`logic/radio-tela.md` §5). Nunca chave. */
  lastStreamUrl?: string
  favoritedAt: number
}

function snapshot(station: RadioStation, favoritedAt: number): RadioFavorite {
  return {
    id: station.id,
    uuid: station.uuid,
    name: station.name,
    ...(station.artUrl ? { artUrl: station.artUrl } : {}),
    countryCode: station.countryCode,
    lastStreamUrl: station.streamUrl,
    favoritedAt,
  }
}

/** Favoritos, do mais recente para o mais antigo. Armazenamento indisponível = lista vazia. */
export async function listRadioFavorites(database: RadioDb = radioDb): Promise<RadioFavorite[]> {
  try {
    return await database.favorites.orderBy('favoritedAt').reverse().toArray()
  } catch {
    return []
  }
}

export async function isRadioFavorite(id: string, database: RadioDb = radioDb): Promise<boolean> {
  try {
    return (await database.favorites.get(id)) !== undefined
  } catch {
    return false
  }
}

/** Alterna e devolve o estado novo (`true` = agora é favorita). */
export async function toggleRadioFavorite(station: RadioStation, now = Date.now(), database: RadioDb = radioDb): Promise<boolean> {
  return database.transaction('rw', database.favorites, async () => {
    if (await database.favorites.get(station.id)) {
      await database.favorites.delete(station.id)
      return false
    }
    await database.favorites.put(snapshot(station, now))
    return true
  })
}

/** Atualiza o retrato de um favorito com a versão atual da estação, sem mudar `favoritedAt`. Sem favorito, nada. */
export async function refreshRadioFavorite(station: RadioStation, database: RadioDb = radioDb): Promise<void> {
  try {
    const current = await database.favorites.get(station.id)
    if (current) await database.favorites.put(snapshot(station, current.favoritedAt))
  } catch {
    // Retrato desatualizado não é falha: a próxima reprodução tenta de novo.
  }
}

/** Uma estação "tocável" a partir do retrato guardado (lista de Favoritos sem rede). */
export function favoriteAsStation(favorite: RadioFavorite): RadioStation {
  return {
    id: favorite.id,
    uuid: favorite.uuid,
    name: favorite.name,
    ...(favorite.artUrl ? { artUrl: favorite.artUrl } : {}),
    streamUrl: favorite.lastStreamUrl ?? '',
    countryCode: favorite.countryCode,
    tags: [],
    hls: false,
    popularity: 0,
  }
}
