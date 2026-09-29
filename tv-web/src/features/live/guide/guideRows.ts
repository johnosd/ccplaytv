/**
 * Do que a tela já tem (canais + programação lida da feature 030) para o que
 * a grade consome (feature 031, `logic/grade-e-foco.md` §1/§3). Puro.
 */
import type { CatalogItemOut } from '../../catalog/catalogApi'
import type { EpgLookup } from '../../../lib/epg/types'
import type { GuideBounds, GuideProgram, GuideRow, GuideView } from './guideGrid'

/** Janela visível: 2 h (FR-014). */
export const GUIDE_SPAN_MS = 2 * 3_600_000
/** A janela que a feature 030 guarda (−12 h … +48 h) — o que a grade pode mostrar (FR-003). */
export const GUIDE_BEFORE_MS = 12 * 3_600_000
export const GUIDE_AFTER_MS = 48 * 3_600_000

const HALF_HOUR_MS = 30 * 60_000

/**
 * Uma linha por canal, na ordem recebida. Os programas vêm com o
 * deslocamento manual da fonte **somado** (D-005); ordenados por início;
 * programa sem título ou com duração não positiva não entra (FR-030 da 030).
 * Canal sem `epg_channel_id`, ou cujo id não tem programação lida, fica
 * com `programs: []` — o bloco "Sem programação".
 */
export function buildGuideRows(
  items: readonly Pick<CatalogItemOut, 'id' | 'epg_channel_id'>[],
  lookup: EpgLookup | undefined,
): GuideRow[] {
  return items.map((item) => {
    const raw = item.epg_channel_id ? lookup?.byKey.get(item.epg_channel_id) : undefined
    if (!raw || !lookup) return { channelId: item.id, programs: [] }
    const programs: GuideProgram[] = []
    for (const program of raw) {
      if (program.title === '' || program.end <= program.start) continue
      const shifted: GuideProgram = {
        start: program.start + lookup.offsetMs,
        end: program.end + lookup.offsetMs,
        title: program.title,
      }
      if (program.description !== undefined) shifted.description = program.description
      programs.push(shifted)
    }
    programs.sort((a, b) => a.start - b.start || a.end - b.end)
    return { channelId: item.id, programs }
  })
}

/** Limites navegáveis em torno de `now`. */
export function guideBounds(now: number): GuideBounds {
  return { from: now - GUIDE_BEFORE_MS, to: now + GUIDE_AFTER_MS }
}

/** Início do bloco de 30 min local que contém `time`. */
function floorLocalHalfHour(time: number): number {
  const date = new Date(time)
  const into = (date.getMinutes() % 30) * 60_000 + date.getSeconds() * 1000 + date.getMilliseconds()
  return time - into
}

/**
 * Janela inicial: um pouco do passado (30 min antes do bloco de meia hora
 * atual), para a linha do "agora" ficar no primeiro quarto da tela.
 */
export function initialView(now: number, bounds: GuideBounds): GuideView {
  const viewStart = floorLocalHalfHour(now) - HALF_HOUR_MS
  return { viewStart: Math.max(bounds.from, Math.min(viewStart, bounds.to - GUIDE_SPAN_MS)), spanMs: GUIDE_SPAN_MS }
}
