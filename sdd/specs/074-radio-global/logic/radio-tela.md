# Lógica: tela Rádio

Escopo: `tv-web/src/features/radio/` e a integração em `App.tsx`/`navigation/`/`features/shell/TopBar.tsx`.
Contratos travados: `features/radio/RadioScreen.radio-global.contract.test.tsx` (4 testes).

## 1. Composição (cada arquivo ≤ 300 linhas — catraca)

| Arquivo | Papel |
| --- | --- |
| `RadioScreen.tsx` | Só compõe: hooks abaixo + moldura (`components/AppShell`, depois de T001). |
| `useRadioCatalog.ts` | Países, trilha, entrada atual, estações, gerações, cache (§3). |
| `useRadioPlayback.ts` | Máquina de reprodução (§5). |
| `useRadioKeyboard.ts` | Zonas de foco e teclas (§4); **um** `useRemoteNav` (regra da feature 040). |
| `NowPlayingBar.tsx` | Barra "Tocando agora" (§5.3). |
| `radioColumns.tsx` | Funções de desenho da trilha e da lista (funções, não componentes; mesmo motivo de `liveColumns.tsx`). |
| `radioSessionMemory.ts` | Memória de foco da sessão (§6). |

Reuso obrigatório, sem cópia: `SideCategoryNav` (trilha), `ChannelRow` (linha da estação: `logoUrl`, `name`,
`nowPlaying` = até 2 tags juntadas por " · ", `group` = país quando a entrada é Mundo/Favoritos, `favorite`),
`PosterArt` (fallback de iniciais), `EmptyState`/`ErrorState`/`Spinner`, `lib/focus/paging.ts` (`pagedIndex`,
`pageSizeFor`), `lib/focus/reconcileFocus.ts` (`locateOrNeighbor`), `lib/announcer.ts`.

Sem `react-query` (D-013): estado local + gerações; a tela não exige `QueryClientProvider`.

## 2. Desenho

```text
┌ AppShell ───────────────────────────────────────────────┐
│ topBar slot → <NowPlayingBar/>  (<section aria-label="Tocando agora">)
│ ┌ trilha ──────────┐ ┌ estações ───────────────────────┐
│ │ ★ Favoritos      │ │ 100 mais ouvidas de 1.234        │ ← escopo parcial (D-010)
│ │ Mais ouvidas … │ │ [logo] Rádio X — pop · rock   ★ │
│ │ Brasil   1.234   │ │ …                                │
│ │ Argentina  812   │ │                                  │
│ └──────────────────┘ └──────────────────────────────────┘
│ HintBar: OK Tocar · Segurar OK Favoritar · ◀▶ Página · ↩ Voltar
└──────────────────────────────────────────────────────────┘
<div id="player-surface" hidden />   ← só o adaptador <video> de dev monta aqui
```

- A raiz é `.screen.radio-screen`. A Rádio **nunca** liga `video-plane-visible` (não usa `PlayerLayer` nem
  `usePlayerSession`, D-005): o AVPlay toca áudio com a camada web opaca, como no spike.
- A barra fica no slot `topBar` do `AppShell` (a Rádio não tem topbar própria, D-001). Sem reprodução, mostra só o
  rótulo "Tocando agora" e "Nada tocando", e não é focável.

## 3. Trilha, entradas e carga

Ordem da trilha (entradas por identidade `RadioEntryKey`):

1. `favorites` — "★ Favoritos" (fixa, `pinned`);
2. `world` — "Mais ouvidas no mundo" (fixa);
3. `country:<país da TV>` se existir na lista de países;
4. demais `country:XX` por `stationCount` decrescente, empate por nome exibido (`localeCompare` no idioma do app), com
   `count` = `stationCount`.

Sem lista de países (falha e sem cache): a trilha mostra 1, 2, a entrada inicial (§3.2) sem contagem e uma entrada de
ação "Tentar carregar países" (OK recarrega). Nunca uma trilha sem item focável.

### 3.1 Entrar numa entrada (OK na trilha, ou a entrada inicial ao abrir)

```text
enter(entry):
  generation += 1; abort(controller anterior); controller = new AbortController()
  entered = entry; zona = 'list'; foco da lista = lembrado(entry) ?? primeiro
  se entry é país → localStorage['ccplaytv:radio-last-country'] = código
  favorites → lê favoritos do banco local (sem rede), estado pronto
  world/country:
    cache = lerCache(entry)
    cache fresco (< 6 h)            → mostra, sem rede
    cache vencido                   → mostra marcado "pode estar desatualizado" e busca
    sem cache                       → estado carregando e busca
    busca: directory.listStations({ countryCode }, controller.signal)
      geração mudou → descarta (contrato 3)
      ok    → mostra, grava cache
      falha → com cache: mantém + aviso + "Tentar de novo"; sem cache: ErrorState com "Tentar de novo" e "Voltar"
```

- **Focar** uma entrada só muda o foco. Nenhuma consulta, nenhuma troca de grade, nenhum prefetch (D-007, contrato 2).
- A lista de países carrega uma vez ao montar a tela (cache de 7 dias, mesma regra de fresco/vencido).
- Carregando: coluna da lista com `EmptyState` "Carregando estações…" e a ação "Voltar" focada (como a Live).

### 3.2 Entrada inicial

`memória da sessão (última entrada)` → `country:<último país salvo>` se estiver nos países → `country:<país da TV>` →
`country:BR` → `world`. O país da TV é a região do primeiro item de `navigator.languages` que tiver região (`pt-BR` →
`BR`); sem região, ninguém. Quando a lista de países ainda não chegou, o código salvo/da TV vale mesmo assim (a busca
de estações aceita o código sem a lista).

Com a entrada inicial carregada, o foco está na **primeira estação** (zona `list`) — contrato 1.

## 4. Zonas de foco e teclas

Zonas: `bar` | `trail` | `list`. Uma só ativa.

| Zona | ↑ / ↓ | ← / → | OK | Segurar OK / amarela | RETURN |
| --- | --- | --- | --- | --- | --- |
| trail | move (clamp); ↑ no 1º → `bar` se focável | página (`pagedIndex`) | `enter` | — | `onBack()` |
| list | move; ↑ no 1º → `bar` se focável | página | §5.1 | alterna favorito (§7) | `trail`, foco na entrada atual |
| bar | ↓ → zona anterior | entre as ações | ação focada | — | zona anterior |

- Tecla de mídia `MediaStop`: para a reprodução em qualquer zona. Play/Pause: nada (ao vivo não pausa, FR-016).
- Estado vazio, erro ou carregando na lista: a ação do estado é o item focável; ↑/↓ não saem dela.

## 5. Reprodução

### 5.1 OK numa estação `s`

```text
atual = playback.station
se atual?.id == s.id e estado ∈ {connecting, playing} → stop()
se atual?.id == s.id e estado == failed             → play(s)      (tentar de novo)
senão                                                → play(s)
```

### 5.2 `play(s)` / `stop()`

```text
play(s):
  token += 1; fecha a sessão atual; estado = connecting(s)
  url = s.streamUrl
  se a entrada atual é favorites:
     try  atual = await directory.stationsByUuid([s.uuid], signal)   (contrato 4)
          token mudou → sai
          vazio → failed(s, 'unavailable'); sai
          url = atual[0].streamUrl; atualiza o retrato do favorito (sem await)
     catch RadioDirectoryError → url = favorito.lastStreamUrl ?? (failed(s, 'offline'); sai)
  sessão = createPlayerSession(url, FULLSCREEN_REGION, 'channel', { createAdapter })
  sessão.subscribe:
     'playing' (primeira vez) → estado = playing(s); directory.reportClick(s.uuid); limpa o timer
     'error'                  → fecha; failed(s, navigator.onLine === false ? 'offline' : 'unavailable')
  timer de 15 s sem 'playing' → fecha; failed(s, 'unavailable')                (D-015)

stop(): token += 1; fecha a sessão; limpa o timer; estado = idle
desmontar a tela: stop()                                                      (FR-015)
```

- Callback de sessão antiga nunca muda o estado (o token mudou). Sessão nunca é reaproveitada.
- `kind: 'channel'` dá capacidades sem pausa nem busca (FR-016).
- A Rádio não chama `disableScreenSaver`: a proteção de tela liga normalmente (FR-018).

### 5.3 Barra "Tocando agora"

`<section aria-label={t('radio.nowPlaying')}>` (pt: "Tocando agora"). Mostra arte, nome, país (nome exibido),
`codec · kbps` quando houver e o estado (`Conectando…`, `Ao vivo`, `Estação indisponível`, `Sem conexão`).

- Ações: `connecting`/`playing` → [Parar]; `failed` → [Tentar de novo, Próxima estação].
- "Próxima estação" = a estação depois de `s` na lista da entrada atual; sem próxima, a ação fica soft disabled.
  Tocar a próxima exige o OK da pessoa: nada toca sozinho (FR-017).
- Cada mudança de estado é anunciada (`lib/announcer.ts`); o foco **não** é puxado para a barra.

## 6. Memória e restauração (FR-003)

`radioSessionMemory.ts`, em memória de módulo (como `liveSessionMemory.ts`):

- `rememberRadioFocus(entry, stationId, index)` ao mover o foco na lista; `recalledRadioFocus(entry)`;
- `rememberRadioEntry(entry)` ao entrar; `recalledRadioEntry()`;
- `resetRadioSessionMemory()` (também chamado em `src/setupTests.ts`).

Ao voltar: entra na entrada lembrada; o foco vai para a estação lembrada **por id** (`locateOrNeighbor`); sumiu → a
primeira estação.

## 7. Favoritos

- Segurar OK (`onLongSelect`) ou a tecla amarela (`onFavoriteKey`) na zona `list` alterna o favorito da estação focada
  e **nunca** toca (contrato 4). Anuncia "Adicionada aos favoritos"/"Removida dos favoritos".
- Gravar o retrato: `id`, `uuid`, `name`, `artUrl`, `countryCode`, `lastStreamUrl`, `favoritedAt` (`data-model.md`).
- `★ Favoritos` lê só do banco local, do mais recente para o mais antigo, com o país em cada linha. Vazio:
  `EmptyState` focável explicando o gesto.
- Desfavoritar dentro de `★ Favoritos` tira a linha; o foco vai para a vizinha (`locateOrNeighbor`).

## 8. Nomes de país

`countryDisplayName(code, language)` = `new Intl.DisplayNames([APP_LANGUAGE_LOCALE[language]], { type: 'region' }).of(code)`
→ se lançar ou devolver o próprio código, `directoryName` → o código. Função pura que recebe o idioma (regra do i18n:
helper puro não lê o store).

## 9. Integração no app

- `navigation/appNav.ts`: `AppScreen` ganha `{ name: 'radio' }`; `TopbarItem` ganha `'radio'`. **`TopDestination` não
  muda** (D-002).
- `features/shell/TopBar.tsx`: prop opcional `onOpenRadio`. Só com ela o item "Rádio" é desenhado (depois de "Séries")
  e entra na ordem de foco (D-003). `currentItem` aceita `'radio'`.
- Início (`HomeScreen` → `TopBar`): `onOpenRadio` → `open { name: 'radio' }` com
  `from: { name: 'home', focus: { zone: 'topbar', item: 'radio' } }` (volta com o foco no item Rádio).
- Filmes/Séries (`vodShell`) e Busca/Configurações: `onOpenRadio` seguindo o mesmo padrão que cada tela já usa para "TV
  ao vivo" (`switch-top` nas de topo).
- `App.tsx`: `case 'radio'` → sem lista ativa, `null`; senão `<RadioScreen onBack={goBack} />`.
- `navigation/routeModules.ts`: `lazyRoute(() => import('../features/radio/RadioScreen'), 'RadioScreen')`;
  `vite.config.ts` ganha `['route-radio', '/src/features/radio/RadioScreen.']`; `CCPlayTv/tizen_web_project.yaml` ganha
  `assets/route-radio.js` (e qualquer outro arquivo que o guard do `sync-tizen` listar).
