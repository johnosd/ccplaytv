import type { SourceRecord } from './db'

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Intervalo mínimo entre duas atualizações automáticas de uma lista ao abri-la
 * ou ao voltar o app ao primeiro plano (bug `lista-xtream-nao-atualiza-novos-filmes`).
 * Abrir o app precisa trazer o que o provedor acrescentou ou tirou; os 10 min
 * só evitam reimportar ao alternar listas ou reabrir em sequência.
 */
export const REFRESH_ON_OPEN_MIN_MS = 10 * 60 * 1000

export type FreshnessAction = 'none' | 'migrate' | 'update_by_age'

/**
 * Decide o que abrir uma fonte dispara (D-004 portado do backend) — a TV só 
 * avisa "abri esta fonte"; toda a decisão mora aqui, nunca na tela.
 *
 * @param source A fonte a ser avaliada.
 * @param now Instante atual injetado, não lido do relógio dentro da função — 
 *            é o que torna a regra testável e imune a relógio errado do aparelho.
 */
export function decideOnOpen(source: SourceRecord, now: number): FreshnessAction {
  // Fonte que nunca sincronizou não é velha — é pendente, sem idade a comparar.
  // Não é este ponto de entrada que resolve isso.
  if (source.connectionState === 'never_synced') {
    return 'none'
  }

  // Migração Única (FR-012/FR-014): fonte de provedor que nunca passou pelo conector novo.
  if (source.type === 'provider_credentials' && source.providerMigratedAt === undefined) {
    return 'migrate'
  }

  // Feature 030 (D-007/FR-007): fonte sincronizada antes do EPG existir não
  // tem o id de EPG dos canais (nem o `url-tvg` do cabeçalho) — uma
  // importação silenciosa em segundo plano resolve, pelo mesmo caminho da
  // migração acima. Só quando a importação bem-sucedida já aconteceu.
  if (source.lastSuccessfulSyncAt !== undefined && source.epgIdsCapturedAt === undefined) {
    return 'migrate'
  }

  // Atualização ao abrir (FR-020, prazo emendado pelo bug
  // `lista-xtream-nao-atualiza-novos-filmes`): qualquer fonte cuja última
  // sincronização bem-sucedida passou de REFRESH_ON_OPEN_MIN_MS. Com 24 h,
  // filmes, séries e canais novos (ou removidos) do provedor ficavam
  // invisíveis enquanto a abertura não caísse depois do prazo.
  if (source.lastSuccessfulSyncAt !== undefined) {
    if (now - source.lastSuccessfulSyncAt > REFRESH_ON_OPEN_MIN_MS) {
      return 'update_by_age'
    }
  }

  return 'none'
}

/**
 * Decide se os itens de uma categoria ainda valem, ou se é hora de buscar
 * de novo (feature 010, `categoryLoader`).
 *
 * Prazo de 24 h (`STALE_AFTER_MS`, research.md R0-2 da 010). Desde o bug
 * `lista-xtream-nao-atualiza-novos-filmes`, a renovação normal de uma
 * categoria vem da atualização feita ao abrir a lista (`renewRequestedAt`,
 * feature 038); este prazo fica como rede de segurança de uma sessão longa. Categoria
 * `eager` não passa por aqui — ela é sempre servida do disco, qualquer
 * que seja a idade (contrato `catalog-on-demand.md` §2), porque não há o
 * que "atualizar" nela isoladamente: a fonte inteira é que re-sincroniza.
 *
 * @param itemsFetchedAt Instante da última obtenção. `undefined` = nunca
 *                        obtida — nunca é "fresca".
 * @param now Instante atual injetado — mesma disciplina de `decideOnOpen`.
 */
export function isCategoryFresh(itemsFetchedAt: number | undefined, now: number): boolean {
  if (itemsFetchedAt === undefined) return false
  return now - itemsFetchedAt <= STALE_AFTER_MS
}
