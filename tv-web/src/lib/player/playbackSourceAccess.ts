/**
 * Estado da conta da lista que está tocando (feature 042, R-002): só o que a
 * feature 034 já guardou no registro da lista (`accountStatus`/
 * `accountExpiresAt`). Leitura local, sem rede, sem credencial — falhou ou
 * ausente = `null` (o diagnóstico cai nas regras de rede/formato).
 */

import { db } from '../catalog/db'

export type PlaybackSourceAccess = 'expired' | 'refused' | null

export async function readPlaybackSourceAccess(sourceId: string, now: number = Date.now()): Promise<PlaybackSourceAccess> {
  try {
    const record = await db.sources.get(sourceId)
    if (!record) return null
    if (record.accountStatus === 'refused') return 'refused'
    if (record.accountStatus === 'expired') return 'expired'
    if (typeof record.accountExpiresAt === 'number' && record.accountExpiresAt <= now) return 'expired'
    return null
  } catch {
    return null
  }
}
