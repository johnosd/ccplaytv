/**
 * Quais fileiras o Início tem e em que ordem (feature 060, D-014, FR-018 — `logic/billboard-e-navegacao.md` §3). Só decide
 * existência e ordem; não lê dado nenhum. Fileira sem dado — ou ainda carregando — não existe (nem skeleton, nem "Em breve"),
 * exceto a Curadoria por IA, que segue soft-disabled.
 *
 * `channels` é a "Ao vivo agora": a chave não mudou para a restauração de foco antiga (`HomeFocus.rail`) continuar valendo.
 */

export type HomeRowKey =
  | 'continue'
  | 'top10-movies'
  | 'added-movies'
  | 'tip-movies'
  | 'because'
  | 'channels'
  | 'mylist'
  | 'top10-series'
  | 'added-series'
  | 'tip-series'
  | 'ai'

export const HOME_ROW_ORDER: readonly HomeRowKey[] = [
  'continue',
  'top10-movies',
  'added-movies',
  'tip-movies',
  'because',
  'channels',
  'mylist',
  'top10-series',
  'added-series',
  'tip-series',
  'ai',
]

export type HomeRowPresence = Partial<Record<HomeRowKey, boolean>>

export function buildHomeRows(has: HomeRowPresence): HomeRowKey[] {
  return HOME_ROW_ORDER.filter((key) => key === 'ai' || has[key] === true)
}
