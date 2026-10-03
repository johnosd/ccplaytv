import { useState } from 'react'

/**
 * Fundo da hero de Filmes e Séries (feature 050, FR-001/FR-002): a capa real do
 * card focado, só quando existe. A camada `.vod-hero-art` está sempre no DOM; a
 * `<img>` some ao falhar (`onError`) e a mesma URL não é tentada de novo — mesmo
 * padrão de `LiveHeroArt`/`PosterArt`. Componente folha, sem refs nem scroll.
 */
export function VodHeroArt({ url }: { url?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined)
  const showImage = Boolean(url) && url !== failedUrl
  return (
    <div className="vod-hero-art" aria-hidden="true">
      {showImage && <img src={url} alt="" decoding="async" onError={() => setFailedUrl(url)} />}
    </div>
  )
}
