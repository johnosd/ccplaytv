/**
 * Atribui cada tarefa longa à etapa que estava aberta quando ela aconteceu (feature 088, decidido no T024).
 *
 * **Por que isto existe, e não um quarto nome de etapa.** A rodada de 2026-10-22 na TV mediu `tecla` em 1% e `render`
 * em 23% do tempo que a thread passa presa — e deixou **76% sem dono**. O candidato óbvio (a leitura de categoria em
 * segundo plano) foi *refutado* pelos próprios números: as janelas com leitura de fundo deram fps melhor. Escolher o
 * quarto nome por intuição é exatamente o que o FR-001 proíbe, e o erro já cometido duas vezes nesta investigação.
 *
 * Então em vez de adivinhar, **particiona o que já medimos**: cada milissegundo de tarefa longa é atribuído à etapa
 * que o cobre, e o que não é coberto por nenhuma vira uma categoria explícita (`ltFora*`). A soma fecha com
 * `longTaskMs` por construção, então "fora" deixa de ser um resíduo de subtração e passa a ser uma medida — com
 * quantas tarefas e qual a pior.
 *
 * `capa` **não entra**: ela mede espera de parede (a imagem pendurada por dezenas de segundos), não trabalho, e
 * engoliria todas as outras etapas (R-008).
 *
 * Só números. Só existe no build de medição.
 */

/** Intervalo fechado de uma etapa, em ms da mesma origem de `performance.now()`. */
export interface SpanInterval {
  /** Precedência: a etapa mais interna ganha o milissegundo disputado. `tecla` roda dentro de `render`. */
  readonly name: 'tecla' | 'render'
  readonly start: number
  readonly end: number
}

/** Uma tarefa longa, como o `PerformanceObserver` a entrega (`startTime` + `duration`). */
export interface LongTaskWindow {
  readonly start: number
  readonly duration: number
}

/** Ordem de precedência: quem vem primeiro reivindica o milissegundo. */
const PRECEDENCIA: ReadonlyArray<SpanInterval['name']> = ['tecla', 'render']

/** Une intervalos que se tocam, para que sobreposição entre duas amostras da mesma etapa não seja contada duas vezes. */
function unir(intervalos: Array<readonly [number, number]>): Array<readonly [number, number]> {
  if (intervalos.length < 2) return intervalos
  const ordenados = [...intervalos].sort((a, b) => a[0] - b[0])
  const saida: Array<readonly [number, number]> = []
  let [inicio, fim] = ordenados[0]
  for (const [i, f] of ordenados.slice(1)) {
    if (i <= fim) fim = Math.max(fim, f)
    else {
      saida.push([inicio, fim])
      ;[inicio, fim] = [i, f]
    }
  }
  saida.push([inicio, fim])
  return saida
}

function totalDe(intervalos: ReadonlyArray<readonly [number, number]>): number {
  let soma = 0
  for (const [i, f] of intervalos) soma += f - i
  return soma
}

/** Remove de `base` tudo o que `corte` já reivindicou. */
function subtrair(
  base: ReadonlyArray<readonly [number, number]>,
  corte: ReadonlyArray<readonly [number, number]>,
): Array<readonly [number, number]> {
  let atual = [...base]
  for (const [ci, cf] of corte) {
    const proximo: Array<readonly [number, number]> = []
    for (const [i, f] of atual) {
      if (cf <= i || ci >= f) proximo.push([i, f])
      else {
        if (i < ci) proximo.push([i, ci])
        if (cf < f) proximo.push([cf, f])
      }
    }
    atual = proximo
  }
  return atual
}

/**
 * Parte `longTaskMs` entre as etapas e o que ficou fora delas.
 *
 * Chaves planas, como o resto do canal: `ltTeclaMs`, `ltRenderMs`, `ltForaMs`, `ltForaN`, `ltForaMax`. `null` quando
 * não houve tarefa longa na janela — a janela saiu limpa, e não há o que atribuir.
 */
export function attributeLongTasks(
  tasks: readonly LongTaskWindow[],
  spans: readonly SpanInterval[],
): Record<string, number> | null {
  if (tasks.length === 0) return null
  const porEtapa = new Map<SpanInterval['name'], Array<readonly [number, number]>>()
  for (const nome of PRECEDENCIA) {
    porEtapa.set(nome, unir(spans.filter((s) => s.name === nome).map((s) => [s.start, s.end] as const)))
  }

  const somas = new Map<SpanInterval['name'], number>(PRECEDENCIA.map((n) => [n, 0]))
  let foraMs = 0
  let foraN = 0
  let foraMax = 0

  for (const tarefa of tasks) {
    const fim = tarefa.start + tarefa.duration
    // O que resta da tarefa depois de cada etapa reivindicar a sua parte, na ordem de precedência.
    let resto: Array<readonly [number, number]> = [[tarefa.start, fim]]
    for (const nome of PRECEDENCIA) {
      const recorte = (porEtapa.get(nome) ?? []).map(([i, f]) => [Math.max(i, tarefa.start), Math.min(f, fim)] as const)
      const valido = recorte.filter(([i, f]) => f > i)
      if (valido.length === 0) continue
      const reivindicado = subtrair(resto, subtrair(resto, valido))
      somas.set(nome, (somas.get(nome) ?? 0) + totalDe(reivindicado))
      resto = subtrair(resto, valido)
    }
    const sobrou = totalDe(resto)
    if (sobrou > 0) {
      foraMs += sobrou
      foraN += 1
      // A PIOR tarefa longa sem dono: é ela que a pessoa sente como congelamento, e o alvo da próxima etapa.
      if (sobrou > foraMax) foraMax = sobrou
    }
  }

  const saida: Record<string, number> = {}
  for (const nome of PRECEDENCIA) {
    const ms = somas.get(nome) ?? 0
    if (ms > 0) saida[`lt${nome[0].toUpperCase()}${nome.slice(1)}Ms`] = Math.round(ms)
  }
  if (foraN > 0) {
    saida.ltForaMs = Math.round(foraMs)
    saida.ltForaN = foraN
    saida.ltForaMax = Math.round(foraMax)
  }
  return saida
}
