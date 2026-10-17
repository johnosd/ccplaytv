/**
 * Navegação sem biblioteca de rotas (feature 077, D-002): o estado fica em memória e é espelhado no `history` com
 * `pushState`, **sem mudar a URL** (o servidor só serve `/`). `popstate` restaura o estado, então o botão Voltar do
 * celular fecha o editor ou a sub-tela e depois volta ao destino anterior. Funções puras; o gancho está em
 * `useNavigation.ts`.
 */
export const DESTINATIONS = ['lists', 'license', 'settings'] as const
export type Destination = typeof DESTINATIONS[number]
/** `view` vazio = raiz do destino; senão o nome de uma sub-tela (`editor`, `tmdb`, `backup`, `help`…). */
export interface NavState { destination: Destination; view: string }

export const ROOT: NavState = { destination: 'lists', view: '' }

export function sameNav(a: NavState, b: NavState): boolean {
  return a.destination === b.destination && a.view === b.view
}

/** Aceita só o que este módulo gravou: `history.state` de outro código ou corrompido vira `undefined`. */
export function parseNav(value: unknown): NavState | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { destination, view } = value as Record<string, unknown>
  if (!DESTINATIONS.includes(destination as Destination)) return undefined
  if (typeof view !== 'string' || !/^[a-z-]{0,24}$/.test(view)) return undefined
  return { destination: destination as Destination, view }
}

export interface HistoryLike { pushState(state: unknown, unused: string, url?: string | URL | null): void }

/** Empilha `next` no histórico (mesma URL); estado igual ao atual não empilha. Devolve se empilhou. */
export function pushNav(history: HistoryLike, location: { pathname: string; search: string }, current: NavState, next: NavState): boolean {
  if (sameNav(current, next)) return false
  history.pushState({ destination: next.destination, view: next.view }, '', location.pathname + location.search)
  return true
}

/** Trocar de destino sempre cai na raiz dele. */
export const root = (destination: Destination): NavState => ({ destination, view: '' })
