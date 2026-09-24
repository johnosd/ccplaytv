/**
 * Limiares de retomada e cadência de gravação — um único lugar.
 *
 * Funções puras, sem DOM e sem banco: quem grava progresso de fato é
 * `progressRecorder.ts`, que consome estas regras. Ver
 * `sdd/specs/011-assistir-filme-retomada/logic/reproducao-vod.md` §1.
 */

/**
 * Abaixo disto, não houve "assistir" — houve espiar. Gravar aqui produziria
 * um "Retomar a partir de 0:12" que só atrapalha (FR-014).
 */
export const RESUME_MIN_SECONDS = 30

/**
 * Acima desta fração da duração, o filme conta como terminado: a retomada é
 * apagada e a ação primária volta a ser "Assistir" (FR-014).
 *
 * Distinto do limiar de "assistido" de ~90% que o guia Samsung 06 sugere para
 * histórico — esse é o item 13 do backlog e não existe nesta feature.
 */
export const RESUME_MAX_RATIO = 0.95

/** Cadência de gravação durante a reprodução (R0-4). */
export const PROGRESS_WRITE_INTERVAL_SECONDS = 5

/** A posição salva merece virar oferta de retomada? */
export function isResumable(progressSeconds: number | undefined): boolean {
  return progressSeconds !== undefined && progressSeconds >= RESUME_MIN_SECONDS
}

/**
 * A posição atual cruzou o fim?
 *
 * Sem duração conhecida devolve `false` — nada é estimado (FR-004). O fim,
 * nesse caso, só chega por conclusão real do motor.
 */
export function isPastEnd(positionMs: number, durationMs: number | undefined): boolean {
  if (durationMs === undefined || durationMs <= 0) return false
  return positionMs / durationMs >= RESUME_MAX_RATIO
}

/**
 * Já passou intervalo suficiente desde a última gravação?
 *
 * `Math.abs` é deliberado: retroceder também é avanço a registrar. Sem ele,
 * quem retrocede 20 minutos não teria a posição gravada até voltar ao ponto
 * de onde saiu.
 */
export function shouldWriteProgress(positionMs: number, lastWrittenMs: number): boolean {
  return Math.abs(positionMs - lastWrittenMs) >= PROGRESS_WRITE_INTERVAL_SECONDS * 1000
}
