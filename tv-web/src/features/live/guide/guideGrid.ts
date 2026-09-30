/**
 * Modelo puro da grade do Guia completo (feature 031, `logic/grade-e-foco.md`).
 *
 * Sem React, sem banco, sem relógio próprio: tudo recebe os instantes de que
 * precisa. Horários chegam **já com o deslocamento manual da fonte aplicado**
 * (feature 030, `nowAndNext`) — a grade nunca soma deslocamento por conta
 * própria. "Dia" e marcas de hora são sempre do horário LOCAL do aparelho.
 */

/** Um programa como a grade o vê. Início/fim em epoch ms, deslocamento já somado. */
export interface GuideProgram {
  start: number
  end: number
  title: string
  description?: string
}

/** Uma linha do guia: um canal e seus programas, em ordem de início. Sem programas = canal sem EPG. */
export interface GuideRow {
  channelId: string
  programs: readonly GuideProgram[]
}

/**
 * Identidade do foco: canal + início do programa — nunca índice (constitution,
 * "Voltar Restaura Foco"). `programStart: null` = o bloco "Sem programação"
 * de uma linha sem programas.
 */
export interface GuideFocus {
  channelId: string
  programStart: number | null
}

/** Janela de tempo visível na grade. */
export interface GuideView {
  viewStart: number
  spanMs: number
}

/** Limites navegáveis: o início e o fim da janela guardada (FR-003). */
export interface GuideBounds {
  from: number
  to: number
}

export type GuideDay = 'today' | 'tomorrow'

/** Um bloco a desenhar: posição e largura em % da janela visível, já recortadas às bordas (0–100). */
export interface GuideBlock {
  program: GuideProgram
  leftPct: number
  widthPct: number
}

const THIRTY_MINUTES_MS = 30 * 60_000

/**
 * O programa que cobre `time` (`start <= time < end`), se houver. Com
 * sobreposição, vale o que começou por último (mesma regra de `nowAndNext`).
 */
export function programCovering(row: GuideRow, time: number): GuideProgram | undefined {
  let found: GuideProgram | undefined
  for (const program of row.programs) {
    if (program.start <= time && time < program.end && (found === undefined || program.start > found.start)) {
      found = program
    }
  }
  return found
}

/** Distância de `time` ao intervalo do programa (0 se cobre). */
function distanceTo(program: GuideProgram, time: number): number {
  if (time < program.start) return program.start - time
  if (time >= program.end) return time - program.end
  return 0
}

/** O programa que cobre `time` ou, numa lacuna, o mais próximo (empate: o anterior). Linha sem programas: `undefined`. */
export function programNearest(row: GuideRow, time: number): GuideProgram | undefined {
  let best: GuideProgram | undefined
  let bestDistance = Infinity
  for (const program of row.programs) {
    const distance = distanceTo(program, time)
    if (distance < bestDistance || (distance === bestDistance && best !== undefined && program.start < best.start)) {
      best = program
      bestDistance = distance
    }
  }
  return best
}

/** Foco de abertura numa linha: o programa em exibição agora, ou o mais próximo; sem programas, o bloco vazio. */
export function initialFocus(row: GuideRow, now: number): GuideFocus {
  return { channelId: row.channelId, programStart: programNearest(row, now)?.start ?? null }
}

/** ←/→ no mesmo canal: programa anterior/seguinte, pulando lacunas; satura nas pontas; linha vazia não muda. */
export function moveHorizontal(row: GuideRow, focus: GuideFocus, direction: 'left' | 'right'): GuideFocus {
  if (row.programs.length === 0 || focus.programStart === null) return focus
  let index = row.programs.findIndex((program) => program.start === focus.programStart)
  if (index === -1) {
    // O programa sumiu (programação atualizada): reancora no mais próximo do início antigo.
    const nearest = programNearest(row, focus.programStart)
    index = nearest ? row.programs.indexOf(nearest) : 0
    return { channelId: row.channelId, programStart: row.programs[index].start }
  }
  const next = Math.min(Math.max(index + (direction === 'right' ? 1 : -1), 0), row.programs.length - 1)
  return { channelId: row.channelId, programStart: row.programs[next].start }
}

/**
 * ↑/↓: canal vizinho, no bloco que cobre `refTime` (ou o mais próximo, em
 * lacuna); linha sem programas cai no bloco vazio. `null` na borda da lista —
 * quem chama decide o que fazer (sem volta ao início).
 */
export function moveVertical(
  rows: readonly GuideRow[],
  focus: GuideFocus,
  refTime: number,
  direction: 'up' | 'down',
): GuideFocus | null {
  const index = rows.findIndex((row) => row.channelId === focus.channelId)
  if (index === -1) return null
  const target = rows[index + (direction === 'down' ? 1 : -1)]
  if (!target) return null
  return { channelId: target.channelId, programStart: programNearest(target, refTime)?.start ?? null }
}

/** Blocos da linha que intersectam a janela, em % recortadas às bordas. Fora da janela: nada. */
export function blocksInView(row: GuideRow, view: GuideView): GuideBlock[] {
  const viewEnd = view.viewStart + view.spanMs
  const blocks: GuideBlock[] = []
  for (const program of row.programs) {
    if (program.end <= view.viewStart || program.start >= viewEnd) continue
    const from = Math.max(program.start, view.viewStart)
    const to = Math.min(program.end, viewEnd)
    blocks.push({
      program,
      leftPct: ((from - view.viewStart) / view.spanMs) * 100,
      widthPct: ((to - from) / view.spanMs) * 100,
    })
  }
  return blocks
}

/**
 * Nova janela que mantém `program` visível: não mexe se já cabe; à esquerda,
 * alinha no início dele; à direita, encosta o fim dele na borda direita;
 * maior que a janela, alinha no início. Sempre dentro de `bounds`.
 */
export function scrollForFocus(view: GuideView, program: GuideProgram, bounds: GuideBounds): GuideView {
  const viewEnd = view.viewStart + view.spanMs
  let viewStart = view.viewStart
  const fullyVisible = program.start >= view.viewStart && program.end <= viewEnd
  if (!fullyVisible) {
    if (program.end - program.start >= view.spanMs || program.start < view.viewStart) viewStart = program.start
    else viewStart = program.end - view.spanMs
  }
  // O início da janela guardada vence o fim quando ela é menor que a janela visível.
  viewStart = Math.max(bounds.from, Math.min(viewStart, bounds.to - view.spanMs))
  return viewStart === view.viewStart ? view : { viewStart, spanMs: view.spanMs }
}

/** Meia-noite local do dia de `time`, deslocada por `dayOffset` dias (por calendário, não por +24 h). */
function localMidnight(time: number, dayOffset = 0): number {
  const date = new Date(time)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset, 0, 0, 0, 0).getTime()
}

/** Dia local de `time` em relação a `now`: hoje, amanhã, ou `null` (outro dia). */
export function dayOfTime(time: number, now: number): GuideDay | null {
  if (time >= localMidnight(now) && time < localMidnight(now, 1)) return 'today'
  if (time >= localMidnight(now, 1) && time < localMidnight(now, 2)) return 'tomorrow'
  return null
}

/**
 * Abas Hoje/Amanhã (FR-016): Hoje → programa que cobre `now` (ou o mais
 * próximo) e `refTime = now`; Amanhã → primeiro programa que termina depois
 * da meia-noite local e `refTime =` essa meia-noite. Linha sem programas fica
 * no bloco vazio, mas `refTime` muda igual.
 */
export function jumpToDay(row: GuideRow, day: GuideDay, now: number): { focus: GuideFocus; refTime: number } {
  if (day === 'today') return { focus: initialFocus(row, now), refTime: now }
  const midnight = localMidnight(now, 1)
  const first = row.programs.find((program) => program.end > midnight)
  return { focus: { channelId: row.channelId, programStart: first?.start ?? null }, refTime: midnight }
}

/** Instantes das marcas de hora (múltiplos de `stepMs` em horário local) dentro de `[viewStart, viewStart + span)`. */
export function tickTimes(view: GuideView, stepMs: number = THIRTY_MINUTES_MS): number[] {
  const date = new Date(view.viewStart)
  const stepMinutes = stepMs / 60_000
  const intoStep =
    (date.getMinutes() % stepMinutes) * 60_000 + date.getSeconds() * 1000 + date.getMilliseconds()
  let tick = intoStep === 0 ? view.viewStart : view.viewStart + (stepMs - intoStep)
  const ticks: number[] = []
  for (; tick < view.viewStart + view.spanMs; tick += stepMs) ticks.push(tick)
  return ticks
}
