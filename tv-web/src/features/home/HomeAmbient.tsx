import { useState, type CSSProperties, type ReactNode } from 'react'
import { useCoverColor } from '../vod/useCoverColor'
import { usePanelHosts } from '../vod/usePanelHosts'

export interface HomeAmbientProps {
  /** Imagem 16:9 do item (só do que já está no aparelho — `useHomeImages`); ausente = só a cor. */
  imageUrl?: string
  /** Capa do item: dela sai a cor dominante quando não há imagem (regra "sem risco" da 059). */
  coverUrl?: string
  /** Fundo esmaecido (foco nas fileiras): a imagem não pode competir com os cards (FR-007). */
  dim: boolean
}

/**
 * Fundo ambiente do Início (feature 060, D-004/D-005 — `logic/billboard-e-navegacao.md` §6). Só apresentação: camadas cor da
 * capa (ou gradiente neutro do tema) → imagem 16:9 → vinheta. Uma `<img>` por vez e nenhum `filter: blur`. A URL da imagem
 * nunca vai para log, erro ou tela (FR-026): falha de carregamento só tira a imagem e deixa a cor.
 */
export function HomeAmbient({ imageUrl, coverUrl, dim }: HomeAmbientProps): ReactNode {
  const color = useCoverColor(coverUrl, usePanelHosts())
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined)
  const showImage = imageUrl !== undefined && imageUrl !== failedUrl
  const style = color ? ({ '--home-ambient': color } as CSSProperties) : undefined

  return (
    <div className={`home-ambient${dim ? ' is-dim' : ''}${color ? ' has-cover-color' : ''}`} style={style} aria-hidden="true">
      {showImage && (
        // `key`: troca de imagem = nó novo (entra com fade); o anterior sai na hora, então só há uma `<img>` por vez.
        <img key={imageUrl} className="home-ambient-img" src={imageUrl} alt="" decoding="async" onError={() => setFailedUrl(imageUrl)} />
      )}
      <div className="home-ambient-scrim" />
    </div>
  )
}
