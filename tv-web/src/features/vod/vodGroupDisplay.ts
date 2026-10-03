import { createTranslator, type Translator } from '../../lib/i18n/translate'
import { groupLabel } from '../catalog/catalogApi'
import { UNGROUPED_LABEL } from '../live/groupChannels'

/** O nome do grupo como a fonte declarou (sem tirar prefixo), com o rótulo "Sem categoria" do app traduzido. */
export function groupLabelDisplay(name: string | undefined | null, t: Translator = createTranslator('pt')): string {
  const label = groupLabel(name ?? undefined)
  return label === UNGROUPED_LABEL ? t('live.ungrouped') : label
}

/**
 * Rótulo de exibição de um grupo em Filmes/Séries: tira o prefixo redundante "Filmes |" / "Séries |" (o separador é
 * obrigatório — "Filmes de Ação" fica como está). Só apresentação: a identidade (chaves da trilha, memória de foco)
 * continua a do nome declarado pela fonte, via `groupLabel` — mesma regra de `liveGroupDisplay` na Live (feature 048).
 * O rótulo "Sem categoria" que o app dá ao que a fonte não agrupou é traduzido (feature 054); `t` omitido = português.
 */
export function vodGroupDisplay(name: string | undefined | null, t: Translator = createTranslator('pt')): string {
  const label = groupLabel(name ?? undefined)
  if (label === UNGROUPED_LABEL) return t('live.ungrouped')
  const stripped = label.replace(/^(?:filmes?|movies?|s[eé]ries?)\s*[|:–—-]\s*/i, '').trim()
  return stripped || label
}
