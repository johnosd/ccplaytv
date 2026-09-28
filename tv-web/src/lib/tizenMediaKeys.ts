/**
 * Teclas de mídia do controle (feature 027, FR-023, `logic/chrome-player.md`
 * §5). Mesmo padrão de `tizenColorKey.ts`: só as teclas desta lista, e só as
 * que `tizen.tvinputdevice.getSupportedKeys()` declarar — nunca registrar
 * tudo (backlog item 44). Fora da TV (`window.tizen` ausente), no-op
 * silencioso.
 *
 * Diferente de `tizenColorKey.ts` (D-006 do plan.md): lá, uma lista vazia de
 * `getSupportedKeys()` é tratada como "sem informação, assume suportada" —
 * aqui, por FR-023 ("só as que a plataforma declarar suportadas"), lista
 * ausente, vazia ou que lança erro significa NADA registrado. Mais estrito
 * de propósito: teclas de mídia sem confirmação explícita da plataforma não
 * devem ser reivindicadas.
 */

export const MEDIA_KEYS = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaRewind',
  'MediaFastForward',
  'ChannelUp',
  'ChannelDown',
] as const

export type MediaKey = (typeof MEDIA_KEYS)[number]

/**
 * `keyCode` que a TV entrega para cada tecla — fallback quando `event.key`
 * não traz o nome (mesmo motivo de `TIZEN_RETURN_KEYCODE` em
 * `useRemoteNav.ts`). A conferir na TV física (R-001).
 */
export const MEDIA_KEY_CODES: Record<MediaKey, number> = {
  MediaPlayPause: 10252,
  MediaPlay: 415,
  MediaPause: 19,
  MediaStop: 413,
  MediaRewind: 412,
  MediaFastForward: 417,
  ChannelUp: 427,
  ChannelDown: 428,
}

interface TVInputDeviceGlobal {
  tvinputdevice?: {
    getSupportedKeys?: () => Array<{ name: string; code: number }>
    registerKey?: (keyName: string) => void
  }
}

/**
 * Registra as teclas suportadas; devolve as que de fato registrou (vazio
 * fora da TV, sem `getSupportedKeys`, com lista vazia/ausente, ou se algo
 * lançar — FR-023, D-006).
 */
export function registerMediaKeys(): MediaKey[] {
  const tizen = (window as unknown as { tizen?: TVInputDeviceGlobal }).tizen
  const inputDevice = tizen?.tvinputdevice
  if (!inputDevice?.registerKey) return []

  try {
    const supported = inputDevice.getSupportedKeys?.() ?? []
    if (supported.length === 0) return []
    const supportedNames = new Set(supported.map((key) => key.name))
    const toRegister = MEDIA_KEYS.filter((key) => supportedNames.has(key))
    const registered: MediaKey[] = []
    for (const key of toRegister) {
      try {
        inputDevice.registerKey(key)
        registered.push(key)
      } catch {
        // Uma tecla específica pode falhar (ex.: privilégio parcial) sem
        // impedir o registro das demais.
      }
    }
    return registered
  } catch {
    // Registro pode falhar por motivo de plataforma (privilégio ausente,
    // TV mais antiga) — nenhuma tecla de mídia fica disponível; setas+OK
    // continuam sendo o caminho completo (FR-023).
    return []
  }
}

/** A tecla de mídia deste evento (por `key` ou `keyCode`), ou `null`. */
export function mediaKeyOf(event: KeyboardEvent): MediaKey | null {
  const byName = MEDIA_KEYS.find((key) => key === event.key)
  if (byName) return byName

  const byCodeEntry = (Object.entries(MEDIA_KEY_CODES) as Array<[MediaKey, number]>).find(
    ([, code]) => code === event.keyCode,
  )
  return byCodeEntry ? byCodeEntry[0] : null
}
