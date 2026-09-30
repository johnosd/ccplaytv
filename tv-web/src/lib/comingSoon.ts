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
  // Onboarding de lista (feature 023, FR-035).
  'pair-phone': { message: 'Conectar a lista pelo celular, com QR code.', backlogItem: 22 },
  // Detalhe de filme/série (feature 025, D-011, FR-043).
  similar: { message: 'Títulos semelhantes a este.', backlogItem: 45 },
  // O `trailer` do detalhe virou real na 033 (FR-021); o do herói do Início segue fora do escopo dela.
  'home-trailer': { message: 'Trailer do filme ou da série.', backlogItem: 32 },
  // Home definitiva (feature 026, FR-016).
  'home-ai-curation': { message: 'Sugestões de conteúdo por IA, com base no que você assiste.', backlogItem: 30 },
  'dock-ai': { message: 'Assistente de IA para perguntas sobre o catálogo.', backlogItem: 31 },
  'dock-weather': { message: 'Previsão do tempo no dock de serviços.', backlogItem: 54 },
  'dock-speedtest': { message: 'Teste de velocidade da sua conexão.', backlogItem: 54 },
  // Busca global (feature 026, FR-043).
  'voice-search': { message: 'Busca por voz.', backlogItem: 33 },
  // Configurações (feature 026, FR-031). `settings-integrations` deixou de ser
  // mock na feature 032 (item 28: aba real Integrações & BYOK); `dock-tmdb`
  // também (ícone TMDB do dock com estado real).
  'settings-player': { message: 'Preferências de qualidade e trilhas do player.', backlogItem: 55 },
  'settings-parental': { message: 'Perfis de pessoa e controle parental.', backlogItem: 52 },
  'a11y-voice-guide': { message: 'Narração de tela (Voice Guide).', backlogItem: 56 },
  'a11y-high-contrast': { message: 'Modo de alto contraste.', backlogItem: 56 },
  'a11y-subtitles': { message: 'Aparência das legendas.', backlogItem: 56 },
  // Chrome do player (feature 027, D-014) — Qualidade/Velocidade/Aspecto,
  // canal e VOD. Áudio e legendas e Info do stream deixaram de ser mock na
  // feature 029 (item 55a); o Guia completo, na 031 (item 42c).
  'player-quality': { message: 'Seleção manual de qualidade do stream.', backlogItem: 55 },
  'player-speed': { message: 'Velocidade de reprodução.', backlogItem: 55 },
  'player-aspect': { message: 'Proporção de tela do vídeo.', backlogItem: 55 },
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
