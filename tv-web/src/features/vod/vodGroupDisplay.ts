import { groupLabel } from '../catalog/catalogApi'

/**
 * Rótulo de exibição de um grupo em Filmes/Séries: tira o prefixo redundante "Filmes |" / "Séries |" (o separador é
 * obrigatório — "Filmes de Ação" fica como está). Só apresentação: a identidade (chaves da trilha, memória de foco)
 * continua a do nome declarado pela fonte, via `groupLabel` — mesma regra de `liveGroupDisplay` na Live (feature 048).
 */
export function vodGroupDisplay(name: string | undefined | null): string {
  const label = groupLabel(name ?? undefined)
  const stripped = label.replace(/^(?:filmes?|movies?|s[eé]ries?)\s*[|:–—-]\s*/i, '').trim()
  return stripped || label
}
