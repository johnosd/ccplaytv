import type { ReactNode } from 'react'
import { PosterArt } from '../../components/PosterArt'
import type { CatalogItemOut } from '../catalog/catalogApi'

export interface HomeLiveCardProps {
  item: CatalogItemOut
  focused: boolean
}

/**
 * Ícone de canal favorito na primeira fileira do Início (ad-hoc 2026-10-09, substitui o card "Ao vivo agora" da feature 060):
 * o logo do canal — ou as iniciais, quando não há logo ou ele falha — e o nome embaixo. Só apresentação: SELECT é de
 * `HomeContent`. A raiz carrega `data-item-id` e é o único `tv-focus`.
 */
export function HomeLiveCard({ item, focused }: HomeLiveCardProps): ReactNode {
  return (
    <div className={`home-live-card${focused ? ' tv-focus' : ''}`} data-item-id={item.id}>
      <span className="home-live-logo">
        <PosterArt url={item.icon_url ?? undefined} title={item.name} variant="logo" />
      </span>
      <span className="home-live-name">{item.name}</span>
    </div>
  )
}
