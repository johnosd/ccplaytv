import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { montarPreviews, previewsFaltando } from './previewWindow'

/**
 * Quietude exigida da janela antes de reavaliar por causa de uma invalidação. Descendo a pilha cada tecla desliza a
 * janela (o efeito recomeça e já reavalia tudo, inclusive o invalidado) e cancela este adiamento; só uma janela PARADA
 * chega até aqui — o caso do bug (a categoria chega com a tela parada). Reavaliar a cada invalidação no meio da descida
 * dobrava os re-renders da tela e estourou "Maximum update depth" no virtualizador (R-013 da 089).
 */
const QUIETUDE_MS = 400

/** Mesmo conteúdo (mesmas chaves, mesmos objetos): não troca o estado, não re-renderiza. */
function igual<T>(a: ReadonlyMap<number, T>, b: ReadonlyMap<number, T>): boolean {
  if (a.size !== b.size) return false
  for (const [id, valor] of b) if (a.get(id) !== valor) return false
  return true
}

/**
 * A janela de prévias de categoria como efeito, sem consulta "da janela" (feature 089, R-012) — e **acompanhando a
 * pré-carga** (feature 038, bug `e2e-campos-da-listagem-nao-acha-fileira-avaliados`).
 *
 * Só o que falta, está velho ou foi invalidado é buscado; o resto sai do cache sem tocar em consulta. O efeito roda quando
 * a **janela** muda (`idsKey`) e **quando a pré-carga invalida a prévia de uma categoria da janela**: como não há
 * consulta observada, a invalidação só marcava o cache e nada reexecutava o efeito — a fileira ficava em esqueleto até
 * a janela deslizar. Um único `subscribe` ao cache, com filtro barato, resolve sem recriar consulta nem observador por
 * tecla (o custo que a 089 tirou).
 *
 * Fica fora de `catalogApi.ts` (no teto de linhas do ratchet); as consultas entram por callback para não criar ciclo.
 */
export function useCategoryPreviewWindow<T>(
  sourceId: string | null,
  ids: readonly number[],
  keyOf: (sourceId: string, id: number) => readonly unknown[],
  load: (sourceId: string, id: number) => Promise<T>,
  staleMs: number,
  empty: ReadonlyMap<number, T>,
): ReadonlyMap<number, T> {
  const queryClient = useQueryClient()
  const [previews, setPreviews] = useState<ReadonlyMap<number, T>>(empty)
  const idsKey = ids.join(',')
  useEffect(() => {
    if (sourceId === null || ids.length === 0) return undefined
    let vivo = true
    const montar = () => montarPreviews(ids, (id) => queryClient.getQueryData<T>(keyOf(sourceId, id)))
    const rodar = () => {
      setPreviews((atual) => {
        const proximo = montar()
        return igual(atual, proximo) ? atual : proximo
      })
      const faltando = previewsFaltando(ids, (id) => queryClient.getQueryState<T>(keyOf(sourceId, id)), Date.now(), staleMs)
      if (faltando.length === 0) return
      void Promise.all(faltando.map((id) => queryClient.fetchQuery({
        queryKey: keyOf(sourceId, id),
        queryFn: () => load(sourceId, id),
        staleTime: staleMs, gcTime: 30_000,
      }))).then(() => { if (vivo) setPreviews((atual) => { const proximo = montar(); return igual(atual, proximo) ? atual : proximo }) }, () => {})
    }
    rodar()
    // Uma rajada de invalidações (a pré-carga entrega categorias seguidas, e descendo a pilha cada foco pré-busca uma) vira
    // UMA reavaliação, depois de um período de quietude da janela: re-renderizar a cada evento, no meio da rolagem, fez o
    // virtualizador estourar "Maximum update depth" (R-013 da 089) — 1 vez em 3 no E2E da pilha de 302 categorias.
    let agendada: ReturnType<typeof setTimeout> | undefined
    const jaPronta = (id: number) => (queryClient.getQueryData<{ status?: string }>(keyOf(sourceId, id))?.status === 'ready')
    const naJanela = new Set(ids)
    const parar = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'invalidate') return
      const [escopo, fonte, id] = event.query.queryKey
      if (escopo !== 'category-preview' || fonte !== sourceId || typeof id !== 'number' || !naJanela.has(id) || agendada !== undefined || jaPronta(id)) return
      agendada = setTimeout(() => {
        agendada = undefined
        if (vivo) rodar()
      }, QUIETUDE_MS)
    })
    return () => {
      vivo = false
      clearTimeout(agendada)
      parar()
    }
    // `ids` fora das dependências de propósito: é array novo a cada render, e o que importa são os ids — com `idsKey`
    // diferente o efeito roda com os ids daquele render, que são exatamente os de `idsKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, idsKey, queryClient])
  return previews
}
