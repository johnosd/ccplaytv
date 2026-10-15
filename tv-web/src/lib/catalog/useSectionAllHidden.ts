import { useQuery } from '@tanstack/react-query'
import { listManagedCategories } from './categoryAccess'
import type { CategoryKind } from './db'

/**
 * Todas as categorias da seção estão escondidas (feature 066, FR-009) — distingue "a pessoa escondeu tudo" de "a lista
 * não tem categorias", para o vazio oferecer a gestão. Só lê quando a trilha já veio vazia (`enabled`). A chave começa
 * por `'categories'`, então o reset do acesso (D-005) também a refaz.
 */
export function useSectionAllHidden(sourceId: string | null, kind: CategoryKind, enabled: boolean): boolean {
  const query = useQuery({
    queryKey: ['categories', sourceId, kind, 'all-hidden'],
    queryFn: async () => {
      const categories = await listManagedCategories(sourceId as string, kind)
      return categories.length > 0 && categories.every((category) => category.hidden)
    },
    enabled: enabled && sourceId !== null,
  })
  return query.data === true
}
