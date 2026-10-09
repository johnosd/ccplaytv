import { createElement, isValidElement, lazy } from 'react'
import type { ComponentType, LazyExoticComponent, ReactNode } from 'react'

type RouteLoader = () => Promise<Record<string, unknown>>
const resets = new WeakMap<object, () => void>()

/** Só uma mensagem local fixa escapa de um import falho, inclusive diagnósticos do React. */
export function lazyNamed<P>(loader: RouteLoader, exportName: string): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => {
    try {
      const module = await loader()
      const component = module[exportName]
      if (typeof component !== 'function') throw new Error('Missing route export')
      return { default: component as ComponentType<P> }
    } catch {
      throw new Error('Local screen module unavailable')
    }
  })
}

/** A instância lazy sobrevive a retries de um render que ainda não foi confirmado. */
export function lazyRoute<P>(loader: RouteLoader, exportName: string): ComponentType<P> {
  let component = lazyNamed<P>(loader, exportName)
  function RetryableRoute(props: P) {
    return createElement(component as ComponentType<any>, props)
  }
  resets.set(RetryableRoute, () => { component = lazyNamed<P>(loader, exportName) })
  return RetryableRoute
}

/** O retry por SELECT troca a lazy rejeitada antes de o boundary remontá-la. */
export function resetRouteModule(route: ReactNode): void {
  if (isValidElement(route) && typeof route.type === 'function') resets.get(route.type)?.()
}
