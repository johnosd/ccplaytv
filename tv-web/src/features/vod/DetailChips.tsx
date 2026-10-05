import type { ReactNode } from 'react'
import { useT } from '../../lib/i18n/I18nProvider'
import type { MetadataField } from '../../lib/metadata/types'
import { OriginTag } from './DetailMetadata'

/**
 * "Categoria e gêneros" do hero (feature 059, D-006, `logic/hero-cinema.md`
 * §5): a categoria declarada pela lista vem primeiro, num chip próprio, e
 * nunca é substituída pelos gêneros (constitution, "Categorias da Fonte São
 * Preservadas"). A origem dos gêneros fica FORA da lista — o `<li>` só tem o
 * valor. Texto da fonte nunca é traduzido.
 */
export function DetailChips({ category, genres }: { category: string; genres?: MetadataField<string> }): ReactNode {
  const t = useT()
  const seen = new Set([category.toLocaleLowerCase()])
  const genreList: string[] = []
  for (const genre of (genres?.value ?? '').split(/\s*,\s*/)) {
    const key = genre.trim().toLocaleLowerCase()
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    genreList.push(genre.trim())
  }

  return (
    <div className="vod-detail-chips-row">
      <ul className="vod-detail-chips" aria-label={t('detail.chips')}>
        <li className="vod-detail-chip vod-detail-chip--category">{category}</li>
        {genreList.map((genre) => (
          <li key={genre} className="vod-detail-chip">
            {genre}
          </li>
        ))}
      </ul>
      {genres && genreList.length > 0 && <OriginTag origin={genres.origin} />}
    </div>
  )
}
