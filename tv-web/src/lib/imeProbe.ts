/**
 * Sonda do IME da TV (feature 045, T001) — só no build de medição
 * (`VITE_CCPLAY_IME_PROBE=1`), porque a TV não entrega console. Guarda os
 * últimos eventos de teclado/foco para a passada na TV descobrir o que o IME
 * real da Samsung entrega à página (Next, Done, Cancel, RETURN).
 *
 * **Nunca guarda o valor de um campo** — só tecla, código e o tipo/id do alvo.
 */

export const IME_PROBE_LIMIT = 12

export interface ImeProbeEntry {
  type: string
  key: string
  keyCode: number
  code: string
  composing: boolean
  target: string
}

let entries: ImeProbeEntry[] = []
const listeners = new Set<() => void>()

function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return '-'
  const id = target.id ? `#${target.id.slice(0, 12)}` : ''
  return `${target.tagName.toLowerCase()}${id}`
}

export function recordImeProbe(event: KeyboardEvent | FocusEvent): void {
  const keyboard = event as KeyboardEvent
  const entry: ImeProbeEntry = {
    type: event.type,
    key: typeof keyboard.key === 'string' ? keyboard.key : '',
    keyCode: typeof keyboard.keyCode === 'number' ? keyboard.keyCode : 0,
    code: typeof keyboard.code === 'string' ? keyboard.code : '',
    composing: keyboard.isComposing === true,
    target: describeTarget(event.target),
  }
  entries = [...entries, entry].slice(-IME_PROBE_LIMIT)
  for (const listener of [...listeners]) listener()
}

export function getImeProbeEntries(): ImeProbeEntry[] {
  return entries
}

export function subscribeImeProbe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function clearImeProbe(): void {
  entries = []
  for (const listener of [...listeners]) listener()
}

/** Liga a captura no `document`; devolve a função que desliga. */
export function startImeProbe(): () => void {
  const types = ['keydown', 'keyup', 'focusin', 'focusout'] as const
  const handler = (event: Event) => recordImeProbe(event as KeyboardEvent | FocusEvent)
  for (const type of types) document.addEventListener(type, handler, true)
  return () => {
    for (const type of types) document.removeEventListener(type, handler, true)
  }
}

export function formatImeProbeEntry(entry: ImeProbeEntry): string {
  const parts = [entry.type.padEnd(8), `k=${entry.key || '-'}`, `kc=${entry.keyCode}`]
  if (entry.code) parts.push(`c=${entry.code}`)
  if (entry.composing) parts.push('comp')
  parts.push(`→ ${entry.target}`)
  return parts.join(' ')
}
