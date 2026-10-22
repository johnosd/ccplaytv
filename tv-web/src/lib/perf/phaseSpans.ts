import type { SpanInterval } from './longTaskAttribution'

/**
 * Atribuição das tarefas longas por etapa do caminho de navegação (feature 088).
 *
 * O método (o que medir, em que ordem, e quando parar) está em `sdd/specs/088-tarefas-longas-navegacao/logic/atribuicao.md`.
 *
 * Por que existe: a rodada de 2026-10-22 provou que **é código nosso** segurando a thread (48 de 49 quadros longos
 * coincidem com uma tarefa longa de JavaScript), mas `longtask` não diz **qual** código. Isto marca intervalos nomeados
 * dentro do caminho tecla → foco → render → capa e os agrega **por janela**, no mesmo formato do `longTasks.ts`.
 *
 * Só existe no build de medição (`VITE_CCPLAY_PERF=1`). Só números e nomes de etapa fixos — nunca nome de item.
 */

/** As etapas medidas. Conjunto FECHADO: o canal de métricas só aceita chaves conhecidas, e nome livre viraria vazamento. */
export type SpanName = 'tecla' | 'render' | 'capa'

export interface PhaseSpanTracker {
  /**
   * Os intervalos de trabalho fechados na janela, e **zera**. Alimenta `longTaskAttribution.ts`: a rodada na TV
   * mediu `tecla` + `render` em 24% do tempo que a thread passa presa, e saber *quanto* cada etapa custou não diz
   * onde estão os outros 76% — para isso é preciso cruzar com o início e o fim de cada tarefa longa.
   *
   * `capa` fica de fora: ela mede espera de parede, não trabalho, e engoliria todas as outras (R-008).
   */
  takeIntervals(): SpanInterval[]
  /** Abre um intervalo e devolve a função que o fecha. Fechar duas vezes conta uma só. */
  begin(name: SpanName): () => void
  /** Agrega o que fechou desde a chamada anterior, em chaves planas, e **zera** a janela. `null` se nada fechou. */
  snapshot(): Record<string, number> | null
  dispose(): void
}

/**
 * Agrega amostras `[etapa, duração em ms]` nas chaves planas que o canal de métricas aceita:
 * `teclaN`/`teclaMs`/`teclaMax`, `renderN`/`renderMs`/`renderMax`, `capaN`/`capaMs`/`capaMax`.
 *
 * Arredondado, porque vai para evidência. `null` quando não houve amostra.
 */
export function summarizeSpans(samples: ReadonlyArray<readonly [SpanName, number]>): Record<string, number> | null {
  if (samples.length === 0) return null
  const porEtapa = new Map<SpanName, { n: number; total: number; max: number }>()
  for (const [nome, ms] of samples) {
    const atual = porEtapa.get(nome) ?? { n: 0, total: 0, max: 0 }
    atual.n += 1
    atual.total += ms
    if (ms > atual.max) atual.max = ms
    porEtapa.set(nome, atual)
  }
  const saida: Record<string, number> = {}
  for (const [nome, valor] of porEtapa) {
    saida[`${nome}N`] = valor.n
    saida[`${nome}Ms`] = Math.round(valor.total)
    saida[`${nome}Max`] = Math.round(valor.max)
  }
  return saida
}

/**
 * O rastreador é **compartilhado por módulo**, como `firstReveal`/`loadActivity` já fazem: o manipulador de tecla
 * (`lib/useRemoteNav.ts`), a tela (`features/vod/VodShowcaseScreen.tsx`) e o card (`components/PosterArt.tsx`) abrem
 * etapas em lugares distantes da árvore, e passar um objeto por props atravessaria meia aplicação por instrumentação.
 *
 * Fora do build de medição **nada é criado**: `beginSharedSpan` devolve uma função que não faz nada, então o caminho
 * mais quente do app (a tecla) não paga nem uma alocação (R-002).
 */
const MEDINDO = import.meta.env.VITE_CCPLAY_PERF === '1'
const NADA = (): void => {}
let compartilhado: PhaseSpanTracker | undefined

export function beginSharedSpan(name: SpanName): () => void {
  if (!MEDINDO) return NADA
  compartilhado ??= createPhaseSpanTracker()
  return compartilhado.begin(name)
}

/** Agrega a janela do rastreador compartilhado e zera. `null` fora do build de medição ou sem amostra. */
export function snapshotSharedSpans(): Record<string, number> | null {
  return compartilhado?.snapshot() ?? null
}

/** Os intervalos de trabalho da janela do rastreador compartilhado, e zera. Vazio fora do build de medição. */
export function takeSharedIntervals(): SpanInterval[] {
  return compartilhado?.takeIntervals() ?? []
}

/**
 * Mede o custo de **pintura** de uma capa: abre quando a imagem chegou (`onLoad`/`onError`) e fecha no quadro
 * seguinte. É a correção do R-008 — a medida anterior abria quando o card *pedia* a imagem, então media espera de
 * parede (266 s numa janela de 5 s, com 8 imagens em paralelo), que não é tempo de thread e não se compara com
 * `longTaskMs`.
 */
export function measureCapaPaint(): void {
  if (!MEDINDO) return
  const fechar = beginSharedSpan('capa')
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fechar)
  else fechar()
}

/**
 * Instala a medição de `tecla` e `render` **sem tocar no código de navegação**.
 *
 * Por que daqui e não de dentro do `useRemoteNav`/da vitrine: os dois estão exatamente no teto de linhas do ratchet, e
 * — mais importante — instrumentação não deveria morar no caminho quente. Daqui sai melhor:
 *
 * - `tecla` abre na **captura** do `keydown` em `document` e fecha numa microtarefa, que drena depois de **todos** os
 *   ouvintes síncronos daquele evento: mede o custo síncrono inteiro da tecla, incluindo o `useRemoteNav`.
 * - `render` abre na mesma tecla e fecha no **próximo quadro pintado** (o `PerfOverlay` já roda um laço de
 *   `requestAnimationFrame`): é o número que a pessoa sente — da tecla até ver o foco novo.
 */
export function installKeySpan(): () => void {
  if (!MEDINDO) return NADA
  const onKeyDown = (): void => {
    const fecharTecla = beginSharedSpan('tecla')
    openRenderSpan()
    queueMicrotask(fecharTecla)
  }
  document.addEventListener('keydown', onKeyDown, true)
  return () => {
    document.removeEventListener('keydown', onKeyDown, true)
    closeRenderSpan()
  }
}

let fecharRender: (() => void) | undefined

/**
 * Abre `render` na tecla e deixa o fechamento para quem vê o DOM pronto. Medir durante o render chamaria
 * `performance.now()` dentro da renderização, o que o React Compiler trata como impureza — e desistir de memoizar a
 * vitrine mudaria justamente o que está sendo medido.
 */
export function openRenderSpan(): void {
  if (!MEDINDO) return
  // Tecla nova antes do commit anterior fechar: fecha a anterior para não perder a amostra nem vazar o fechamento.
  fecharRender?.()
  fecharRender = beginSharedSpan('render')
}

/** Fecha `render`. Chamado do laço de quadros do `PerfOverlay`: o primeiro quadro depois da tecla. */
export function closeRenderSpan(): void {
  fecharRender?.()
  fecharRender = undefined
}

export function createPhaseSpanTracker(): PhaseSpanTracker {
  let amostras: Array<readonly [SpanName, number]> = []
  let intervalos: SpanInterval[] = []
  return {
    takeIntervals() {
      const atual = intervalos
      intervalos = []
      return atual
    },
    begin(nome) {
      const inicio = performance.now()
      let fechado = false
      // Idempotente de propósito: no caminho de navegação esta função é chamada de `finally`, de cleanup de efeito e
      // de caminho de erro. Contar duas vezes inflaria a atribuição e mandaria a feature otimizar a etapa errada.
      return () => {
        if (fechado) return
        fechado = true
        const fim = performance.now()
        amostras.push([nome, fim - inicio])
        if (nome !== 'capa') intervalos.push({ name: nome, start: inicio, end: fim })
      }
    },
    snapshot() {
      const resumo = summarizeSpans(amostras)
      // Zera a janela: o lote seguinte reporta só o que fechou depois daqui (mesmo formato do `longTasks.ts`).
      amostras = []
      return resumo
    },
    dispose() {
      amostras = []
      intervalos = []
    },
  }
}
