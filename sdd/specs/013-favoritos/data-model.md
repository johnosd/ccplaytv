# Data Model: Favoritos em Canais, Filmes e Séries

**Feature**: `013-favoritos` | **Schema Dexie atual**: v8 (feature 012) → **v9**

## 1. O que NÃO muda

- `UserStateRecord` (feature 008) já tem tudo o que o favorito precisa:
  `stableId`, `sourceId`, `isFavorite`, `favoritedAt` (indexado, ordem da
  categoria "Favoritos"). **Nenhum campo novo** — em particular, nenhum
  instantâneo de nome/arte (decisão da spec: só aparece o que estiver
  carregado).
- `CatalogRecord` e `CategoryRecord`: nenhum campo novo.
- A categoria "Favoritos" **não é gravada** em `categories`: é virtual,
  montada na leitura (D-004 do plan.md). Não conta em `sectionCount` nem
  na contagem de categorias do hub.

## 2. Índice novo em `channels` (v9)

```ts
this.version(9).stores({
  channels:
    '++id, [sourceId+generation], [sourceId+generation+groupOrder], ' +
    '[sourceId+generation+kind+groupOrder], [sourceId+generation+seriesId], ' +
    '[sourceId+generation+kind+providerStreamId]',
})
```

- **Para quê**: localizar, na geração ativa, o registro de um favorito de
  provedor pelo id do painel, sem varrer a tabela
  (`logic/resolucao-favoritos.md`).
- **Por que com `kind`**: o `stream_id` do Xtream não é único entre live,
  VOD e séries.
- **Custo de escrita**: registro sem `providerStreamId` (toda entrada de
  fonte M3U) não entra no índice composto — a importação integral de M3U,
  que é o caminho de escrita grande, não paga nada. Escrita de categoria
  sob demanda (Xtream) paga uma entrada de índice por item (R-004).
- **Sem `.upgrade()`**: é só índice; o Dexie o constrói sobre os registros
  existentes na abertura da v9.
- **Sem índice novo para nome (M3U)**: a varredura por nome é rara e
  limitada ao tipo (R-003); um índice de `originalName` pagaria custo em
  toda importação M3U de 300 mil entradas, que é exatamente o gargalo que
  a feature 010 mediu.

## 3. Ciclo de vida

| Evento | Efeito no favorito |
| --- | --- |
| Segurar OK sobre item favoritável | `toggleFavorite(stableId, sourceId, !atual)` |
| Ressincronizar a fonte (nova geração) | Nada — `userStates` não tem geração; o favorito volta a resolver quando o item de mesma identidade estiver carregado |
| Item some da fonte | Favorito fica gravado e deixa de resolver; a categoria mostra a nota de FR-009 |
| Remover a fonte | `deleteUserStatesForSource(sourceId)` apaga **todo** o estado do usuário da fonte (favoritos e retomada) — D-007 |
| Reproduzir / concluir | Nada no favorito (FR-016) |
