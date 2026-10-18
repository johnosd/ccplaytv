/**
 * Montagem de uma tela de fileiras antes de aparecer (feature 079, `logic/montagem-de-tela.md`): Home, Filmes e Séries
 * esperam as leituras e as capas da primeira tela e revelam tudo de uma vez, com teto. Função pura: não lê dado, não tem
 * temporizador — o hook `useScreenAssembly` entrega as situações das leituras e os eventos de tempo.
 */

/** Teto da espera, contado da entrada na tela (FR-003). */
export const ASSEMBLY_CAP_MS = 2000
/** Abaixo disso o "Carregando" nunca é desenhado (FR-004); é também a janela máxima de espera pelas capas (FR-002, R-008). */
export const LOADING_DELAY_MS = 300

/** Situação de uma leitura: `failed` é tratada como `empty` na tela (FR-010). */
export type SlotStatus = 'pending' | 'ready' | 'empty' | 'failed'

export interface AssemblySlot<K extends string = string> {
  key: K
  status: SlotStatus
  /** Leitura principal: resolvida já no 1º render (cache) = a tela aparece na hora (FR-013). */
  primary?: boolean
  /** Ocupa sua posição mesmo sem dado (o billboard da Home): o que chega depois dela nunca entra acima dela. */
  anchor?: boolean
  /** Sem ela resolvida nem o teto revela (a lista de categorias de Filmes/Séries). */
  required?: boolean
}

export interface AssemblyInput<K extends string = string> {
  /** Na ordem da tela, de cima para baixo. */
  slots: readonly AssemblySlot<K>[]
  /** Capas da primeira tela carregadas ou com falha — ou a janela curta delas passou (o hook decide). */
  imagesSettled: boolean
  /** Janela curta de montagem passada; permite revelar fileiras já prontas sem esperar as demais. */
  progressivePassed?: boolean
  /** `ASSEMBLY_CAP_MS` desde a entrada. */
  capPassed: boolean
  /** Janela de uma ação da pessoa (fechar o player, alternar favorito): tudo que chega entra na posição (FR-009). */
  following: boolean
  /** Primeiro render da tela. */
  firstRender: boolean
}

export type RevealReason = 'cache' | 'ready' | 'cap'

export interface AssemblyState<K extends string = string> {
  phase: 'waiting' | 'revealed'
  reason: RevealReason | null
  /** Slots `ready` na tela, na ordem de `slots`. */
  shown: K[]
  /** Slots `ready` que chegaram tarde acima do que já está na tela: só na próxima entrada (FR-007). */
  deferred: K[]
}

export function initialAssembly<K extends string = string>(): AssemblyState<K> {
  return { phase: 'waiting', reason: null, shown: [], deferred: [] }
}

const isResolved = (slot: AssemblySlot): boolean => slot.status !== 'pending'

function sameKeys<K>(a: readonly K[], b: readonly K[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index])
}

/** Devolve `prev` quando nada mudou, para quem guarda o estado não re-renderizar à toa. */
function settle<K extends string>(prev: AssemblyState<K>, next: AssemblyState<K>): AssemblyState<K> {
  return prev.phase === next.phase && prev.reason === next.reason && sameKeys(prev.shown, next.shown) && sameKeys(prev.deferred, next.deferred)
    ? prev
    : next
}

/** Um passo da montagem (`logic/montagem-de-tela.md` §2). */
export function stepAssembly<K extends string>(prev: AssemblyState<K>, input: AssemblyInput<K>): AssemblyState<K> {
  const { slots } = input
  const readyKeys = slots.filter((slot) => slot.status === 'ready').map((slot) => slot.key)

  if (prev.phase === 'waiting') {
    const primaries = slots.filter((slot) => slot.primary)
    // 1. Cache: as leituras principais já estavam prontas no 1º render — aparece na hora, sem esperar capas.
    if (input.firstRender && primaries.length > 0 && primaries.every(isResolved)) {
      return { phase: 'revealed', reason: 'cache', shown: readyKeys, deferred: [] }
    }
    // 2. Streaming: depois da janela curta, mostra o que já está pronto. O restante entra quando resolver.
    if (input.progressivePassed && readyKeys.length > 0) {
      return { phase: 'revealed', reason: 'ready', shown: readyKeys, deferred: [] }
    }
    // 3. Pronta: todas as leituras resolvidas e as capas da primeira tela carregadas.
    if (slots.every(isResolved) && input.imagesSettled) {
      return { phase: 'revealed', reason: 'ready', shown: readyKeys, deferred: [] }
    }
    // 4. Teto: revela com o que tem; uma tela sem qualquer conteúdo ainda espera a leitura obrigatória.
    if (input.capPassed && (readyKeys.length > 0 || slots.filter((slot) => slot.required).every(isResolved))) {
      return { phase: 'revealed', reason: 'cap', shown: readyKeys, deferred: [] }
    }
    return prev
  }

  // Toda leitura pronta entra na visita atual, na posição canônica. O reflow é deliberado: evita conteúdo desaparecido.
  return settle(prev, { ...prev, shown: readyKeys, deferred: [] })
}

/** Situação de uma leitura no formato do React Query (ou dos mocks dos testes): sem dado e sem erro = pendente. */
export function slotStatusOf<T>(query: { data: T | undefined; isError?: boolean }, isEmpty: (data: T) => boolean): SlotStatus {
  if (query.data === undefined) return query.isError ? 'failed' : 'pending'
  return isEmpty(query.data) ? 'empty' : 'ready'
}
