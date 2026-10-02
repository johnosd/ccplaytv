import { useState } from 'react'

/**
 * Fundo do destaque da Live (feature 048, FR-005): o logo real do canal, só
 * quando existe. A camada `.live-hero-art` está sempre no DOM; a `<img>` some
 * ao falhar (`onError`) e a mesma URL não é tentada de novo — mesmo padrão do
 * `PosterArt`. Componente folha (só este estado), sem refs/scroll: não
 * altera a reconciliação das colunas de `liveColumns.tsx`.
 */
export function LiveHeroArt({ url }: { url?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined)
  const showImage = Boolean(url) && url !== failedUrl
  return (
    <div className="live-hero-art" aria-hidden="true">
      {showImage && <img src={url} alt="" decoding="async" onError={() => setFailedUrl(url)} />}
    </div>
  )
}
