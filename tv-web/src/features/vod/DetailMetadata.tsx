import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import type { CastPerson } from '../../lib/catalog/db'
import type { MetadataField, MetadataOrigin } from '../../lib/metadata/types'
import { castNames, isSynopsisTruncated, type FactRow } from './detailMetadataFormat'
import { useT } from '../../lib/i18n/I18nProvider'
import { APP_LANGUAGE_LOCALE } from '../../lib/i18n/languages'
import { languageDisplayName } from '../../lib/player/tracks'

/**
 * Peças de metadata compartilhadas pelo detalhe de filme e de série
 * (feature 032, `logic/detalhe-com-metadata.md`). Só apresentação: nenhuma
 * delas busca dado — quem monta a tela lê `useTitleMetadata` (D-002). As
 * regras puras (limite da sinopse, formato de duração, linhas de fatos) ficam
 * em `detailMetadataFormat.ts`.
 */

/**
 * Selo de origem (FR-022): só o que veio do TMDB é sinalizado; o que veio do
 * provedor não ganha selo (é o padrão). Sinopse em idioma original (FR-021)
 * diz o idioma.
 */
export function OriginTag({ origin, language }: { origin: MetadataOrigin; language?: string }): ReactNode {
  const t = useT()
  if (origin !== 'tmdb' && !language) return null
  const parts: string[] = []
  if (origin === 'tmdb') parts.push(t('detail.origin.tmdb'))
  if (language) parts.push(t('detail.origin.inLanguage', { language: languageDisplayName(language, t.language, { loose: true }).toLocaleLowerCase(APP_LANGUAGE_LOCALE[t.language]) }))
  return <span className="vod-detail-origin">{parts.join(' · ')}</span>
}

/**
 * Fundo do hero — nunca `background-image` no `.screen` (D-008): `<img>` FILHO do hero.
 *
 * `origin` (FR-022, T046): a imagem que veio do TMDB leva o mesmo selo
 * "Dados: TMDB" dos demais campos; a do provedor não leva nada. O selo fica FORA
 * do contêiner `aria-hidden` (a imagem é decorativa, a origem não é) e some junto
 * com a imagem se ela falhar ao carregar — nada a atribuir.
 */
export function DetailBackdrop({ url, origin }: { url: string | undefined; origin?: MetadataOrigin }): ReactNode {
  const t = useT()
  const [failed, setFailed] = useState<string | null>(null)
  if (!url || failed === url) return null
  return (
    <>
      <div className="vod-detail-backdrop" aria-hidden="true">
        <img src={url} alt="" onError={() => setFailed(url)} />
      </div>
      {origin === 'tmdb' && <span className="vod-detail-origin vod-detail-backdrop-origin">{t('detail.origin.tmdb')}</span>}
    </>
  )
}

export interface SynopsisBlockProps {
  synopsis: (MetadataField<string> & { language?: string }) | undefined
  moreFocused: boolean
  onMore: () => void
}

/** Sinopse truncada em ~3 linhas + "Ver mais" focável quando não cabe (FR-004). */
export function SynopsisBlock({ synopsis, moreFocused, onMore }: SynopsisBlockProps): ReactNode {
  const t = useT()
  if (!synopsis) return null
  return (
    <div className="vod-detail-synopsis-block">
      <p className="vod-detail-synopsis">{synopsis.value}</p>
      <OriginTag origin={synopsis.origin} language={synopsis.language} />
      {isSynopsisTruncated(synopsis.value) && (
        <button
          type="button"
          className={`vod-detail-more${moreFocused ? ' tv-focus' : ''}`}
          aria-haspopup="dialog"
          onClick={onMore}
        >
          {t('detail.seeMore')}
        </button>
      )}
    </div>
  )
}

/** Quanto a sinopse completa rola por ↑/↓ — um pedaço da altura visível, nunca a página. */
const SYNOPSIS_SCROLL_STEP = 160

export function SynopsisModal({ text, onClose }: { text: string; onClose: () => void }): ReactNode {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  return (
    <Modal
      ariaLabel={t('detail.fullSynopsis')}
      onBack={onClose}
      onSelect={onClose}
      onDirection={(direction) => {
        const element = scrollRef.current
        if (!element) return
        if (direction === 'down') element.scrollTop += SYNOPSIS_SCROLL_STEP
        if (direction === 'up') element.scrollTop -= SYNOPSIS_SCROLL_STEP
      }}
    >
      <div ref={scrollRef} className="synopsis-modal-text no-scrollbar">
        {text}
      </div>
    </Modal>
  )
}

/**
 * Aba "Elenco" (feature 032, ad-hoc T044): os nomes que o provedor (ou o TMDB,
 * onde o provedor não disse) informou, em lista. É só texto — com casamento no
 * TMDB a aba mostra `CastPeoplePanel` (feature 035) no lugar deste. Sem elenco informado a aba diz isso, em
 * vez de ficar vazia ou de inventar um nome; a fileira de abas continua o
 * elemento focável (nenhum beco sem saída).
 */
export function CastPanel({ cast, loading }: { cast: MetadataField<string> | undefined; loading: boolean }): ReactNode {
  const t = useT()
  const names = cast ? castNames(cast.value) : []
  if (!cast || names.length === 0) {
    return <p className="vod-cast-empty">{loading ? t('detail.cast.loading') : t('detail.cast.empty')}</p>
  }
  return (
    <div className="vod-cast">
      <ul className="vod-cast-list" aria-label={t('detail.tab.cast')}>
        {names.map((name) => (
          <li key={name} className="vod-cast-item">
            {name}
          </li>
        ))}
      </ul>
      <OriginTag origin={cast.origin} />
    </div>
  )
}

/**
 * Foto de uma pessoa do TMDB (feature 035). Sem foto, ou se ela falhar ao
 * carregar, o marcador neutro (iniciais) cobre — nunca o ícone de imagem
 * quebrada do navegador (mesma regra do `PosterArt`).
 */
export function PersonPhoto({ url, name, focused }: { url: string | undefined; name: string; focused?: boolean }): ReactNode {
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined)
  const showImage = Boolean(url) && url !== failedUrl
  const initials = name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <div className={`person-photo${focused ? ' tv-focus' : ''}`}>
      <span className="person-photo-initials" aria-hidden="true">
        {initials}
      </span>
      {showImage && <img className="person-photo-img" src={url} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(url)} />}
    </div>
  )
}

export const personFocusKey = (personId: number): string => `person:${personId}`

/**
 * Aba "Elenco" com identidade TMDB (feature 035, US3, D-006): foto, nome e
 * personagem (só quando o TMDB informa), navegáveis. Substitui o texto da 032
 * só quando o título casou — nunca mistura as duas listas. Fileira simples
 * (no máximo 20 pessoas) pelo mesmo motivo do `SimilarPanel`.
 */
export function CastPeoplePanel({
  people,
  focusedKey,
  onSelectPerson,
}: {
  people: CastPerson[]
  focusedKey: string | undefined
  onSelectPerson: (person: CastPerson) => void
}): ReactNode {
  const t = useT()
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusedKey === undefined) return
    const cards = rowRef.current?.querySelectorAll<HTMLElement>('[data-person-key]')
    for (const card of cards ?? []) {
      if (card.dataset.personKey === focusedKey) card.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    }
  }, [focusedKey])

  return (
    <div className="cast-people">
      <div ref={rowRef} className="cast-people-row no-scrollbar" aria-label={t('detail.tab.cast')}>
        {people.map((person) => (
          <div
            key={person.personId}
            className="cast-person"
            data-person-key={personFocusKey(person.personId)}
            onClick={() => onSelectPerson(person)}
          >
            <PersonPhoto url={person.photoUrl} name={person.name} focused={focusedKey === personFocusKey(person.personId)} />
            <div className="cast-person-name">{person.name}</div>
            {person.character && <div className="cast-person-character">{person.character}</div>}
          </div>
        ))}
      </div>
      <OriginTag origin="tmdb" />
    </div>
  )
}

/**
 * Origem de um fato nos CARTÕES da aba Detalhes (feature 059, D-006,
 * `logic/hero-cinema.md` §7): aqui as duas origens aparecem — "Dados: TMDB" e
 * "Dados: fonte". Fora dos cartões vale o `OriginTag` (regra da 032: só o TMDB).
 */
export function FactOrigin({ origin }: { origin: MetadataOrigin }): ReactNode {
  const t = useT()
  return (
    <span className={`vod-detail-origin vod-detail-fact-origin vod-detail-fact-origin--${origin}`}>
      {t(origin === 'tmdb' ? 'detail.origin.tmdb' : 'detail.origin.source')}
    </span>
  )
}

export function MetadataFacts({ rows }: { rows: FactRow[] }): ReactNode {
  return (
    <>
      {rows.map((row) => (
        <div key={row.label} className="vod-detail-fact">
          <dt>{row.label}</dt>
          <dd>
            {row.value}
            <FactOrigin origin={row.origin} />
          </dd>
        </div>
      ))}
    </>
  )
}
