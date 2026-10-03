import { defineArea } from './area'

/** Player (feature 054): por ora só os rótulos de aspecto e qualidade, usados também por Configurações. A Fase 7 completa a área. */
export const player = defineArea(
  {
    'player.aspect.fit': 'Ajustar',
    'player.aspect.fill': 'Preencher',
    'player.aspect.original': 'Original',
    'player.aspect.zoom': 'Zoom',
    'player.quality.auto': 'Auto',
    'player.quality.max': 'Máxima',
    'player.quality.min': 'Econômica',
  },
  {
    'player.aspect.fit': 'Fit',
    'player.aspect.fill': 'Fill',
    'player.aspect.original': 'Original',
    'player.aspect.zoom': 'Zoom',
    'player.quality.auto': 'Auto',
    'player.quality.max': 'Highest',
    'player.quality.min': 'Data saver',
  },
  {
    'player.aspect.fit': 'Ajustar',
    'player.aspect.fill': 'Rellenar',
    'player.aspect.original': 'Original',
    'player.aspect.zoom': 'Zoom',
    'player.quality.auto': 'Auto',
    'player.quality.max': 'Máxima',
    'player.quality.min': 'Económica',
  },
)
