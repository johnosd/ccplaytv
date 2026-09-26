# Lógica: Episódios, Temporadas e Autoplay

Regras que o executor NÃO deve reinterpretar. Onde há pseudocódigo, ele
delimita o "como".

## 1. Mapeamento do `get_series_info` (Xtream)

Formato real: `{ info: {...}, episodes: { "<temporada>": [ { id, episode_num,
title, container_extension, season?, info?: {...} } ] } }`. Painéis reais
misturam número e texto.

```
toNumber(v):
  se v é number finito → v
  se v é string e /^\d+$/.test(v.trim()) → parseInt
  senão → undefined

para cada (chaveTemporada, lista) em episodes:
  season = toNumber(chaveTemporada) ?? toNumber(ep.season) ?? 1   // FR-019
  para cada ep:
    streamId = ep.id != null ? String(ep.id) : undefined
    se !streamId → descarta (sem id não há como reproduzir nem identificar)
    episodeNumber = toNumber(ep.episode_num)                          // pode ficar undefined
    title = ep.title (texto não vazio, aparado)
            ?? (episodeNumber != null ? `Episódio ${episodeNumber}` : 'Episódio')
    ext = ep.container_extension (texto não vazio) ?? undefined       // D-004, sem 'mp4'
    → { kind:'episode', name:title, originalName: ep.title ?? '', seriesId,
        seasonNumber: season, episodeNumber, providerStreamId: streamId,
        streamExtension: ext, url: undefined, groupOrder: MAX_SAFE_INTEGER }
```

`info` da série e `info` do episódio (sinopse, duração, capa) **não** são
lidos nesta feature (arte/sinopse são itens 8/28).

## 2. Agrupamento M3U (`m3uSeriesGrouping.ts`)

Aplicado dentro de `consumeM3u`, **depois** de `classifyWithGroupOrder` e de
`refineFromUrl` (modo limitado), só para `kind === 'episode'`.

```
createSeriesGrouper():
  vistos = Map<chave, seriesId>

  assign(entry):                       // entry.kind === 'episode'
    base = entry.seriesKey ?? normalize(entry.name)     // normalize = trim + toLowerCase
    grupo = entry.group ?? ''
    chave = `${grupo}|${base}`
    seriesId = `m3u:${chave}`
    novo = !vistos.has(chave)
    vistos.set(chave, seriesId)
    episode = { ...entry, seriesId }
    series = novo ? {
      kind:'series', name: entry.seriesName ?? entry.name, originalName: idem,
      group: entry.group, groupOrder: entry.groupOrder, seriesId,
      providerStreamId: undefined, streamExtension: undefined, url: undefined,
    } : undefined
    return { episode, series }
```

No pipeline:

```
se refined.kind === 'episode':
  { episode, series } = grouper.assign(refined)
  se series:
    catId = categoryIdFor('series', series.group)     // mesma função de hoje
    contar catId em categoryItemCounts
    accept(series, catId)
  accept(episode, undefined)                           // episódio não tem categoria (D-001)
senão: fluxo de hoje
```

`refineFromUrl`: segmento `/series/` → `kind: 'episode'` (D-012). Os demais
segmentos inalterados.

## 3. Ordem e agrupamento na tela (`episodeNavigation.ts`)

```
groupBySeason(episodes: EpisodeOut[]): Season[]
  Season = { key: string, label: string, number: number | null, episodes: EpisodeOut[] }
  - agrupa por season_number
  - temporadas numeradas em ordem crescente, label `Temporada ${n}`
  - season_number null → um único grupo, key 'none', label 'Episódios', POR ÚLTIMO
  - dentro do grupo: episode_number crescente; null depois dos numerados;
    empate/nulos por Number(id) crescente (= ordem em que a fonte declarou)
  - temporada sem episódio não existe (é derivada dos episódios)
```

## 4. Próximo episódio

```
nextEpisode(seasons: Season[], currentId: string): EpisodeOut | null
  (s, i) = posição de currentId
  se não achou → null
  se i + 1 < seasons[s].episodes.length → seasons[s].episodes[i + 1]
  se s + 1 < seasons.length → seasons[s + 1].episodes[0]
  → null
```

Opera só sobre a lista já carregada da série aberta (FR-017 por construção).

## 5. Selo do episódio

```
episodeBadge(state: UserStateRecord | null | undefined):
  { watched: boolean, resumeSeconds: number | null }
  watched = state?.completedAt != null
  resumeSeconds = isResumable(state?.progressSeconds) ? state.progressSeconds : null
```

- Nunca aberto → `{false, null}`.
- Em andamento → `{false, n}` — **não** é assistido (US3 cenário 2).
- Concluído → `{true, null}`.
- Reassistindo um concluído → `{true, n}` — mostra os dois (D-007).

Visual: selo "✓ Assistido" sobre a miniatura (cor de acento, tokens
ADR-007, texto além da cor); em andamento, linha secundária "Continuar de
mm:ss" (`formatTime`). Nenhum percentual (duração não é conhecida antes de
tocar).

## 6. Seleção de episódio (FR-009)

```
play(ep, state):
  startAtMs = isResumable(state?.progressSeconds) ? progressSeconds * 1000 : undefined
  current = ep; playing = true
```

`undefined` deixa o motor começar do início — igual ao "Assistir" do filme.

## 7. Máquina do detalhe e autoplay (D-008/D-009)

Estados da tela, além de carregando/erro/vazio:

```
browsing                  — abas + lista, useRemoteNav da tela
playing(ep, startAtMs)    — <PlayerLayer key={ep.id} onClose onCompleted/>
countdown(next, restante) — <NextEpisodeCountdown/>, camada modal

browsing --OK em ep--------------------> playing(ep, retomada?)
playing --onClose (RETURN/erro)--------> browsing, foco = ep, invalidar estados
playing --onCompleted------------------> n = nextEpisode(ep)
                                         invalidar estados
                                         n ? countdown(n, 10) : browsing (foco = ep)
countdown --tick 1s--------------------> restante - 1
countdown --restante chega a 0---------> playing(n, retomada de n?), foco = n,
                                         aba = temporada de n
countdown --SELECT ou RETURN-----------> browsing, foco = ep (o que acabou)
```

- `playing` e `countdown` nunca coexistem: a camada do player desmonta
  (fecha a sessão) antes de a contagem montar (FR-013).
- A contagem é camada modal (`useRemoteNav(..., { modal: true })`) com um
  único botão "Cancelar", focado e roteado em `onSelect`.
- Texto: "Próximo episódio em {restante}s" + título do próximo (e
  "Temporada N" quando mudar de temporada).
- O temporizador é limpo ao desmontar (sair do detalhe durante a contagem
  não inicia nada depois).

## 8. Foco do detalhe (D-013)

```
row: 'seasons' | 'episodes'     (inicial: 'seasons', aba 0 — FR-020)
seasons: esquerda/direita → aba ±1 (clamp), troca a temporada exibida,
         foco da lista volta ao primeiro episódio da nova temporada
         baixo → row 'episodes' (se a temporada tiver episódios)
         OK → mesmo que baixo
episodes: cima/baixo → episódio ±1 (por id); cima no primeiro → row 'seasons'
          OK → play(ep)
RETURN (browsing) → onBack (tela Séries)   — FR-021
```

Lista vertical virtualizada (`useVirtualizer`, altura fixa de linha,
`useVirtualFocusSync`). Abas não virtualizadas, com `useScrollFocusedIntoView`
(rolagem horizontal quando há muitas temporadas).
