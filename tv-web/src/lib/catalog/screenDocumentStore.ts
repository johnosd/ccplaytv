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
}

const keyOf = (sourceId: string, kind: string): string => `ccplay.showcase.${sourceId}.${kind}`

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
 * Apaga o documento de um tipo (ou de todos, sem `kind`).
 *
 * **Chamado por quem grava candidatos** (FR-008/FR-012): uma categoria que a pré-carga acabou de trazer muda as
 * fileiras, e o documento guardado não saberia disso — sem esta invalidação, a tela só veria o conteúdo novo na virada
 * do dia ou na troca de geração. Nunca lança.
 */
export function clearScreenDocuments(sourceId: string, kind?: 'movie' | 'series'): void {
  for (const each of kind ? [kind] : (['movie', 'series'] as const)) {
    try {
      localStorage.removeItem(keyOf(sourceId, each))
    } catch {
      // sem estado: nada a fazer
    }
  }
}
