import { useEffect } from 'react'
import { slotStatusOf, type AssemblySlot } from '../../lib/assembly/screenAssembly'
import { useScreenAssembly, type ScreenAssembly } from '../../lib/assembly/useScreenAssembly'
import { STAGE_WIDTH } from '../../lib/stage'
import { HOME_ROW_FORMATS, type HomeRowFormat } from './homeRowFormats'
import { HOME_ROW_ORDER, type HomeRowKey } from './homeRows'

/** Slots da montagem do Início (feature 079, `logic/montagem-de-tela.md` §4): o billboard e as cinco fileiras. */
export type HomeSlotKey = 'hero' | HomeRowKey

interface Read<T> {
  data: T | undefined
  isError?: boolean
}

/** Só o que a montagem lê de um item (`CatalogItemOut` tem esta forma; arquivo novo não importa `features/catalog`). */
interface CardItem {
  id: string
  icon_url?: string | null
}

export interface HomeReads {
  hero: Read<unknown>
  channels: Read<{ items: readonly CardItem[] }>
  continue: Read<readonly { item: CardItem }[]>
  mylist: Read<{ items: readonly CardItem[] }>
  addedMovies: Read<readonly CardItem[]>
  addedSeries: Read<readonly CardItem[]>
}

const ROW_FORMAT: Record<HomeRowKey, HomeRowFormat> = {
  channels: 'live',
  continue: 'continue',
  mylist: 'poster',
  'added-movies': 'poster',
  'added-series': 'poster',
}

function rowItems(reads: HomeReads, key: HomeRowKey): readonly CardItem[] {
  if (key === 'channels') return reads.channels.data?.items ?? []
  if (key === 'continue') return (reads.continue.data ?? []).map((card) => card.item)
  if (key === 'mylist') return reads.mylist.data?.items ?? []
  return (key === 'added-movies' ? reads.addedMovies.data : reads.addedSeries.data) ?? []
}

/**
 * Capas da primeira tela (§5): com o billboard expandido, só a primeira fileira com dado espia embaixo — os cards que
 * cabem na largura, com a mesma face que o card desenha. O fundo do billboard não entra (decisão da entrevista).
 */
export function homeFirstScreenImages(reads: HomeReads, images: ReadonlyMap<string, string>): string[] {
  const first = HOME_ROW_ORDER.find((key) => rowItems(reads, key).length > 0)
  if (!first) return []
  const format = ROW_FORMAT[first]
  const visible = Math.ceil(STAGE_WIDTH / HOME_ROW_FORMATS[format].itemWidth)
  const urls: string[] = []
  for (const item of rowItems(reads, first).slice(0, visible)) {
    const url = format === 'continue' ? (images.get(item.id) ?? item.icon_url) : item.icon_url
    if (url) urls.push(url)
  }
  return urls
}

/**
 * Montagem do Início: o hero é a leitura principal (em cache, a Home aparece no 1º quadro) e âncora (chegando depois do
 * teto, não troca o billboard). `userActionKey` muda quando a pessoa fecha o player: o que a releitura trouxer entra.
 */
export function useHomeAssembly(reads: HomeReads, images: ReadonlyMap<string, string>, userActionKey?: number): ScreenAssembly<HomeSlotKey> {
  const slots: AssemblySlot<HomeSlotKey>[] = [
    { key: 'hero', status: slotStatusOf(reads.hero, () => false), primary: true, anchor: true },
    ...HOME_ROW_ORDER.map((key) => ({ key, status: slotStatusOf(readOf(reads, key), () => rowItems(reads, key).length === 0) })),
  ]
  const assembly = useScreenAssembly({ screen: 'home', slots, imageUrls: homeFirstScreenImages(reads, images) })
  const { follow } = assembly
  useEffect(() => {
    if (userActionKey) follow()
  }, [userActionKey, follow])
  return assembly
}

function readOf(reads: HomeReads, key: HomeRowKey): Read<unknown> {
  if (key === 'channels') return reads.channels
  if (key === 'continue') return reads.continue
  if (key === 'mylist') return reads.mylist
  return key === 'added-movies' ? reads.addedMovies : reads.addedSeries
}
