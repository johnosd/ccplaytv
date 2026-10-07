import { defineArea } from './area'

/**
 * Mensagens dos mocks "Em breve" (`lib/comingSoon.ts`, feature 022): uma chave
 * `comingSoon.<id>` por entrada do registro. O texto em pt é o mesmo de
 * `COMING_SOON[id].message` (`comingSoon.test.ts` confere).
 */
export const comingSoon = defineArea(
  {
    'comingSoon.pair-phone': 'Conectar a lista pelo celular, com QR code.',
    'comingSoon.home-ai-curation': 'Sugestões de conteúdo por IA, com base no que você assiste.',
    'comingSoon.dock-ai': 'Assistente de IA para perguntas sobre o catálogo.',
    'comingSoon.dock-weather': 'Previsão do tempo no dock de serviços.',
    'comingSoon.voice-search': 'Busca por voz.',
    'comingSoon.settings-parental': 'Perfis de pessoa e controle parental.',
    'comingSoon.a11y-voice-guide': 'Narração de tela (Voice Guide).',
    'comingSoon.a11y-high-contrast': 'Modo de alto contraste.',
    'comingSoon.a11y-subtitles': 'Aparência das legendas.',
  },
  {
    'comingSoon.pair-phone': 'Connect the list from your phone, with a QR code.',
    'comingSoon.home-ai-curation': 'AI content suggestions based on what you watch.',
    'comingSoon.dock-ai': 'AI assistant for questions about the catalog.',
    'comingSoon.dock-weather': 'Weather forecast in the services dock.',
    'comingSoon.voice-search': 'Voice search.',
    'comingSoon.settings-parental': 'Person profiles and parental controls.',
    'comingSoon.a11y-voice-guide': 'Screen narration (Voice Guide).',
    'comingSoon.a11y-high-contrast': 'High contrast mode.',
    'comingSoon.a11y-subtitles': 'Subtitle appearance.',
  },
  {
    'comingSoon.pair-phone': 'Conectar la lista desde el móvil, con un código QR.',
    'comingSoon.home-ai-curation': 'Sugerencias de contenido con IA, según lo que ves.',
    'comingSoon.dock-ai': 'Asistente de IA para preguntas sobre el catálogo.',
    'comingSoon.dock-weather': 'Previsión del tiempo en el dock de servicios.',
    'comingSoon.voice-search': 'Búsqueda por voz.',
    'comingSoon.settings-parental': 'Perfiles de persona y control parental.',
    'comingSoon.a11y-voice-guide': 'Narración de pantalla (Voice Guide).',
    'comingSoon.a11y-high-contrast': 'Modo de alto contraste.',
    'comingSoon.a11y-subtitles': 'Apariencia de los subtítulos.',
  },
)
