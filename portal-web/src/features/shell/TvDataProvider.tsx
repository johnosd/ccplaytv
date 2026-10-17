import { createContext, useContext, type ReactNode } from 'react'
import type { Session } from '../api'
import { useTvData, type TvData } from './useTvData'

const TvDataContext = createContext<TvData | undefined>(undefined)

/** Uma só leitura de dados da TV para a casca e todas as telas (D-003). */
export function TvDataProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <TvDataContext.Provider value={useTvData(session)}>{children}</TvDataContext.Provider>
}

export function useTvDataContext(): TvData {
  const value = useContext(TvDataContext)
  if (!value) throw new Error('tv_data_missing')
  return value
}
