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
    // 2. Pronta: todas as leituras resolvidas e as capas da primeira tela carregadas.
    if (slots.every(isResolved) && input.imagesSettled) {
      return { phase: 'revealed', reason: 'ready', shown: readyKeys, deferred: [] }
    }
    // 3. Teto: revela com o que tem, desde que as obrigatórias tenham resolvido.
    if (input.capPassed && slots.filter((slot) => slot.required).every(isResolved)) {
      return { phase: 'revealed', reason: 'cap', shown: readyKeys, deferred: [] }
    }
    return prev
  }

  // 5. Ação da pessoa, ou antes do teto (só no caminho do cache): tudo que tem dado fica na sua posição.
  if (input.following || !input.capPassed) {
    return settle(prev, { ...prev, shown: readyKeys, deferred: [] })
  }

  // 6. Depois do teto: o que chega abaixo de tudo na tela entra ao fim; acima, fica para a próxima entrada.
  const position = new Map(slots.map((slot, index) => [slot.key, index]))
  const ready = new Set(readyKeys)
  const shown = prev.shown.filter((key) => ready.has(key))
  const deferred = prev.deferred.filter((key) => ready.has(key))
  const anchors = slots.flatMap((slot, index) => (slot.anchor ? [index] : []))
  slots.forEach((slot, index) => {
    if (!ready.has(slot.key) || shown.includes(slot.key) || deferred.includes(slot.key)) return
    const limit = Math.max(-1, ...anchors, ...shown.map((key) => position.get(key) ?? -1))
    if (index > limit) shown.push(slot.key)
    else deferred.push(slot.key)
  })
  return settle(prev, { ...prev, shown, deferred })
}

/** Situação de uma leitura no formato do React Query (ou dos mocks dos testes): sem dado e sem erro = pendente. */
export function slotStatusOf<T>(query: { data: T | undefined; isError?: boolean }, isEmpty: (data: T) => boolean): SlotStatus {
  if (query.data === undefined) return query.isError ? 'failed' : 'pending'
  return isEmpty(query.data) ? 'empty' : 'ready'
}
