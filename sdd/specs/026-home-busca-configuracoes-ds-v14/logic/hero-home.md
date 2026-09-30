# Lógica — Hero do Início

Feature `026-home-busca-configuracoes-ds-v14`, US1 (FR-002..FR-008).
Contrato travado: `tv-web/src/lib/catalog/homeHero.home-busca-configuracoes-ds-v14.contract.test.ts`.

## 1. Onde mora

- **`tv-web/src/lib/catalog/homeHero.ts`** — `loadHomeHero(sourceId, database)`:
  leitura local pura (Dexie), sem React. Tipos `HomeHero`/`HeroPrimary`
  (já existem como stub).
- **`tv-web/src/features/catalog/catalogApi.ts`** — `useHomeHero(sourceId)`
  (stub existe), chave `['home-hero', sourceId]`, converte `record` em
  `CatalogItemOut` com `toItemOut(record, record.kind)`.

`lib/` nunca importa de `features/`. A ordenação de episódios fica
replicada em `lib` (§3), não importada de `features/series/episodeNavigation.ts`.

## 2. Cadeia de preferência (FR-002)

```text
loadHomeHero(sourceId):
  states = getContinueWatching(sourceId, db)        // mais recente primeiro, progressSeconds > 0
  for state in states:
    parts = parseStableId(state.stableId); if !parts → continue
    if parts.kind == 'movie':
      movie = resolve(parts)                          // resolveFavorites(sourceId, 'movie', [parts])
      if movie → return { kind:'continue', record: movie,
                          primary: play(movie, state.progressSeconds) }
    if parts.kind == 'episode':
      episode = resolve(parts)                        // resolveFavorites(sourceId, 'episode', [parts])
      series  = série-pai do episódio (mesmo `seriesId`, kind 'series', geração ativa)
      if episode && series → return { kind:'continue', record: series,
                                      primary: play(episode, state.progressSeconds) }
    // qualquer outro kind, ou não resolveu → próximo state

  favorites = getGlobalFavorites(db)                  // favoritedAt desc
                .filter(f => f.sourceId == sourceId)
                .map(parseStableId).filter(kind ∈ {movie, series})
  for parts in favorites:
    record = resolve(parts); if !record → continue
    if movie  → return { kind:'favorite', record, primary: play(record, undefined) }
    if series → ep = primeiroEpisodioConhecido(sourceId, record.seriesId)   // §3, SÓ local
                return { kind:'favorite', record,
                         primary: ep ? play(ep, undefined) : { type:'open-detail' } }

  return { kind:'welcome' }

play(record, progressSeconds):
  resume    = isResumable(progressSeconds)            // resumePolicy.ts (≥ 30 s)
  startAtMs = resume ? progressSeconds * 1000 : undefined
  → { type:'play', itemId: String(record.id), title: record.name, startAtMs, resume }
```

Regras que não se negociam:

- **Nunca rede.** Proibido chamar `ensureSeriesEpisodes`, `ensureCategory`
  ou qualquer conector. Série favorita sem episódio gravado → `open-detail`
  (FR-006) — o detalhe é que busca, quando a pessoa pedir.
- **Episódio nunca é o `record`.** O hero sempre mostra filme ou série; o
  episódio só aparece em `primary.itemId` (é o que reproduz).
- **Canal nunca vira hero** (nem por favorito). Canal fica na rail "Canais
  favoritos".
- **Outra lista nunca entra** (filtro por `sourceId` em tudo).
- Item que não resolve no catálogo da geração ativa é **pulado**, nunca vira
  card quebrado (edge case "Item de Continuar que não resolve").
- Nenhum campo inventado: `record` é o registro do catálogo como está. A tela
  mostra capa (`iconUrl` via `PosterArt`/`ContentCard`), título e metadados já
  existentes (ano, grupo) — nunca sinopse/nota/relevância (FR-003).

`resolve(parts)` reaproveita `resolveFavorites(sourceId, kind, [parts], db)`
— o mesmo núcleo que `resolveContinueWatching` usa. A série-pai do episódio é
lida pelo índice `[sourceId+generation+seriesId]` filtrando `kind === 'series'`
(mesmo trecho de `resolveContinueWatching`; extraia um helper interno se
quiser, sem mudar o comportamento dela).

## 3. Primeiro episódio conhecido

`listEpisodes(sourceId, seriesId, db)` (já existe, só local). Ordena por:

1. `seasonNumber` crescente, ausente por último;
2. `episodeNumber` crescente, ausente por último;
3. `groupOrder`, depois `id`, como desempate estável.

É a mesma ordem que `groupBySeason` produz na tela de série; se as duas
divergirem, a da tela de série é a referência (o hero deve tocar o mesmo "T1:E1"
que o detalhe anunciaria).

## 4. Rótulos e ações na tela

| Ação | Quando | OK faz |
| --- | --- | --- |
| **Continuar** | `primary.type === 'play' && resume` | reproduz por cima do Início (`PlayerLayer`, `startAtMs`) |
| **Assistir** | `primary.type === 'play' && !resume` | idem, do início |
| **Assistir** | `primary.type === 'open-detail'` | `onOpenItem(item)` — abre o detalhe da série |
| **Mais informações** | sempre (hero com item) | `onOpenItem(item)` |
| **Minha Lista** / **✓ Na Minha Lista** | sempre (hero com item) | `useFavoriteToggle` — alterna favorito; rótulo por `useUserState(stableIdOf(item))` |
| **Trailer** | sempre (hero com item) | `announce`/toast "Em breve — …" (`getComingSoon('trailer')`), soft disabled |

Ordem visual e de foco: `[primária, Mais informações, Minha Lista, Trailer]`
— primária **sempre** índice 0 (mesmo padrão dos detalhes, feature 025).

Hero de boas-vindas (`kind: 'welcome'`): título e texto fixos de boas-vindas
(sem dado inventado) + duas ações reais: **Abrir TV ao vivo** e **Abrir
Filmes** → `onNavigate(destination, { zone:'shortcuts', destination })`
(FR-008). `HomeFocus` `{ zone: 'shortcuts' }` continua existindo por isso —
e porque o contrato travado da 023 (`appNav.shell-navegacao.contract.test.ts`)
o usa como payload.

## 5. Reprodução pelo hero (FR-005)

- `HomeScreen` guarda `playing: { itemId, title, startAtMs } | null`.
  `{playing && <PlayerLayer .../>}`; guarda de sessão única como
  `MovieDetailScreen` (`if (playing) return` no SELECT).
- **Sem autoplay de próximo episódio** a partir do hero: conclusão (`onCompleted`)
  e RETURN (`onClose`) fazem a mesma coisa — fecham a camada.
- Ao fechar: invalidar `['home-hero', sourceId]`, `['continue-watching', sourceId]`
  e o estado do usuário (`invalidateUserStates(queryClient)` — prefixo, cobre
  `user-states` e `history-content`; e `['user-state']` como prefixo). O foco
  volta à ação primária (índice 0 do hero), qualquer que seja o novo hero.
- Plano de hardware: ver `plan.md` D-008 (raiz `.screen`, `AppShell` continua
  montado e é escondido pela regra `:root.video-plane-visible .screen > *:not(.player-overlay)`).
- Enquanto `playing`, topbar e conteúdo recebem `active={false}` (o
  `PlayerLayer` registra em captura com `modal: true`, mas o conteúdo não pode
  desenhar foco por trás).

## 6. Invalidação cruzada

`useToggleFavorite` (catalogApi) passa a invalidar também `['home-hero']` e
`['my-list-content']` (prefixos). `useToggleWatched` passa a invalidar
`['home-hero']`. Assim o hero e a rail "Minha Lista" se atualizam sem sair da
tela (US1/AC7) e depois de "Marcar assistido" num detalhe.
