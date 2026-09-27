export interface ComingSoonEntry {
  message: string
  /** Item numerado de `.planning/backlog.md` que substitui este mock quando implementado. */
  backlogItem: number
}

/**
 * Registro único de mocks "Em breve" (feature 022, D-016 do plan.md) —
 * ADR-011/`migracao-design-system-v14.md`. A Onda 2 em diante adiciona
 * suas próprias entradas aqui conforme cada tela migrar com uma
 * funcionalidade ainda não construída.
 */
export const COMING_SOON: Record<string, ComingSoonEntry> = {
  'exemplo-onda-2': {
    message: 'Esta função ainda não foi construída.',
    backlogItem: 15,
  },
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
