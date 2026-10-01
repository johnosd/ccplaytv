import type { ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { PosterArt } from '../../components/PosterArt'
import type { TmdbTitleRef } from '../../lib/catalog/db'
import { OriginTag } from './DetailMetadata'

/**
 * Resumo de um título do TMDB que NÃO está nas categorias já abertas da lista
 * (feature 035, D-011, `logic/aba-semelhantes.md` §4). Só dado já guardado —
 * nenhuma requisição ao abrir — e nenhuma ação de assistir. OK ou RETURN fecham.
 */
export function TitleSummaryModal({ title, onClose }: { title: TmdbTitleRef; onClose: () => void }): ReactNode {
  return (
    <Modal ariaLabel={`Resumo de ${title.title}`} onBack={onClose} onSelect={onClose}>
      <div className="title-summary">
        <div className="title-summary-poster">
          <PosterArt url={title.posterUrl} title={title.title} />
        </div>
        <div className="title-summary-info">
          <div className="title-summary-title">{title.title}</div>
          {title.year !== undefined && <div className="title-summary-meta">{title.year}</div>}
          <p className="title-summary-overview">{title.overview ?? 'Sinopse não informada pelo TMDB.'}</p>
          <p className="title-summary-note">Este título não está nas categorias já abertas da sua lista.</p>
          <OriginTag origin="tmdb" />
          <button type="button" className="button-secondary tv-focus" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  )
}
