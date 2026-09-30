/**
 * Restauração da tela de Busca global (feature 026, US3 —
 * `logic/busca-global.md` §5). Guarda o termo e o foco de origem por
 * **id** do resultado, nunca por índice — mesmo padrão de
 * `CategoryScreenSnapshot` (feature 017).
 */
export interface SearchSnapshot {
  term: string
  focus: { row: 'field' } | { row: 'results'; kind: 'channel' | 'movie' | 'series'; itemId: string }
}
