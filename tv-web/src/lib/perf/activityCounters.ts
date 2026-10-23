/**
 * Quantas vezes cada subsistema é **acionado** por janela (feature 089, T022/D-003).
 *
 * Por que contadores, e por que só esta medida. A rodada 1 na TV mediu o atraso de cada tarefa longa desde a última
 * tecla e achou um padrão **bimodal**: 1,23× logo depois da tecla e **1,62× acima de 300 ms**, com o meio empobrecido
 * (0,72×). Isso descarta trabalho síncrono com a tecla e trabalho periódico independente — o efeito desaparece quando
 * a navegação para. Sobra trabalho que a navegação **dispara** e que **transborda** o intervalo entre teclas (357 ms),
 * chegando atrasado porque está atrás de outra coisa.
 *
 * Três candidatas sobraram, e nenhuma estava medida: as consultas que a troca de foco dispara ou invalida, o recálculo
 * do virtualizador em resposta ao `scrollToIndex` de `useVirtualFocusSync`, e a leitura de bloco do IndexedDB. Um
 * **contador** separa as três sem medir tempo: se uma delas é acionada dezenas de vezes por janela para 14 teclas, é
 * ela que está enfileirando trabalho. Contar é barato e não distorce a thread, diferente de cronometrar cada chamada.
 *
 * **Tudo é instalado de fora.** `features/vod/VodShowcaseScreen.tsx` (733 linhas) e `lib/useRemoteNav.ts` (319) estão
 * no teto do ratchet (D-008), e instrumentação não deveria morar no caminho quente de qualquer forma — foi a lição do
 * R-007 da feature 088, que saiu com um desenho melhor justamente por isso.
 *
 * Só existe no build de medição (`VITE_CCPLAY_PERF=1`). Só números.
 */

/** O que é contado. Conjunto **FECHADO**, como as outras chaves do canal. */
export interface ActivityCounts {
  /** Eventos de `scroll` — é por eles que o virtualizador recalcula depois do `scrollToIndex`. */
  scrollsN: number
  /** Transações abertas no IndexedDB (leitura de bloco, documento de tela, ledger). */
  idbTxN: number
  /** Eventos do cache de consultas (disparo, resultado, invalidação). */
  queriesN: number
}

const MEDINDO = import.meta.env.VITE_CCPLAY_PERF === '1'
const NADA = (): void => {}

/**
 * Observa o cache de consultas sem tocar em nenhum componente.
 *
 * Recebe um objeto com `subscribe` em vez do `QueryClient` inteiro para não amarrar este módulo de medição à
 * biblioteca: `queryClient.getQueryCache()` serve, e um fake de teste também.
 */
export interface QueryCacheLike {
  subscribe(listener: () => void): () => void
}

export interface ActivityCounters {
  /** Instala os ouvintes e devolve a função que os remove. */
  install(queryCache?: QueryCacheLike): () => void
  /** Os contadores da janela, e **zera**. `null` quando nada foi acionado — não vira objeto de zeros. */
  snapshot(): ActivityCounts | null
}

/**
 * Fábrica testável, **sem** a guarda do build de medição — mesmo padrão de `createPhaseSpanTracker` em `phaseSpans.ts`:
 * o teste exercita esta, e as funções de módulo abaixo carregam a guarda.
 *
 * O `scroll` é ouvido na **captura** em `document`, porque eventos de scroll não borbulham — sem a captura, os trilhos
 * horizontais e a pilha vertical passariam despercebidos.
 *
 * As transações do IndexedDB são contadas por um remendo temporário em `IDBDatabase.prototype.transaction`, desfeito no
 * cleanup. É o que permite contá-las **sem** uma linha em `lib/catalog/`, que tem contrato travado pela feature 082.
 */
export function createActivityCounters(): ActivityCounters {
  let scrolls = 0
  let idbTx = 0
  let queries = 0

  return {
    install(queryCache) {
      const onScroll = (): void => {
        scrolls += 1
      }
      document.addEventListener('scroll', onScroll, true)

      const proto = typeof IDBDatabase === 'function' ? IDBDatabase.prototype : undefined
      const originalTransaction = proto?.transaction
      if (proto && originalTransaction) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- remendo de medição, desfeito no cleanup
        proto.transaction = function (this: IDBDatabase, ...args: any[]) {
          idbTx += 1
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
          return (originalTransaction as any).apply(this, args)
        } as typeof originalTransaction
      }

      const unsubscribe = queryCache?.subscribe(() => {
        queries += 1
      })

      return () => {
        document.removeEventListener('scroll', onScroll, true)
        if (proto && originalTransaction) proto.transaction = originalTransaction
        unsubscribe?.()
      }
    },
    snapshot() {
      if (scrolls === 0 && idbTx === 0 && queries === 0) return null
      const contagem: ActivityCounts = { scrollsN: scrolls, idbTxN: idbTx, queriesN: queries }
      scrolls = 0
      idbTx = 0
      queries = 0
      return contagem
    },
  }
}

let compartilhado: ActivityCounters | undefined

/** Instala os contadores do módulo. Fora do build de medição não instala nada e não conta nada. */
export function installActivityCounters(queryCache?: QueryCacheLike): () => void {
  if (!MEDINDO) return NADA
  compartilhado ??= createActivityCounters()
  return compartilhado.install(queryCache)
}

/** Os contadores da janela do rastreador compartilhado, e zera. `null` fora do build de medição ou sem acionamento. */
export function snapshotActivityCounters(): ActivityCounts | null {
  return compartilhado?.snapshot() ?? null
}
