/**
 * Linha de estado do Início (feature 038, US6, FR-031/FR-032,
 * `logic/agendador-pre-carga.md` §7). Função pura — o instante vem injetado.
 * Só números reais; nunca percentual, credencial, URL nem erro cru.
 * Os textos vêm do catálogo (feature 054): `t` omitido = português.
 */

import { createTranslator, type Translator } from '../../lib/i18n/translate'
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
export function formatAge(ageMs: number, t: Translator = createTranslator('pt')): string {
  if (ageMs < MINUTE) return t('home.age.now')
  if (ageMs < HOUR) return t('home.age.minutes', { n: Math.floor(ageMs / MINUTE) })
  if (ageMs < DAY) return t('home.age.hours', { n: Math.floor(ageMs / HOUR) })
  return t.plural('home.age.days', Math.floor(ageMs / DAY))
}

export function homeStatusLine(
  { sourceId, updating, progress, lastSuccessfulSyncAt, now }: HomeStatusInput,
  t: Translator = createTranslator('pt'),
): string | null {
  if (updating) return t('home.status.updating')
  // Feature 042 (FR-017): o painel pediu um intervalo — uma linha só, nunca um aviso por categoria.
  if (progress.sourceId === sourceId && progress.pausedReason === 'rate_limited') {
    return t('home.status.paused')
  }
  if (progress.sourceId === sourceId && progress.stoppedReason === 'storage_full' && progress.ready < progress.total) return t('home.status.partial')
  const preparing =
    progress.sourceId === sourceId &&
    (progress.state === 'running' || progress.state === 'paused') &&
    progress.total > 0 &&
    progress.ready < progress.total
  if (preparing) return t('home.status.preparing', { ready: progress.ready, total: progress.total })
  if (lastSuccessfulSyncAt !== null) {
    const ageMs = now - lastSuccessfulSyncAt
    return ageMs < MINUTE ? t('home.status.updatedNow') : t('home.status.updated', { age: formatAge(ageMs, t) })
  }
  return null
}
