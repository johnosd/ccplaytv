/**
 * Onde estava o foco da página de ator quando a pessoa saiu dela por um título
 * encontrado (feature 035, FR-019 — `logic/navegacao-detalhe.md`). Por
 * identidade (`tmdb:<kind>:<id>`), nunca por índice; ausente = primeiro item do
 * primeiro rail.
 */
export interface PersonSnapshot {
  focusKey?: string
}
