# Data Model — 038

Nenhuma tabela nova, nenhum índice novo, **sem subir a versão do Dexie** (hoje
v13). Todos os campos novos são valores sem índice, opcionais, e registros
antigos continuam válidos sem migração.

## 1. `CategoryRecord` (tabela `categories`) — campos novos

| Campo | Tipo | Significado | Ausente = |
| --- | --- | --- | --- |
| `position` | `number` | Posição de exibição declarada pela última atualização | igual a `order` |
| `renewRequestedAt` | `number` (epoch ms) | Atualização de estrutura que pediu renovação dos itens | nenhuma pendente |
| `itemsSignature` | `string` (hex) | Assinatura dos itens gravados (§6 de `logic/atualizacao-sem-esfriar.md`) | primeira renovação sempre grava |
| `storedFrom` | `{ generation, categoryId }` | (só `stored`) onde está o conteúdo novo ainda não materializado em `storedEntries` | conteúdo da própria categoria (regra da 014) |

Invariantes:

- `order` de uma categoria **nunca muda** depois de criada (é o `groupOrder`
  dos itens). Categoria nova numa atualização ganha o próximo `order` livre da
  seção.
- "Renovação pendente" ⇔ `renewRequestedAt > itemsFetchedAt`. Categoria sem
  `itemsFetchedAt` é fria, independentemente de `renewRequestedAt`.
- `CatalogCategory` (forma que as telas recebem) ganha `renewRequestedAt`;
  `listCategories` passa a ordenar por `position ?? order`.

## 2. `CatalogRecord` (tabela `channels`)

Sem campo novo. Mudança de regra: numa renovação, o `id` local de um item que
continua na fonte **é preservado** (identidade: `seriesId` para série,
`providerStreamId`, senão `originalName`), e `episodesFetchedAt` é mantido.
`categoryPosition` passa a ser a ordem de leitura (`listChannels` ordena por
ele).

## 3. `ImportRunRecord` (tabela `importRuns`) — campo novo

`sections?: Record<'channel' | 'movie' | 'series', { state: 'waiting' |
'loading' | 'ready' | 'failed' | 'unavailable'; categories?: number; items?:
number }>` — `logic/progresso-importacao.md` §1. `ImportJobResponse` (em
`importApi.ts`) expõe como `sections` no mesmo formato, snake_case não é
necessário (os campos já são palavras simples).

## 4. `EpgStatus` (derivado, `lib/epg/types.ts`)

`lastErrorAt?: number` — exposição do `SourceRecord.epgLastErrorAt` que já
existe. Só para a linha "Guia" distinguir falha desta sincronização de uma
antiga.

## 5. Estado só em memória (nunca persistido)

- **Agendador**: fonte ativa, dica, falhas por categoria na sessão
  (`Map<id, n>`), prioridades (`Set<id>`), estado (`idle | running | paused |
  done | stopped`), `ready/total` da última leitura. Recalculável do disco
  (FR-006: reabrir o app continua de onde parou porque `itemsFetchedAt` está
  no disco, não por guardar a fila).
- **Portão**: última tecla, contador de camadas de reprodução abertas,
  oculto, online.

## 6. Gerações

- **Geração ativa passa a ser longeva**: atualizações do mesmo caminho
  (Xtream→Xtream, guardado→guardado) escrevem nela.
- **Geração de varredura** (só M3U guardado): recebe categorias + blocos da
  releitura do arquivo; as categorias dela são apagadas no fim da
  atualização, os blocos ficam até serem materializados (apontados por
  `storedFrom`).
- **Gerações órfãs** (não ativas, não apontadas): itens e blocos apagados em
  partes pelo agendador (`collectStaleGenerations`), invisíveis enquanto isso.
