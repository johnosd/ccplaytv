/**
 * Leitura incremental de XMLTV (feature 030, `logic/xmltv-parse.md`).
 *
 * Função pura sobre pedaços de texto — não conhece rede, gzip nem
 * armazenamento, pelo mesmo motivo de `m3uParser.ts`: testável sem Worker
 * nem IndexedDB. **Sem `DOMParser`**: ele não existe dentro de Web Worker,
 * que é onde isto roda na TV.
 *
 * STUB do sdd-plan — o sdd-execute implementa (T010/T011).
 */
import type { EpgProgramInput, EpgWindow } from './types'

/**
 * `"YYYYMMDDhhmmss +hhmm"` → epoch ms. Sem fuso declarado = UTC (edge case
 * da spec). Formato ilegível → `undefined`, nunca `NaN`.
 */
export function parseXmltvTime(_raw: string): number | undefined {
  throw new Error('not implemented')
}

/**
 * Emite um programa por `<programme>` completo, na ordem do arquivo,
 * só os que se sobrepõem a `window` (FR-004) e têm título não vazio
 * (FR-030). Um elemento partido entre dois pedaços nunca se perde.
 */
export async function* parseXmltv(
  _chunks: AsyncIterable<string>,
  _window: EpgWindow,
): AsyncGenerator<EpgProgramInput> {
  yield notImplemented()
}

function notImplemented(): never {
  throw new Error('not implemented')
}
