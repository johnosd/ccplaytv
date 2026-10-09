import { createElement, isValidElement, lazy, useState } from 'react'
import type { ComponentType, LazyExoticComponent, ReactNode } from 'react'

type RouteLoader = () => Promise<Record<string, unknown>>
const resets = new WeakMap<object, () => void>()

/** Rota local que pode ser aquecida antes da navegação (só código; nenhum dado é lido). */
export type PreloadableRoute<P> = ComponentType<P> & { preload: () => Promise<void> }

function routeExport<P>(module: Record<string, unknown>, exportName: string): ComponentType<P> {
  const component = module[exportName]
  if (typeof component !== 'function') throw new Error('Missing route export')
  return component as ComponentType<P>
}

/** Só uma mensagem local fixa escapa de um import falho, inclusive diagnósticos do React. */
export function lazyNamed<P>(loader: RouteLoader, exportName: string): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => {
    try {
      return { default: routeExport<P>(await loader(), exportName) }
    } catch {
      throw new Error('Local screen module unavailable')
    }
  })
}

/** A instância lazy sobrevive a retries de um render que ainda não foi confirmado. */
export function lazyRoute<P>(loader: RouteLoader, exportName: string): PreloadableRoute<P> {
  // Módulo já aquecido: a rota monta direto, sem passar pelo Suspense.
  let loaded: ComponentType<P> | undefined
  const load = async () => {
    const module = await loader()
    loaded = routeExport<P>(module, exportName)
    return module
  }
  let component = lazyNamed<P>(load, exportName)
  function RetryableRoute(props: P) {
    // O tipo é fixado por montagem: trocar de lazy para o módulo carregado no meio da vida da tela a remontaria.
    const [Type] = useState<ComponentType<P>>(() => loaded ?? component)
    return createElement(Type as ComponentType<any>, props)
  }
  resets.set(RetryableRoute, () => { component = lazyNamed<P>(load, exportName) })
  return Object.assign(RetryableRoute, { preload: () => load().then(() => undefined, () => undefined) })
}

/** O retry por SELECT troca a lazy rejeitada antes de o boundary remontá-la. */
export function resetRouteModule(route: ReactNode): void {
  if (isValidElement(route) && typeof route.type === 'function') resets.get(route.type)?.()
}
