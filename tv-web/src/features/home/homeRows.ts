/**
 * Quais fileiras o Início tem e em que ordem (feature 060, D-014, FR-018 — `logic/billboard-e-navegacao.md` §3). Só decide
 * existência e ordem; não lê dado nenhum. Fileira sem dado não existe (nem skeleton, nem "Em breve"); enquanto as leituras
 * chegam, a Home inteira espera e aparece de uma vez (feature 079, `lib/assembly/`), e o `HomeContent` filtra estas chaves
 * pelo que a montagem já mostrou.
 *
 * Ad-hoc 2026-10-09: só fileiras do próprio aparelho, nesta ordem — canais favoritos, continuar assistindo, Minha Lista,
 * filmes e séries adicionados. Top 10, Dica, "Porque você assistiu" e a Curadoria por IA saíram do Início.
 *
 * `channels` é a de "Canais favoritos" (ex-"Ao vivo agora"): a chave não mudou para a restauração de foco antiga
 * (`HomeFocus.rail`) continuar valendo.
 */

export type HomeRowKey = 'channels' | 'continue' | 'mylist' | 'added-movies' | 'added-series'

export const HOME_ROW_ORDER: readonly HomeRowKey[] = ['channels', 'continue', 'mylist', 'added-movies', 'added-series']

export type HomeRowPresence = Partial<Record<HomeRowKey, boolean>>

export function buildHomeRows(has: HomeRowPresence): HomeRowKey[] {
  return HOME_ROW_ORDER.filter((key) => has[key] === true)
}
