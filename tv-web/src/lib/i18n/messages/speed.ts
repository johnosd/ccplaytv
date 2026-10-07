import { defineArea } from './area'

/** Upload do teste de conexão (feature 064). Fica fora de `settings.ts`, que está no teto de linhas da catraca (063). */
export const speed = defineArea(
  {
    'settings.speed.upload': 'Upload',
    'settings.speed.uploadStage': 'Medindo upload…',
    'settings.speed.uploadNotMeasured': 'Não medido neste teste',
    'settings.speed.trafficUp': '{seconds} s · {mb} MB enviados',
  },
  {
    'settings.speed.upload': 'Upload',
    'settings.speed.uploadStage': 'Measuring upload…',
    'settings.speed.uploadNotMeasured': 'Not measured in this test',
    'settings.speed.trafficUp': '{seconds} s · {mb} MB sent',
  },
  {
    'settings.speed.upload': 'Subida',
    'settings.speed.uploadStage': 'Midiendo subida…',
    'settings.speed.uploadNotMeasured': 'No medido en esta prueba',
    'settings.speed.trafficUp': '{seconds} s · {mb} MB enviados',
  },
)
