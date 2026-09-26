# Data Model: Catálogo Unificado (v2)

Esta feature expande o schema do Dexie (de v1 para v2) para acomodar múltiplos tipos de mídia, deixando de ser estritamente um banco de canais.

## 1. Evolução da Tabela `channels`

A tabela atual (`channels`) será mantida fisicamente para evitar refatoração massiva de tabela e migrações caras, mas seu tipo TypeScript será generalizado para `CatalogRecord`.

### Índices (v2)
- `id` (Primary Key, auto-increment)
- `[sourceId+generation]` (Para deleção por fonte/geração)
- `[sourceId+generation+groupOrder]` (Para listagem rápida paginada preservando a ordem do provedor, independentemente do tipo)
- `[sourceId+generation+kind+groupOrder]` (NOVO - Para filtrar rapidamente apenas filmes ou apenas séries de um determinado grupo/categoria, fundamental para a segregação de abas na UI)

### Campos de `CatalogRecord`
```typescript
export type CatalogItemKind = 'channel' | 'movie' | 'series' | 'episode' | 'unclassified'

export interface CatalogRecord {
  id?: number
  sourceId: string
  generation: number
  kind: CatalogItemKind       // <-- NOVO: Distinção de tipo obrigatória
  name: string
  originalName: string
  group?: string
  groupOrder: number
  
  // Identificadores na origem
  providerStreamId?: string   // Usado por canais e VOD
  providerCategoryId?: string // ID da categoria original
  
  // Específicos de Série / Episódio
  seriesId?: string           // <-- NOVO: Vincula episódio/temporada à série raiz
  seasonNumber?: number       // <-- NOVO
  episodeNumber?: number      // <-- NOVO
  
  // Específicos VOD
  streamExtension?: string    // <-- NOVO: Ex: 'mp4', 'mkv' (para montar a URL final)
  
  // M3U Legacy
  directUrl?: string
}
```

## 2. Abordagem de Migração de Dados
A feature 005 instrui (D-004) que a troca de catálogo é feita apagando as gerações antigas. Para garantir transição limpa para a v2 do Dexie:
- O banco será atualizado para a `.version(2)`.
- As tabelas e dados existentes (`version(1)`) das gerações passadas sofrerão upgrade automático pelo IndexedDB.
- Se o usuário tentar acessar o catálogo antigo, os dados de canal continuarão lá (apenas não terão a tag `kind` retroativa, o que é seguro pois a feature ainda não afeta a UI de canais ao vivo, e no próximo sync o catálogo nascerá nativamente em v2).

