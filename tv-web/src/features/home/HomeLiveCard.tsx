import type { ReactNode } from 'react'
import { PosterArt } from '../../components/PosterArt'
import { useLanguage, useT } from '../../lib/i18n/I18nProvider'
import { formatEpgClock } from '../../lib/epg/formatEpgTime'
import type { NowNext } from '../../lib/epg/types'
import type { CatalogItemOut } from '../catalog/catalogApi'

export interface HomeLiveCardProps {
  item: CatalogItemOut
  /** Número de exibição (`channelNumberOf`); `undefined` = não derivável — sem número, nunca um número inventado. */
  number?: string
  /** Programa em exibição agora, com o progresso REAL (`nowNextForChannel`); `undefined` = sem EPG, sem programa nem barra. */
  now?: NowNext['now']
  focused: boolean
}

/**
 * Card de "Ao vivo agora" (feature 060, FR-012 — `logic/fileiras-e-dados.md` §4): logo, número e nome do canal, selo
 * `AO VIVO` e, só com EPG, o programa atual com a barra de tempo real. Só apresentação: mostra apenas o programa atual (o
 * "A seguir" não entra no card da Home — FR-027 da feature 030). A raiz carrega `data-item-id` e é o único `tv-focus`.
 */
export function HomeLiveCard({ item, number, now, focused }: HomeLiveCardProps): ReactNode {
  const t = useT()
  const language = useLanguage()

  return (
    <div className={`home-live-card${focused ? ' tv-focus' : ''}`} data-item-id={item.id}>
      <div className="home-live-top">
        <span className="home-live-logo">
          <PosterArt url={item.icon_url ?? undefined} title={item.name} variant="logo" />
        </span>
        <span className="home-live-name">
          {number !== undefined && <span className="home-live-number">{number}</span>}
          {item.name}
        </span>
        <span className="home-live-badge">{t('home.live.badge')}</span>
      </div>
      {now && (
        <div className="home-live-bottom">
          <div className="home-live-program">{now.title}</div>
          <div className="home-live-time">
            <span>{formatEpgClock(now.start, language)}</span>
            <div className="home-live-bar" aria-hidden="true">
              <i style={{ width: `${Math.round(now.progress * 100)}%` }} />
            </div>
            <span>{formatEpgClock(now.end, language)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
