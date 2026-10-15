/**
 * Feature 072 (plan D-008): as únicas configurações do app que saem da TV no backup. Literais de propósito — `lib` não
 * importa telas; os donos são `lib/i18n` (idioma), `features/settings` (player, movimento) e `lib/parental/listPin.ts`
 * (dica de PIN da 067, que precisa voltar junto com os PINs).
 */
export const BACKUP_SETTING_KEYS = [
  'ccplaytv:app-language',
  'ccplaytv:player-preferences',
  'ccplaytv:reduce-motion',
  'ccplay.parental.pinSources',
] as const

const ALLOWED = new Set<string>(BACKUP_SETTING_KEYS)

export function pickBackupSettings(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => ALLOWED.has(key) && typeof value === 'string'))
}

/** Lê do `localStorage` só a allowlist; armazenamento indisponível = nenhuma configuração (nunca lança). */
export function readBackupSettings(): Record<string, string> {
  const values: Record<string, string> = {}
  try {
    for (const key of BACKUP_SETTING_KEYS) {
      const value = globalThis.localStorage?.getItem(key)
      if (typeof value === 'string') values[key] = value
    }
  } catch { /* sem armazenamento: o backup segue sem configurações */ }
  return values
}

/** Restauração: grava só a allowlist. */
export function writeBackupSettings(values: Record<string, string>): void {
  try {
    for (const [key, value] of Object.entries(pickBackupSettings(values))) globalThis.localStorage?.setItem(key, value)
  } catch { /* sem armazenamento: nada a gravar */ }
}
