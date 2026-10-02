/**
 * Linha de estado do Início (feature 038, US6, FR-031/FR-032,
 * `logic/agendador-pre-carga.md` §7). Função pura — o instante vem injetado.
 * Só números reais; nunca percentual, credencial, URL nem erro cru.
 */

import type { PrefetchProgress } from '../catalog/prefetchApi'

export interface HomeStatusInput {
  sourceId: string
  /** Uma atualização da lista ativa está em andamento (automática por idade). */
  updating: boolean
  progress: PrefetchProgress
  /** Última atualização bem-sucedida, epoch ms. */
  lastSuccessfulSyncAt: number | null
  now: number
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "agora", "há 5 min", "há 3 h", "há 1 dia" — relógio atrás (idade negativa) vira "agora". */
export function formatAge(ageMs: number): string {
  if (ageMs < MINUTE) return 'agora'
  if (ageMs < HOUR) return `há ${Math.floor(ageMs / MINUTE)} min`
  if (ageMs < DAY) return `há ${Math.floor(ageMs / HOUR)} h`
  const days = Math.floor(ageMs / DAY)
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

export function homeStatusLine({ sourceId, updating, progress, lastSuccessfulSyncAt, now }: HomeStatusInput): string | null {
  if (updating) return 'Atualizando catálogo…'
  // Feature 042 (FR-017): o painel pediu um intervalo — uma linha só, nunca um aviso por categoria.
  if (progress.sourceId === sourceId && progress.pausedReason === 'rate_limited') {
    return 'Pré-carga em pausa — o painel pediu um intervalo'
  }
  const preparing =
    progress.sourceId === sourceId &&
    (progress.state === 'running' || progress.state === 'paused') &&
    progress.total > 0 &&
    progress.ready < progress.total
  if (preparing) return `Preparando catálogo — ${progress.ready} de ${progress.total} categorias`
  if (lastSuccessfulSyncAt !== null) {
    const age = formatAge(now - lastSuccessfulSyncAt)
    return age === 'agora' ? 'Catálogo atualizado agora' : `Catálogo atualizado ${age}`
  }
  return null
}
