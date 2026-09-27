export interface ComingSoonEntry {
  message: string
  /**
   * O que substitui este mock quando implementado: item numerado de
   * `.planning/backlog.md` (`number`) ou um marco da migração DS V14
   * (`string`, ex. `'M6'` = Onda 5), quando ainda não há item próprio.
   */
  backlogItem: number | string
}

/**
 * Registro único de mocks "Em breve" (feature 022, D-016 do plan.md) —
 * ADR-011/`migracao-design-system-v14.md`. Cada tela da Onda 2 em diante
 * registra aqui a sua entrada quando migrar com uma funcionalidade ainda
 * não construída, apontando para o que a substituirá (FR-033). Remover um
 * mock é apagar a entrada. A `message` é lida como "Em breve — {message}".
 */
export const COMING_SOON: Record<string, ComingSoonEntry> = {
  // Topbar do Início (feature 023, FR-018) — ambos chegam na Onda 5.
  'search-global': { message: 'Busca global em filmes, séries e canais.', backlogItem: 'M6' },
  settings: { message: 'Configurações do aplicativo e gestão das suas listas.', backlogItem: 'M6' },
  // Onboarding de lista (feature 023, FR-035).
  'pair-phone': { message: 'Conectar a lista pelo celular, com QR code.', backlogItem: 22 },
}

/**
 * Erro cedo, em qualquer ambiente: um id não registrado é erro de
 * programação de quem usa a biblioteca, nunca algo que deva silenciar em
 * produção (constitution: nunca inventar dado).
 */
export function getComingSoon(id: string): ComingSoonEntry {
  const entry = COMING_SOON[id]
  if (!entry) throw new Error(`ComingSoon: id "${id}" não registrado em comingSoon.ts`)
  return entry
}
