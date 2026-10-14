import type { ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { PosterArt } from '../../components/PosterArt'
import type { TmdbTitleRef } from '../../lib/catalog/db'
import { useT } from '../../lib/i18n/I18nProvider'
import { OriginTag } from './DetailMetadata'

/**
 * Resumo de um título do TMDB que NÃO está nas categorias já abertas da lista
 * (feature 035, D-011, `logic/aba-semelhantes.md` §4). Só dado já guardado —
 * nenhuma requisição ao abrir — e nenhuma ação de assistir. OK ou RETURN fecham.
 */
export function TitleSummaryModal({ title, onClose }: { title: TmdbTitleRef; onClose: () => void }): ReactNode {
  const t = useT()
  return (
    <Modal ariaLabel={t('detail.summary.title', { title: title.title })} onBack={onClose} onSelect={onClose}>
      <div className="title-summary">
        <div className="title-summary-poster">
          <PosterArt url={title.posterUrl} title={title.title} />
        </div>
        <div className="title-summary-info">
          <div className="title-summary-title">{title.title}</div>
          {title.year !== undefined && <div className="title-summary-meta">{title.year}</div>}
          <p className="title-summary-overview">{title.overview ?? t('detail.summary.noOverview')}</p>
          <p className="title-summary-note">{t('detail.summary.note')}</p>
          <OriginTag origin="tmdb" />
          <button type="button" className="button-secondary tv-focus" onClick={onClose}>
            {t('detail.summary.close')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
