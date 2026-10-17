import { useCallback, useEffect, useRef, useState } from 'react'
import { recordAssembly, recordDeferred, type AssemblyReport } from '../perf/assemblyTiming'
import {
  ASSEMBLY_CAP_MS,
  LOADING_DELAY_MS,
  initialAssembly,
  stepAssembly,
  type AssemblySlot,
  type AssemblyState,
  type RevealReason,
} from './screenAssembly'

/**
 * Liga `stepAssembly` a uma tela (feature 079, `logic/montagem-de-tela.md` §3): conta o teto e o atraso do "Carregando" a
 * partir da montagem, pré-carrega as capas da primeira tela e decide no próprio render (nunca num efeito) — com as leituras
 * em cache, a tela aparece já no 1º quadro.
 */

export type AssemblyScreen = 'home' | 'movies' | 'series'

/** Carrega uma imagem; a promessa termina no sucesso ou na falha (nunca rejeita). */
export type ImageLoader = (url: string) => Promise<void>

export interface UseScreenAssemblyOptions<K extends string> {
  screen: AssemblyScreen
  slots: readonly AssemblySlot<K>[]
  /** Capas da primeira tela (FR-002): seguram a tela no máximo até `LOADING_DELAY_MS`; depois chegam no lugar. */
  imageUrls: readonly string[]
  /** Algo além das imagens que ainda decide o desenho (ex.: formato largo do "Continue" em Filmes/Séries). */
  extraPending?: boolean
  /** Injeção para testes; o padrão usa `HTMLImageElement.decode()` e, sem ele (jsdom), considera a imagem pronta na hora. */
  loadImage?: ImageLoader
}

export interface ScreenAssembly<K extends string> {
  phase: 'waiting' | 'revealed'
  reason: RevealReason | null
  /** Esperando há pelo menos `LOADING_DELAY_MS` (FR-004). */
  showLoading: boolean
  isShown: (key: K) => boolean
  /** Abre a janela de uma ação da pessoa por `ASSEMBLY_CAP_MS` (FR-009). */
  follow: () => void
}

/** Decodifica a imagem antes de revelar; o `<img>` do card reaproveita o cache. Nunca `fetch`, nunca loga a URL. */
const decodeImage: ImageLoader = (url) => {
  if (typeof Image === 'undefined') return Promise.resolve()
  const image = new Image()
  if (typeof image.decode !== 'function') return Promise.resolve()
  image.src = url
  return image.decode().then(
    () => undefined,
    () => undefined,
  )
}

/** Um temporizador de uma vez, contado da montagem. */
function useElapsed(ms: number): boolean {
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), ms)
    return () => clearTimeout(timer)
  }, [ms])
  return elapsed
}

export function useScreenAssembly<K extends string>({
  screen,
  slots,
  imageUrls,
  extraPending = false,
  loadImage = decodeImage,
}: UseScreenAssemblyOptions<K>): ScreenAssembly<K> {
  const loadingDelayPassed = useElapsed(LOADING_DELAY_MS)
  const capPassed = useElapsed(ASSEMBLY_CAP_MS)

  // Montada = já houve um commit. Antes dele, todo render (inclusive o 2º do StrictMode) é o "1º render".
  const mounted = useRef(false)
  const mountedAt = useRef(0)
  useEffect(() => {
    mounted.current = true
    mountedAt.current = performance.now()
  }, [])

  const [following, setFollowing] = useState(false)
  const followTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(followTimer.current), [])
  const follow = useCallback(() => {
    clearTimeout(followTimer.current)
    setFollowing(true)
    followTimer.current = setTimeout(() => setFollowing(false), ASSEMBLY_CAP_MS)
  }, [])

  // Capas: cada URL é pedida uma vez. Elas só seguram a tela por uma janela curta — a mesma do "Carregando", para ele
  // nunca aparecer só por causa de imagem (R-008, padrão dos apps de streaming): passada a janela, a tela aparece com os
  // cards no lugar e a capa chega dentro deles, sem mover nada.
  const [settledImages, setSettledImages] = useState<ReadonlySet<string>>(() => new Set())
  const requested = useRef(new Set<string>())
  const imagesSettled = !extraPending && (loadingDelayPassed || imageUrls.every((url) => settledImages.has(url)))

  // Decide no render: o estado anterior fica num ref e o passo é puro (refazê-lo com as mesmas entradas não muda nada).
  const state = useRef<AssemblyState<K>>(initialAssembly<K>())
  state.current = stepAssembly(state.current, {
    slots,
    imagesSettled,
    capPassed,
    following,
    firstRender: !mounted.current,
  })
  const current = state.current

  const waiting = current.phase === 'waiting'
  const urlsKey = imageUrls.join('\n')
  useEffect(() => {
    if (!waiting) return
    let alive = true
    for (const url of urlsKey === '' ? [] : urlsKey.split('\n')) {
      if (requested.current.has(url)) continue
      requested.current.add(url)
      void loadImage(url).then(() => {
        if (alive) setSettledImages((previous) => new Set(previous).add(url))
      })
    }
    return () => {
      alive = false
    }
  }, [waiting, urlsKey, loadImage])

  // Medição (só com a chave de perf ligada): o momento da revelação e as fileiras adiadas depois.
  const report = useRef<AssemblyReport | null>(null)
  const revealed = !waiting
  useEffect(() => {
    if (!revealed || report.current) return
    report.current = recordAssembly({
      screen,
      revealMs: Math.round(performance.now() - mountedAt.current),
      reason: current.reason ?? 'ready',
      pending: slots.filter((slot) => slot.status === 'pending').map((slot) => slot.key),
      deferred: current.deferred,
      images: { requested: requested.current.size, settled: settledImages.size },
    })
    // Só na revelação; o resto é registrado pelo efeito das adiadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed])
  const deferredKey = current.deferred.join(',')
  useEffect(() => {
    recordDeferred(report.current, deferredKey === '' ? [] : deferredKey.split(','))
  }, [deferredKey])

  const shown = current.shown
  const isShown = useCallback((key: K) => shown.includes(key), [shown])

  return {
    phase: current.phase,
    reason: current.reason,
    showLoading: waiting && loadingDelayPassed,
    isShown,
    follow,
  }
}
