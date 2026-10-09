/**
 * Fachada estável das vitrines.
 *
 * A implementação continua em `catalogApi` para não quebrar os consumidores
 * e mocks legados durante a migração. Novas telas podem importar esta
 * superfície sem carregar os demais comandos do catálogo como dependência de
 * implementação. Os resultados mantêm o contexto da chave React Query
 * (fonte/tipo/idioma) e o cálculo assíncrono descarta consumidores obsoletos.
 */
export {
  useDailyTip,
  useRecentlyAdded,
  useTopRated,
  useWeeklyTop10,
} from './catalogApi'

export type {
  CatalogItemOut,
  DiscoveryPick,
  DiscoveryRowResult,
} from './catalogApi'
