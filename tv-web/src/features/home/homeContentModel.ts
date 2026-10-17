import type { CSSProperties } from 'react'
import type { Translator } from '../../lib/i18n/translate'
import type { BillboardAction } from './HomeBillboard'
import { FOCUS_PAD, HOME_ROW_FORMATS, type HomeRowFormat } from './homeRowFormats'

/**
 * Modelo puro do conteúdo do Início (saiu de `HomeContent.tsx` na feature 079, para o arquivo caber no teto da ratchet).
 * Tipado pela forma — sem importar `features/catalog` (a ratchet barra feature→feature em arquivo novo).
 */

export const SEE_ALL_ID = '__see-all__'
const MOVIES_ID = '__movies__'
const SERIES_ID = '__series__'

export type MyListRailItem<T> = { kind: 'item'; item: T } | { kind: 'movies'; count: number } | { kind: 'series'; count: number }
export type ChannelRailItem<T> = { kind: 'channel'; item: T } | { kind: 'see-all'; count: number }

export function myListRailId<T extends { id: string }>(entry: MyListRailItem<T>): string {
  if (entry.kind === 'item') return entry.item.id
  return entry.kind === 'movies' ? MOVIES_ID : SERIES_ID
}

export function channelRailId<T extends { id: string }>(entry: ChannelRailItem<T>): string {
  return entry.kind === 'channel' ? entry.item.id : SEE_ALL_ID
}

/** O que o billboard precisa saber do hero (`HomeHeroOut` de `catalogApi.ts` tem esta forma). */
export type HeroShape =
  | { kind: 'welcome' }
  | { kind: 'continue' | 'favorite'; primary: { type: 'play'; resume: boolean } | { type: 'open-detail' } }

/**
 * Ações do billboard: a primária e "Minha Lista" ("Mais informações" e Trailer saíram no ad-hoc de 2026-10-09). Sem hero
 * — boas-vindas ou ainda não mostrado (feature 079, modo neutro) — são os atalhos.
 */
export function heroEntries(hero: HeroShape | undefined, isFavorite: boolean, t: Translator): BillboardAction[] {
  if (!hero || hero.kind === 'welcome') {
    return [
      { id: 'shortcut-live', label: t('home.shortcut.live') },
      { id: 'shortcut-movies', label: t('home.shortcut.movies') },
    ]
  }
  const primaryLabel = hero.primary.type === 'open-detail' || !hero.primary.resume ? t('home.hero.watch') : t('home.hero.continue')
  return [
    { id: 'primary', label: primaryLabel },
    { id: 'mylist', label: isFavorite ? t('home.hero.inMyList') : t('home.hero.addMyList') },
  ]
}

/** Medidas de uma fileira como variáveis CSS: o CSS nunca repete px (FR-024, `homeRowFormats.ts`). */
export function rowStyle(format: HomeRowFormat): CSSProperties {
  const m = HOME_ROW_FORMATS[format]
  return {
    '--home-card-w': `${m.cardWidth}px`,
    '--home-card-h': `${m.cardHeight}px`,
    '--home-card-expanded-w': `${m.expandedCardWidth}px`,
    '--home-card-expanded-h': `${m.expandedCardHeight}px`,
    '--home-focus-pad': `${FOCUS_PAD}px`,
    '--home-numeral-w': `${m.numeralWidth}px`,
    '--home-numeral-overlap': `${m.numeralOverlap}px`,
  } as CSSProperties
}
