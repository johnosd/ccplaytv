/**
 * Resolve a URL de reprodução de um canal (`contracts/local-storage.md` §4).
 *
 * **Não é cacheável e não é estado de tela.** Cada tentativa de reproduzir
 * resolve de novo: a URL carrega credencial e pode expirar. Guardá-la em
 * estado de componente a espalharia por re-renderizações, ferramentas de
 * depuração e mensagens de erro — exatamente o que FR-009 impede.
 *
 * Por isso a identidade do item no catálogo é o `providerStreamId`, nunca a
 * URL: é o que a constitution exige para retomada e favoritos continuarem
 * válidos quando a URL mudar.
 */

import { db, type CatalogDb } from './db'
import { getChannel } from './catalogRepository'
import { readCredential } from './sourceRepository'
import { buildLiveUrl, buildSeriesUrl, buildVodUrl, preferredFormat } from './xtreamConnector'

export type PlaybackUnavailableReason =
  | 'channel_not_found'
  | 'source_credential_missing'
  | 'no_allowed_format'
  | 'no_stream_id'
  | 'no_container_extension'
  | 'not_playable_kind'

export class PlaybackUnavailableError extends Error {
  reason: PlaybackUnavailableReason
  constructor(reason: PlaybackUnavailableReason) {
    super(`Não é possível montar a URL de reprodução (${reason}).`)
    this.name = 'PlaybackUnavailableError'
    this.reason = reason
  }
}

/**
 * Para fonte de provedor, monta a URL na hora a partir do identificador, da
 * credencial e do formato que a conta permite. Para fonte por URL M3U,
 * devolve a URL gravada — ali a URL **é** o dado que a lista fornece, e não
 * existe identificador a partir do qual reconstruí-la (data-model.md §4).
 *
 * **O caminho depende do tipo do item, não de um padrão fixo.** O painel
 * serve canal em `/live/`, filme em `/movie/` e episódio em `/series/`, cada
 * um com sua extensão. Montar tudo como canal ao vivo devolve uma URL que o
 * painel responde com 404 — e o motor de reprodução relata isso como erro
 * genérico de mídia, indistinguível de codec não suportado.
 */
export async function resolvePlaybackUrl(
  channelId: number,
  database: CatalogDb = db,
): Promise<string> {
  const channel = await getChannel(channelId, database)
  if (!channel) throw new PlaybackUnavailableError('channel_not_found')

  if (channel.directUrl) return channel.directUrl

  // Série é agrupador, não mídia: o que se reproduz é um episódio dela.
  if (channel.kind === 'series' || channel.kind === 'unclassified') {
    throw new PlaybackUnavailableError('not_playable_kind')
  }

  const credential = await readCredential(channel.sourceId, database)
  if (!credential) throw new PlaybackUnavailableError('source_credential_missing')
  if (!channel.providerStreamId) throw new PlaybackUnavailableError('no_stream_id')

  if (channel.kind === 'movie' || channel.kind === 'episode') {
    // Extensão de contêiner não tem padrão a assumir — `mkv`, `mp4` e `avi`
    // convivem no mesmo painel, e o item guarda a que o painel declarou.
    if (!channel.streamExtension) throw new PlaybackUnavailableError('no_container_extension')
    const build = channel.kind === 'movie' ? buildVodUrl : buildSeriesUrl
    return build(
      credential.dns,
      credential.username,
      credential.password,
      channel.providerStreamId,
      channel.streamExtension,
    )
  }

  // Canal ao vivo: a extensão gravada (modo limitado, extraída da URL do
  // M3U) tem precedência sobre o formato da conta, porque é o que aquele
  // painel de fato serviu para aquele item.
  const format = channel.streamExtension ?? preferredFormat(credential.allowedFormats)
  // Sem formato declarado pela conta não se assume um: uma URL montada com
  // extensão chutada falha na TV de um jeito que parece problema de codec.
  if (!format) throw new PlaybackUnavailableError('no_allowed_format')

  return buildLiveUrl(
    credential.dns,
    credential.username,
    credential.password,
    channel.providerStreamId,
    format,
  )
}
