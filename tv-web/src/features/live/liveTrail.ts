import { groupLabel, type CatalogCategory } from '../catalog/catalogApi'
import type { HintItem } from '../shell/HintBar'
import type { LiveEntryKey } from './liveSessionMemory'

/**
 * Tipos, regras puras e constantes da trilha e da lista da TV ao vivo.
 * Extraídos da `LiveScreen` na feature 040 sem mudar nada
 * (`sdd/specs/040-dividir-player-live/logic/divisao.md` §3).
 */

/**
 * Altura de linha do painel de canais (feature 009) — soma da altura fixa
 * de `.live-channel-row` (`live.css`, feature 024) com o espaçamento entre
 * itens que a posição absoluta não herda mais do `gap` do flex column.
 */
export const LIVE_ITEM_ROW_HEIGHT = 84
export const LIVE_ITEM_OVERSCAN = 6

/** Ações do painel de preview, na ordem vertical (feature 024, D-005). */
export const PREVIEW_ACTION_COUNT = 3

export const LIVE_HINTS: HintItem[] = [
  { keyLabel: 'OK', action: 'Assistir' },
  { keyLabel: 'Segurar OK', action: 'Favoritar' },
  { keyLabel: 'RETURN', action: 'Voltar' },
]

/**
 * A trilha de categorias (feature 013) é "★ Favoritos" seguida das
 * categorias declaradas pela fonte — Favoritos nunca é gravado nem conta
 * como categoria (D-004 do plan.md), então a identidade de cada entrada é
 * uma união: favorita não tem nome pra comparar, categoria compara por
 * `groupLabel` (mesma chave que a trilha já usava antes desta feature).
 * Isto também resolve o edge case de uma categoria da FONTE chamar-se
 * "Favoritos" — a virtual nunca é confundida com ela, porque o `kind`
 * distingue as duas mesmo com o mesmo texto exibido. "Todos" (feature 018,
 * D-001) segue o mesmo modelo — categoria virtual, nunca gravada.
 */
export type TrailKey = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; name: string }

export function sameTrailKey(a: TrailKey, b: TrailKey): boolean {
  if (a.kind === 'category') return b.kind === 'category' && b.name === a.name
  return a.kind === b.kind
}

export interface TrailEntry {
  key: TrailKey
  category?: CatalogCategory
}

/** Chave de string estável de uma entrada da trilha — só para o `id` do `SideCategoryNav` (feature 024, componente burro, D-009 da 022). */
export function trailEntryId(entry: TrailEntry): string {
  if (entry.key.kind === 'category') return `cat-${entry.category!.id}`
  return entry.key.kind
}

/**
 * Identidade do que está em foco — o que sobrevive a uma troca de catálogo
 * em segundo plano (feature 004) e a uma revalidação de categoria (feature
 * 010, FR-019). `categoryIdx`/`channelIdx` são sempre DERIVADOS dela a cada
 * render, nunca o contrário: não existe um frame em que o índice aponta
 * para dado antigo.
 */
export interface FocusIdentity {
  trailKey: TrailKey | null
  channelId: string | null
}

/**
 * Qual entrada da trilha uma sessão SEM navegação prévia (recém-aberta)
 * começa focada. As entradas virtuais ("★ Favoritos", "Todos") ficam no
 * topo, mas o padrão continua sendo a primeira categoria REAL — a maioria
 * das pessoas não tem favorito nenhum ainda, e abrir Live TV direto numa
 * seção vazia seria pior experiência do que preservar o comportamento já
 * existente (entrar direto na primeira categoria declarada pela fonte).
 * `VIRTUAL_TRAIL_COUNT` é constante (feature 018, D-001/D-009) — sempre 2
 * ("★ Favoritos" + "Todos"), inclusive dentro do zapping: a busca deixou
 * de ser uma entrada de trilha, então não há mais nada a omitir ali (só o
 * ÍCONE de busca continua fora do zapping, FR-018, tratado no JSX).
 */
export const VIRTUAL_TRAIL_COUNT = 2

export function defaultTrailIdx(trail: TrailEntry[]): number {
  return Math.min(VIRTUAL_TRAIL_COUNT, trail.length - 1)
}

/** O que entrou de fato na coluna de conteúdo — Favoritos, Todos, ou uma categoria por id. */
export type EnteredKey = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; id: number }

/**
 * Chave de memória de foco da entrada (feature 046) — categoria pelo NOME do
 * grupo, como a trilha identifica (sobrevive a uma nova geração). `undefined`
 * se a categoria entrada já não existe.
 */
export function liveEntryKey(entered: EnteredKey, categories: readonly CatalogCategory[]): LiveEntryKey | undefined {
  if (entered.kind !== 'category') return entered.kind
  const category = categories.find((c) => c.id === entered.id)
  return category ? `category:${groupLabel(category.name)}` : undefined
}

/** A entrada da trilha que corresponde a uma entrada exibida (feature 046) — `undefined` se a categoria sumiu. */
export function trailKeyOf(entered: EnteredKey, categories: readonly CatalogCategory[]): TrailKey | undefined {
  if (entered.kind !== 'category') return { kind: entered.kind }
  const category = categories.find((c) => c.id === entered.id)
  return category ? { kind: 'category', name: groupLabel(category.name) } : undefined
}
