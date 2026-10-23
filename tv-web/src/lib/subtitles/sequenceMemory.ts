/**
 * Idioma da legenda externa usada numa série, só em memória (feature 090, `logic/legenda-externa.md` §5.5, FR-003):
 * o episódio seguinte mostra o atalho "Buscar legenda (<idioma>)" — nunca busca sozinho. Some ao fechar o app.
 */
import type { SubtitleLanguage } from './types'

const bySeries = new Map<string, SubtitleLanguage>()

function keyOf(sourceId: string, seriesId: string): string {
  return `${sourceId}|${seriesId}`
}

export function rememberSequenceLanguage(sourceId: string, seriesId: string, language: SubtitleLanguage): void {
  bySeries.set(keyOf(sourceId, seriesId), language)
}

export function sequenceLanguageOf(sourceId: string, seriesId: string): SubtitleLanguage | undefined {
  return bySeries.get(keyOf(sourceId, seriesId))
}

/** Só para testes. */
export function clearSequenceMemory(): void {
  bySeries.clear()
}
