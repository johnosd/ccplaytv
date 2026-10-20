/**
 * Tempos por etapa de uma carga por seção (feature 085, `logic/canal-metricas.md` §4). Só números: nada do provedor.
 * Entregues pela opção `onTimings` de `loadSection` — não pelo retorno, que os testes comparam com `toEqual`.
 */
export interface SectionLoadTimings {
  items: number
  categories: number
  written: number
  /** Pedido + ler + interpretar o fluxo (inclui descarregar no preparo, se houver). */
  readMs: number
  /** Descarregar no preparo (0 abaixo do limite). */
  stageWriteMs: number
  /** Reler o preparo. */
  stageReadMs: number
  /** Limpar o preparo (início + fim). */
  stageClearMs: number
  /** Preparar e comprimir: do início de `renewCategoryItems` até o orçamento. */
  encodeMs: number
  /** Dentro do orçamento (`makeRoomFor`). */
  budgetMs: number
  budgetCalls: number
  /** Do fim do orçamento até `renewCategoryItems` voltar (a transação). */
  commitMs: number
  /** Esperando o portão de atividade (não é desperdício; separa o app real da sonda). */
  gateWaitMs: number
  totalMs: number
}

type MsField = Exclude<keyof SectionLoadTimings, 'items' | 'categories' | 'written' | 'budgetCalls'>

export class SectionTimer {
  readonly values: SectionLoadTimings = {
    items: 0, categories: 0, written: 0, readMs: 0, stageWriteMs: 0, stageReadMs: 0, stageClearMs: 0,
    encodeMs: 0, budgetMs: 0, budgetCalls: 0, commitMs: 0, gateWaitMs: 0, totalMs: 0,
  }
  private readonly clock: () => number
  private readonly startedAt: number

  constructor(clock: () => number) {
    this.clock = clock
    this.startedAt = clock()
  }

  now(): number {
    return this.clock()
  }

  add(field: MsField, since: number): void {
    this.values[field] += this.clock() - since
  }

  async time<T>(field: MsField, work: () => Promise<T>): Promise<T> {
    const since = this.clock()
    try {
      return await work()
    } finally {
      this.add(field, since)
    }
  }

  finish(): SectionLoadTimings {
    this.values.totalMs = this.clock() - this.startedAt
    return { ...this.values }
  }
}
