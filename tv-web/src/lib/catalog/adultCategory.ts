/**
 * Regras puras de "nome adulto" e de bloqueio salvo de uma categoria (features 066/067). Sem `db.ts` de propósito: a
 * migração do PIN roda dentro do `.upgrade()` da Dexie v21, carregado por `db.ts` → `dbSchema.ts`, e um import de volta
 * para `db.ts` formaria um ciclo (`sdd/specs/067-configuracoes-lista-global/logic/pin-por-lista.md` §4, R-003).
 */

/** Minúsculas, sem acentos/diacríticos, espaços das pontas removidos e internos colapsados (FR-007 da busca). */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Termos fixos de "nome adulto" (FR-023 da 066, `logic/acesso-categorias.md` §4), sobre o nome normalizado (minúsculas,
 * sem acento): palavra inteira — "adulteração" não é adulto — ou "+18"/"18+"/"[18]" fora de um número maior ("2018"
 * não). Só o nome que a lista declara; nada externo, nada de IA. Falso positivo aceito: "Adult Swim" (R-006 da 066).
 */
const ADULT_NAME = /(^|[^a-z0-9])(xxx|adults?|adult[oa]s?|porn\w*|erotic[oa]?s?)([^a-z0-9]|$)|(^|[^0-9])(\+18|18\+)([^0-9]|$)|\[\s*18\s*\]/

/** Nome declarado pela lista parece adulto (FR-023 da 066). */
export function isAdultCategoryName(name: string | undefined): boolean {
  return name !== undefined && ADULT_NAME.test(normalizeForSearch(name))
}

/** O que a pessoa decidiu sobre uma categoria (só os campos que pesam no bloqueio). */
export interface LockPreference {
  locked?: boolean
  declinedSuggestion?: boolean
}

/**
 * Bloqueio salvo de uma categoria, sem olhar a sessão (`066/logic/acesso-categorias.md` §1): sem PIN na lista, nada
 * bloqueia; decisão explícita vence; sem decisão, bloqueia o nome adulto que não teve a sugestão recusada.
 */
export function isSavedLock(pinActive: boolean, preference: LockPreference | undefined, name: string | undefined): boolean {
  if (!pinActive) return false
  if (preference?.locked !== undefined) return preference.locked
  return preference?.declinedSuggestion !== true && isAdultCategoryName(name)
}
