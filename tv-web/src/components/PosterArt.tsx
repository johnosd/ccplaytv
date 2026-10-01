import { useState, type ReactNode } from 'react'

export interface PosterArtProps {
  /**
   * URL de capa já validada na captura (classifier.ts, `normalizeIconUrl`,
   * D-001b) — este componente só decide "existe ou não", nunca reparseia.
   */
  url?: string
  title: string
  focused?: boolean
  /**
   * `'poster'` (padrão): rótulo "pôster" + título — idêntico ao
   * comportamento anterior à feature 024, inclusive para o contrato travado
   * da feature 022 (C5). `'logo'` (feature 024, D-007): placeholder mostra
   * as iniciais do título em vez do rótulo "pôster", para o logo de canal
   * da Live TV.
   */
  variant?: 'poster' | 'logo'
  /** Overlay opcional por cima do card (ex.: `.fav-star`), como `MoviesScreen`/`SeriesScreen` já usam. */
  children?: ReactNode
}

/**
 * Iniciais do título para o placeholder de logo (feature 024, D-007): até 3
 * caracteres, maiúsculas. Nome de uma palavra só usa as 3 primeiras letras
 * dela; duas ou mais palavras usam a inicial de cada uma (até 3), porque um
 * logo de canal precisa de algo reconhecível mesmo sem imagem, e um nome de
 * uma palavra só ("ESPN") viraria uma única letra do jeito ingênuo.
 */
function initialsOf(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
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
export function PosterArt({ url, title, focused, variant = 'poster', children }: PosterArtProps) {
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined)
  const showImage = Boolean(url) && url !== failedUrl

  return (
    <div className={`poster-box${variant === 'logo' ? ' poster-box-logo' : ''}${focused ? ' tv-focus' : ''}`}>
      <div className="poster-box-noise" />
      {variant === 'logo' ? (
        <span className="poster-box-label poster-box-initials" aria-hidden="true">
          {initialsOf(title)}
        </span>
      ) : (
        <span className="poster-box-label">
          pôster
          <br />
          {title}
        </span>
      )}
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
