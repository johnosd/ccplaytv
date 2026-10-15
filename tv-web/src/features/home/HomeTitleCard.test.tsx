import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { HomeTitleCard, type HomeTitleCardProps } from './HomeTitleCard'
import type { CardBadges } from './cardBadges'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'
import { buildStableId } from '../../lib/catalog/userStateRepository'
import { PROVIDER_FIELDS_VERSION } from '../../lib/metadata/titleMetadataStore'

/**
 * Card de título do Início (feature 060, FR-008/FR-009/FR-010 — `logic/cards-e-expansao.md` §3–§5): selos só quando se
 * aplicam, expansão só no foco, imagem 16:9 ou pôster + cor, e nenhuma informação inventada.
 */

const NO_BADGES: CardBadges = { isNew: false, rating: null, watched: false, favorite: false }

const ITEM: CatalogItemOut = {
  id: '77',
  kind: 'movie',
  name: 'Duna Vermelha',
  original_group: 'Ficção',
  published: true,
  playable: true,
  source_id: 'src-card',
  provider_stream_id: 'p77',
  original_name: 'Duna Vermelha',
  year: 2025,
  provider_rating: 7.9,
  icon_url: 'https://img.example.org/capa.jpg',
}

afterEach(async () => {
  cleanup()
  await db.titleMetadata.where('sourceId').equals('src-card').delete()
})

function renderCard(over: Partial<HomeTitleCardProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return render(<HomeTitleCard item={ITEM} format="poster" focused={false} badges={NO_BADGES} {...over} />, { wrapper })
}

describe('HomeTitleCard — selos (FR-008)', () => {
  it('sem selos que se apliquem, o card só tem o nome', () => {
    const { container } = renderCard()
    expect(container.querySelector('.home-card-title')?.textContent).toBe('Duna Vermelha')
    expect(container.querySelector('.home-badge')).toBeNull()
    expect(container.querySelector('.home-card-marks')).toBeNull()
    expect(container.querySelector('.sr-only')).toBeNull()
  })

  it('"Novo" e a nota aparecem no topo; assistido e Minha Lista embaixo, com o texto para leitor de tela', () => {
    const { container } = renderCard({ badges: { isNew: true, rating: 7.9, watched: true, favorite: true } })
    expect(container.querySelector('.home-badge--new')?.textContent).toBe('NOVO')
    expect(container.querySelector('.home-badge--rating')?.textContent).toContain('7,9')
    expect(container.querySelectorAll('.home-mark')).toHaveLength(2)
    // A cor e o glifo nunca são o único sinal: o texto está lá, só para quem não os vê.
    expect(container.querySelector('.sr-only')?.textContent).toBe('Assistido, Na Minha Lista')
  })

  it('a raiz carrega o id do item; o foco (tv-focus) fica só nela, nunca no pôster de dentro', () => {
    const { container } = renderCard({ focused: true })
    const root = container.querySelector('.home-card')!
    expect(root).toHaveAttribute('data-item-id', '77')
    expect(root).toHaveClass('tv-focus', 'is-expanded')
    expect(container.querySelectorAll('.tv-focus')).toHaveLength(1)
  })
})

describe('HomeTitleCard — expansão (FR-009)', () => {
  it('061: só o expandido mostra cache ou nota da descoberta; cache prevalece e nunca consulta', async () => {
    const discovery = { average: 8.7, votes: 80 }
    const small = renderCard({ tmdbRating: discovery })
    expect(small.container.querySelector('.tmdb-rating-badge, .content-rating-badge')).toBeNull()
    small.unmount()
    const onlyDiscovery = renderCard({ focused: true, tmdbRating: discovery })
    await waitFor(() => expect(onlyDiscovery.container.querySelector('.tmdb-rating-badge')).toHaveTextContent('TMDB 8,7'))
    expect(onlyDiscovery.container.querySelector('.content-rating-badge')).toBeNull()
    onlyDiscovery.unmount()
    const empty = renderCard({ focused: true })
    await waitFor(() => expect(empty.container.querySelector('.home-card-expanded')).not.toBeNull())
    expect(empty.container.querySelector('.tmdb-rating-badge, .content-rating-badge')).toBeNull()
    empty.unmount()
    await db.titleMetadata.put({
      stableId: buildStableId({ sourceId: 'src-card', kind: 'movie', providerStreamId: 'p77' }),
      sourceId: 'src-card', kind: 'movie',
      tmdb: { status: 'matched', tmdbId: 1, fields: { certifications: { BR: '14' }, tmdbRating: { average: 6.83, votes: 100 } } },
    })
    const cached = renderCard({ focused: true, tmdbRating: discovery })
    await waitFor(() => expect(cached.container.querySelector('.tmdb-rating-badge')).toHaveTextContent('TMDB 6,8'))
    expect(cached.container.querySelector('.content-rating-badge')).toHaveTextContent('14')
    expect(cached.container.querySelector('.home-card-expanded-meta button, .home-card-expanded-meta [tabindex]')).toBeNull()
  })

  it('sem foco o card não expande e não monta a camada expandida (nada é lido por card)', () => {
    const { container } = renderCard({ focused: false })
    expect(container.querySelector('.home-card')).not.toHaveClass('is-expanded')
    expect(container.querySelector('.home-card-expanded')).toBeNull()
  })

  it('com a imagem 16:9 no aparelho, ela é o fundo do card expandido; título, ano e "OK Detalhes" aparecem', () => {
    const { container } = renderCard({ focused: true, image: 'https://img.example.org/fundo.jpg' })
    const layer = container.querySelector('.home-card-expanded')!
    expect(layer).not.toHaveClass('home-card-expanded--poster')
    expect(layer.querySelector('img.home-card-expanded-img')).toHaveAttribute('src', 'https://img.example.org/fundo.jpg')
    expect(layer.querySelector('.home-card-expanded-title')?.textContent).toBe('Duna Vermelha')
    expect(layer.querySelector('.home-card-expanded-meta')?.textContent).toContain('2025')
    expect(layer.querySelector('.home-card-expanded-hint')?.textContent).toContain('Detalhes')
  })

  it('sem imagem 16:9, o pôster à esquerda e as informações sobre a cor da capa (nenhuma imagem inventada)', () => {
    const { container } = renderCard({ focused: true })
    const layer = container.querySelector('.home-card-expanded')!
    expect(layer).toHaveClass('home-card-expanded--poster')
    expect(layer.querySelector('img.home-card-expanded-img')).toBeNull()
    expect(layer.querySelector('.home-card-expanded-cover')).not.toBeNull()
  })

  it('a sinopse e a duração só aparecem se a metadata JÁ está guardada; senão a linha não existe', async () => {
    const withoutCache = renderCard({ focused: true })
    await waitFor(() => expect(withoutCache.container.querySelector('.home-card-expanded-info')).not.toBeNull())
    expect(withoutCache.container.querySelector('.home-card-expanded-synopsis')).toBeNull()
    withoutCache.unmount()

    await db.titleMetadata.put({
      stableId: buildStableId({ sourceId: 'src-card', kind: 'movie', providerStreamId: 'p77' }),
      sourceId: 'src-card',
      kind: 'movie',
      provider: { synopsis: 'Uma cartógrafa atravessa um deserto.', durationSeconds: 7920, genres: 'Aventura' },
      providerFetchedAt: Date.now(),
      providerVersion: PROVIDER_FIELDS_VERSION,
    })
    const { container } = renderCard({ focused: true })
    await waitFor(() => expect(container.querySelector('.home-card-expanded-synopsis')?.textContent).toBe('Uma cartógrafa atravessa um deserto.'))
    expect(container.querySelector('.home-card-expanded-meta')?.textContent).toContain('2 h 12 min')
    expect(container.querySelector('.home-card-expanded-meta')?.textContent).toContain('Aventura')
  })
})

describe('HomeTitleCard — Continuar assistindo (FR-010)', () => {
  it('com progresso real: barra com a largura certa e a legenda embaixo, fora do card focável', () => {
    const { container } = renderCard({
      format: 'continue',
      progress: { percent: 40, remainingSeconds: 1800 },
      caption: 'T1:E3 · faltam 30 min',
    })
    expect(container.querySelector<HTMLElement>('.home-card-progress i')!.style.width).toBe('40%')
    expect(container.querySelector('.home-card-caption')?.textContent).toBe('T1:E3 · faltam 30 min')
    expect(container.querySelector('.home-card')).not.toContainElement(container.querySelector<HTMLElement>('.home-card-caption'))
  })

  it('sem progresso nem legenda: nada de barra nem de "faltam"', () => {
    const { container } = renderCard({ format: 'continue', progress: null })
    expect(container.querySelector('.home-card-progress')).toBeNull()
    expect(container.querySelector('.home-card-caption')).toBeNull()
    expect(screen.queryByText(/faltam/)).toBeNull()
  })

  it('o rosto do card 16:9 é a imagem larga quando existe; senão a capa', () => {
    const wide = renderCard({ format: 'continue', image: 'https://img.example.org/larga.jpg' })
    expect(wide.container.querySelector('.home-card > .poster-box .poster-box-art')).toHaveAttribute('src', 'https://img.example.org/larga.jpg')
    wide.unmount()
    const cover = renderCard({ format: 'continue' })
    expect(cover.container.querySelector('.home-card > .poster-box .poster-box-art')).toHaveAttribute('src', 'https://img.example.org/capa.jpg')
  })
})

describe('HomeTitleCard — Top 10', () => {
  it('o numeral é decorativo e fica fora do card focável; o foco não o inclui', () => {
    const { container } = renderCard({ format: 'rank', rank: 3, focused: true })
    const numeral = container.querySelector<HTMLElement>('.home-rank-numeral')!
    expect(numeral.textContent).toBe('3')
    expect(numeral).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.home-card')).not.toContainElement(numeral)
    expect(container.querySelectorAll('.tv-focus')).toHaveLength(1)
  })
})
