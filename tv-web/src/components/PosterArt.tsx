import { useState, type ReactNode } from 'react'

export interface PosterArtProps {
  /**
   * URL de capa já validada na captura (classifier.ts, `normalizeIconUrl`,
   * D-001b) — este componente só decide "existe ou não", nunca reparseia.
   */
  url?: string
  title: string
  focused?: boolean
  /** Overlay opcional por cima do card (ex.: `.fav-star`), como `MoviesScreen`/`SeriesScreen` já usam. */
  children?: ReactNode
}

/**
 * Card de pôster com capa real e fallback (feature 015, D-005/D-006/D-007).
 *
 * A camada de placeholder (textura + título) nunca deixa de existir no
 * DOM — a `<img>`, quando há `url`, só cobre por cima. Ao falhar
 * (`onError`), a `<img>` some e o placeholder, que já estava lá, cobre o
 * fallback sem nenhum estado condicional extra. Falha é definitiva pra
 * aquela URL: só uma `url` nova (ex.: depois de ressincronizar a fonte)
 * tenta carregar de novo — nunca uma repetição automática da mesma URL.
 *
 * Carregamento nunca bloqueia foco/seleção: o card é focável e selecionável
 * antes, durante e depois da imagem carregar (constitution, "Foco Visível
 * e Sem Becos Sem Saída"). `loading="lazy"` + `decoding="async"` somados à
 * janela da virtualização (feature 009) — só os cards visíveis (+
 * overscan) chegam a montar `<img>` nenhuma, então uma categoria inteira
 * nunca é requisitada de uma vez (D-007).
 */
export function PosterArt({ url, title, focused, children }: PosterArtProps) {
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined)
  const showImage = Boolean(url) && url !== failedUrl

  return (
    <div className={`poster-box${focused ? ' tv-focus' : ''}`}>
      <div className="poster-box-noise" />
      <span className="poster-box-label">
        pôster
        <br />
        {title}
      </span>
      {showImage && (
        <img
          className="poster-box-art"
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(url)}
        />
      )}
      {children}
    </div>
  )
}
