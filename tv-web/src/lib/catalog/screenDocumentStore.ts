/**
 * Onde o documento de tela é guardado (feature 086, T071/T072) — só o meio, sem nada do catálogo.
 *
 * Separado de `screenDocument.ts` de propósito: quem **invalida** o documento é quem grava os candidatos
 * (`showcaseCandidates.ts`), e esse módulo não pode depender da montagem do documento sem fechar um ciclo de imports.
 *
 * **Por que `localStorage`** (T070, `evidencias/sonda-montagem-tv-2026-10-21.md`): com a carga da lista em curso, ler
 * este documento custou p95 **0,8 ms** nas duas rodadas, contra 22,6/19,1 ms num `get` do IndexedDB e **223 ms num
 * banco separado**, que era a candidata principal e a TV reprovou. O gargalo é a **thread**, não a fila.
 *
 * Nada aqui lança: `localStorage` falha em modo privado, com cota cheia ou com dados bloqueados, e a tela não pode cair
 * por causa disso — sem documento, a abertura só fica mais lenta.
 */

import type { CatalogReadItem } from './readProjectionTypes'

/** Sobe quando a forma do documento muda: documento de outra versão é ignorado, nunca migrado. */
export const SCREEN_DOCUMENT_VERSION = 2

/**
 * Teto de tamanho. O `localStorage` é síncrono: um documento grande bloquearia a thread no `JSON.parse`, justamente o
 * que estamos evitando. A sonda mediu 0,8 ms com 28 KB; acima do teto, não guardamos.
 */
export const SCREEN_DOCUMENT_MAX_BYTES = 120_000

export interface ScreenDocumentCategory {
  id: number
  name: string
  /** Itens já obtidos (o aviso de cobertura parcial sai disto, FR-006). */
  covered: boolean
  order: number
}

export interface ScreenDocument {
  v: number
  sourceId: string
  generation: number
  kind: 'movie' | 'series'
  builtAt: number
  /** Dia da construção: a semente de "Bem avaliados" é diária, então documento de outro dia não serve. */
  day: string
  /**
   * Categorias escondidas/travadas quando o documento foi construído, ordenadas. Se a pessoa mudar isso, o documento
   * **não é usado** — é o que mantém a decisão de visibilidade fora do dado guardado (regra da feature 066).
   */
  excluded: number[]
  categories: ScreenDocumentCategory[]
  recent: CatalogReadItem[]
  rated: CatalogReadItem[]
  coveredCategories: number
  totalCategories: number
  /** Capas da primeira tela, para o decode começar na mesma leitura que traz as fileiras (FR-023). */
  images: string[]
  /** Calculado na leitura (não gravado): há candidatos novos desde que este documento foi montado. */
  stale?: boolean
}

const keyOf = (sourceId: string, kind: string): string => `ccplay.showcase.${sourceId}.${kind}`
/** Marca de "vencido" em chave própria: gravar um número é barato, reescrever o documento inteiro não seria. */
const staleKeyOf = (sourceId: string, kind: string): string => `ccplay.showcase.${sourceId}.${kind}.stale`

/** Lê o que está guardado, sem validar nada além do JSON. Quem valida é `readScreenDocument`. */
export function loadRawScreenDocument(sourceId: string, kind: 'movie' | 'series'): ScreenDocument | undefined {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(keyOf(sourceId, kind))
  } catch {
    return undefined
  }
  if (raw === null) return undefined
  try {
    return JSON.parse(raw) as ScreenDocument
  } catch {
    return undefined
  }
}

/** Guarda o documento. `false` quando passou do teto ou o `localStorage` recusou. */
export function saveScreenDocument(document: ScreenDocument): boolean {
  const raw = JSON.stringify(document)
  if (raw.length > SCREEN_DOCUMENT_MAX_BYTES) return false
  try {
    localStorage.setItem(keyOf(document.sourceId, document.kind), raw)
    return true
  } catch {
    // Cota cheia: tira o documento do outro tipo e tenta uma vez mais — dois documentos, nenhum essencial.
    try {
      localStorage.removeItem(keyOf(document.sourceId, document.kind === 'movie' ? 'series' : 'movie'))
      localStorage.setItem(keyOf(document.sourceId, document.kind), raw)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Apaga o documento de um tipo (ou de todos, sem `kind`). Para quando ele não pode mais ser mostrado: geração trocada,
 * lista apagada. Nunca lança.
 */
export function clearScreenDocuments(sourceId: string, kind?: 'movie' | 'series'): void {
  for (const each of kind ? [kind] : (['movie', 'series'] as const)) {
    try {
      localStorage.removeItem(keyOf(sourceId, each))
      localStorage.removeItem(staleKeyOf(sourceId, each))
    } catch {
      // sem estado: nada a fazer
    }
  }
}

/**
 * Apaga **todos** os documentos, de todas as listas. Para quando a regra de visibilidade muda (feature 066): a tela não
 * pode mostrar categoria escondida nem por um quadro, e a leitura do documento é síncrona, sem consultar o banco.
 */
export function clearAllScreenDocuments(): void {
  try {
    const doomed: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key !== null && key.startsWith('ccplay.showcase.')) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)
  } catch {
    // sem estado: nada a fazer
  }
}

/**
 * Marca o documento como **vencido, mas ainda usável** — chamado por quem grava candidatos (FR-008/FR-012).
 *
 * Por que não apagar: a pré-carga grava uma categoria por rodada, e apagar a cada gravação fazia o documento quase
 * nunca sobreviver. Na TV isso deixou a 1ª abertura do Início em ~1,81 s nas três entradas medidas, sempre
 * caindo no caminho dos candidatos. Mostrar o documento de um instante atrás e trocá-lo quando o novo estiver pronto é
 * o que a spec pede (FR-008: atualiza **na própria sessão**, sem a pessoa pedir nada).
 *
 * Conteúdo que não pode ser mostrado (categoria escondida, geração trocada) **não** passa por aqui: a validação da
 * leitura recusa o documento nesses casos.
 */
export function markScreenDocumentsStale(sourceId: string, kind?: 'movie' | 'series'): void {
  for (const each of kind ? [kind] : (['movie', 'series'] as const)) {
    try {
      localStorage.setItem(staleKeyOf(sourceId, each), String(Date.now()))
    } catch {
      // sem estado: o documento continua valendo; o refresh de 2º plano o atualiza de todo jeito
    }
  }
}

/** O documento guardado está vencido (há candidatos novos desde que foi montado)? */
export function isScreenDocumentStale(sourceId: string, kind: 'movie' | 'series', builtAt: number): boolean {
  try {
    const marked = localStorage.getItem(staleKeyOf(sourceId, kind))
    return marked !== null && Number(marked) > builtAt
  } catch {
    return false
  }
}
