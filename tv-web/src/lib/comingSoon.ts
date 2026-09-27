export interface ComingSoonEntry {
  message: string
  /** Item numerado de `.planning/backlog.md` que substitui este mock quando implementado. */
  backlogItem: number
}

/**
 * Registro único de mocks "Em breve" (feature 022, D-016 do plan.md) —
 * ADR-011/`migracao-design-system-v14.md`. Nasce vazio: cada tela da Onda 2
 * em diante registra aqui a sua entrada quando migrar com uma
 * funcionalidade ainda não construída, apontando para o item de backlog
 * que a substituirá (FR-033).
 */
export const COMING_SOON: Record<string, ComingSoonEntry> = {}

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
