# Implementation Plan: Player chrome do Design System V14 com auto-hide e teclas de mídia (Onda 6)

**Slug**: `027-player-chrome-ds-v14` | **Date**: 2026-09-28 | **Spec**: `sdd/specs/027-player-chrome-ds-v14/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Troca a barra de controles da feature 011 (`PlayerControls`) por um
**chrome V14** dentro do `PlayerLayer`. Ele serve os três tipos de mídia:

- **VOD**: identidade (título; no episódio, a série e `T1:E2 • nome`),
  timeline e ⏪ ▶⏸ ⏩, com o mesmo comportamento de teclas de hoje. Ganha
  "Episódio anterior"/"Próximo episódio" (soft disabled no limite) e os
  mocks "Em breve" Áudio e legendas, Qualidade, Velocidade, Aspecto e Info.
- **Live**: dois níveis. A faixa de identidade ("AO VIVO", número, logo e
  nome, sem botão) aparece ao abrir e a cada troca; nela OK continua
  abrindo o zapping da 016. A linha de controles (Guia, Áudio, Qualidade,
  Aspecto, Info — todos "Em breve") é revelada por ←/→. ↑/↓ e CH± trocam
  de canal direto, sem voltar ao início nas pontas.

As teclas de mídia do controle (Play/Pause, Play, Pause, Stop, ⏪, ⏩, CH±)
são registradas só se a TV as declarar e tratadas só pelo `PlayerLayer`.

Abordagem:

- Uma função pura `chromeControls` (`components/playerChrome.ts`) decide a
  linha a partir de mídia × capacidades × vizinhança de episódio.
- Um componente de apresentação `PlayerChrome.tsx` desenha a linha.
- O `PlayerLayer` ganha três props opcionais: `identity`, `onChannelStep` e
  `episodeStep`. Ele continua genérico, como na 016: a vizinhança de canal
  vive no `LiveScreen` e a de episódio no `SeriesDetailScreen`.
- `useRemoteNav` ganha o handler opcional `onMediaKey`.
- `lib/tizenMediaKeys.ts` faz o registro das teclas.

A Onda 7 (limpeza/QA) é a feature 028. Aqui **não se mexe** no
`features/screens.css`: o CSS novo vai em `styles/player.css`.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Vite 8 (`build.target: 'chrome108'`)

**Primary Dependencies**: `PlayerService`/adaptadores e contrato de capacidades (feature 011, `lib/player/`), `useRemoteNav` (ADR-009), `useToast` + `Toast` (feature 021: portal no `AnnouncerRegion` quando existir), `Icon`/`iconPaths.ts` (021), `PosterArt` (`variant="logo"`, 015/024), registro `lib/comingSoon.ts` (022), `channelNumberOf` (024), `episodeNavigation.ts` (012/025), `tizen.tvinputdevice` (mesmo padrão de `lib/tizenColorKey.ts`)

**Storage**: nenhum dado novo — sem migração Dexie; o progresso continua pelo `progressRecorder` existente

**Testing**: Vitest + Testing Library + jsdom (`src/setupTests.ts`); Playwright E2E (`tv-web/e2e/*.mjs`, `tv-web/e2e.mjs`) contra `npm run dev`

**Target Platform**: Samsung Tizen 8.0 / Chromium 108 (QN50Q60DAGXZD), palco 1920×1080, AVPlay no plano de hardware

**Performance Goals**: chrome aparece/some sem atraso perceptível; troca por ↑/↓ reaproveita a troca de sessão da 016 (fecha → abre, descarta a troca que ficou para trás)

**Constraints**:

- Controles reais só por capacidade (constitution, "Progresso e Capacidades São Reais").
- Nenhum dado inventado: sem "programa atual" e sem Info fictício.
- `webapis.avplay` é singleton.
- O chrome precisa ficar legível sobre o plano de hardware (`.player-overlay` já é exceção da regra `visibility:hidden`).
- Só tokens V14.
- Sem arquivo novo emitido pelo build: o CSS entra no bundle único.

**Scale/Scope**: um player por vez; categorias com até alguns milhares de canais (a vizinhança é um array já em memória)

## Decisões Invariantes

- **D-001 — `PlayerLayer` continua genérico.** Recebe `identity`,
  `onChannelStep` e `episodeStep` (stubs já no tipo) e nunca importa nada de
  `features/live` nem de `features/series`. A mídia do chrome (`live` ×
  `vod`) sai de `playback.kind`, nunca do motor.
- **D-002 — Níveis**: VOD `hidden ⇄ full` (teclas da 011 preservadas, inclusive
  ←/→ escondido = salto ∓10 s); Live `hidden ⇄ band ⇄ row`
  (`logic/chrome-player.md` §3). Na faixa, OK chama `onIdleSelect`
  (zapping); na linha, OK aciona o controle focado; RETURN na linha volta à
  faixa.
- **D-003 — Controle real ausente quando a capacidade é `false`** (regra D-003
  da 011 mantida). Soft disabled só para `soon` (mock) e `limit` (episódio).
- **D-004 — Ordem e rótulos da linha fixados** pela tabela de
  `logic/chrome-player.md` §2 (o contrato depende deles).
- **D-005 — Avisos pelo toast próprio do `PlayerLayer`**, renderizado dentro do
  `.player-overlay`. Os textos fixos estão em `logic` §6.
- **D-006 — Teclas de mídia**: `lib/tizenMediaKeys.ts` registra só as 8
  teclas, e só as listadas por `getSupportedKeys()`. Lista ausente, vazia
  ou com erro → nada registrado (mais estrito que `tizenColorKey.ts`, por
  FR-023). A chamada fica no `App.tsx`, junto de `registerFavoriteColorKey()`.
  `mediaKeyOf` reconhece a tecla por `key` ou por `keyCode`.
- **D-007 — `useRemoteNav.onMediaKey` é opcional.** Sem ele, nada muda para
  nenhuma tela. Só o `PlayerLayer` passa esse handler (FR-029 por
  construção). Tabela de ações por mídia em `logic` §5. Com `topLayer`
  aberto, só `MediaStop` age, e fecha o player inteiro.
- **D-008 — Vizinhança de canal no `LiveScreen`.** É um snapshot (`zapSequenceRef`)
  da lista exibida quando o canal começou, filtro de busca incluído,
  capturado de novo a cada troca pela lista de zapping. Canais não
  reproduzíveis são pulados e não há volta nas pontas. A troca atualiza
  `lastGoodChannelRef` (fallback de erro da 016) e
  `focusedIdentity.channelId` (FR-014).
- **D-009 — Direção**: ↑/`ChannelUp` = `previous`, ↓/`ChannelDown` = `next`
  (premissa da spec; confirmar na TV, R-003).
- **D-010 — Vizinhança de episódio no `SeriesDetailScreen`.** Usa a função pura
  nova `previousEpisode` (espelho de `nextEpisode`). Trocar faz
  `setMode({ kind: 'playing', … })`, e o teardown do `PlayerLayer` grava o
  progresso do episódio atual. O episódio aberto pelo hero da Home não
  recebe `episodeStep`, então fica sem botões de episódio (R-007).
- **D-011 — `PlayerControls.tsx` é substituído** por `PlayerChrome.tsx` +
  `playerChrome.ts`. `hasSeekBar` vai para `playerChrome.ts`;
  `PlayerControls.tsx` e o teste dele saem, com os casos ainda válidos
  migrados.
- **D-012 — CSS novo só em `tv-web/src/styles/player.css`**, importado em
  `main.tsx` logo depois de `./features/screens.css`. Nada é adicionado ao
  `screens.css`, que é escopo da 028. As regras de plano de hardware
  existentes ficam onde estão.
- **D-013 — Ícones novos** em `iconPaths.ts`: `speed`, `aspect`, `guide`,
  `skipPrevious`, `skipNext`. Os já existentes cobrem o resto (`play`,
  `pause`, `rewind`, `forward`, `audio`, `quality`, `info`, `live`).
- **D-014 — Entradas novas em `COMING_SOON`**: `player-tracks`,
  `player-quality`, `player-speed`, `player-aspect` e `player-info`, todas
  apontando para o backlog item 55. O Guia reusa `epg-guide` (item 42).
- **D-015 — Auto-hide de 5 s inalterado; pausado não esconde.** A faixa e a
  linha do Live também passam a esconder sozinhas: sai o `return` antecipado
  de `scheduleHide` quando não há ações.
- **D-016 — Sem nova dependência npm, sem migração Dexie, sem arquivo novo
  emitido pelo build.**

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Nada novo exige conta. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Chrome mostra só nome/número/logo; mensagens de erro seguem as sanitizadas existentes; nenhum texto do chrome interpola URL. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | ↑/↓ percorrem a entrada da própria fonte, na ordem exibida (D-008). |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Sem "programa atual", Info/Qualidade/Velocidade só "Em breve" (D-014). |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Chrome, mocks e vizinhança são locais; só a troca de canal/episódio abre sessão (ação explícita). |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | Não se aplica. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Teclas de mídia são atalho; todas as ações têm caminho por setas+OK+RETURN (troca de canal por ↑/↓ e pela lista; episódio pelos botões). RETURN fecha a linha antes de sair (D-002). |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto | ✅ | ✅ | Não toca importador. |
| Foco Visível e Sem Becos Sem Saída | ⚠️ | ⚠️ | Faixa do Live e VOD escondido não têm focável — desvio **pré-existente** (D-010 da 003/011), RETURN sempre sai; ver Complexity Tracking. Todo nível com linha tem exatamente um foco ativável (mocks e limites respondem a SELECT). |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Após ↑/↓, a lista reflete o último canal assistido (FR-014, D-008). Detalhe de série já restaura. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Troca de episódio usa o mesmo `progressRecorder` por `stableIdOf`; vizinhança por id. |
| Progresso e Capacidades São Reais, Nunca Prometidos | ✅ | ✅ | Controles reais só com capacidade (D-003); timeline só com duração; Velocidade ausente no Live (FR-022). |
| Documentação do Repositório É Canônica | ✅ | ✅ | Polish atualiza CLAUDE.md, backlog, migração; spec corrigida no plan (FR-002). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/027-player-chrome-ds-v14/
├── spec.md
├── plan.md
├── logic/chrome-player.md      # níveis, ordem/rótulos, teclas, vizinhanças
├── quickstart.md               # inclui o gate da TV física
├── tasks.md
├── contract-tests.lock
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/
├── e2e/                                   # scripts Playwright (+ player-chrome.mjs novo)
├── src/
│   ├── App.tsx                            # registerMediaKeys() junto de registerFavoriteColorKey()
│   ├── main.tsx                           # import './styles/player.css'
│   ├── components/
│   │   ├── PlayerLayer.tsx                # níveis do chrome, teclas de mídia, toast próprio
│   │   ├── PlayerLayer.player-chrome.contract.test.tsx   # TRAVADO (5)
│   │   ├── PlayerLayer.ciclo-vida-player.contract.test.tsx # TRAVADO pela 020 — não pode quebrar
│   │   ├── PlayerLayer.test.tsx           # ajustado onde o comportamento mudou de propósito
│   │   ├── PlayerChrome.tsx               # novo (substitui PlayerControls.tsx)
│   │   ├── playerChrome.ts                # novo — chromeControls, hasSeekBar (STUB)
│   │   ├── PlayerControls.tsx / .test.tsx # removidos (D-011)
│   │   ├── iconPaths.ts                   # +5 ícones
│   │   └── PosterArt.tsx                  # reuso (variant="logo")
│   ├── lib/
│   │   ├── tizenMediaKeys.ts              # novo (STUB)
│   │   ├── useRemoteNav.ts                # + onMediaKey opcional
│   │   ├── comingSoon.ts                  # +5 entradas
│   │   └── player/                        # inalterado (PlayerService, capabilities)
│   ├── features/
│   │   ├── live/LiveScreen.tsx            # zapSequenceRef, onChannelStep, identity
│   │   ├── series/episodeNavigation.ts    # + previousEpisode
│   │   ├── series/SeriesDetailScreen.tsx  # episodeStep, identity
│   │   ├── movies/MovieDetailScreen.tsx   # identity
│   │   └── home/HomeScreen.tsx            # identity (sem episodeStep)
│   └── styles/player.css                  # novo
```

**Structure Decision**: tudo dentro de `tv-web/` (frontend client-first,
ADR-008). `api/` e `CCPlayTv/` não mudam, exceto pelo que `npm run
build:tizen` sincroniza. O privilégio `tvinputdevice` já está em
`CCPlayTv/config.xml` (feature 013).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Faixa do Live (e VOD com chrome escondido) sem elemento focável | Reprodução em tela cheia sem nada por cima é o estado normal de assistir. Desvio já aceito na 003 (D-010) e na 011: RETURN sempre sai, e qualquer seta ou OK revela ou age. | Deixar um botão focado na faixa faria o OK acionar esse botão em vez de abrir o zapping, o que quebra a 016 e a decisão do usuário no plan (FR-034). |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base:

```powershell
cd tv-web
npx vitest run <arquivo>        # mais estreito primeiro
npm run test
npx tsc -b
npm run lint
npm run build
npm run build:tizen
npm run test:e2e                # com npm run dev no ar
```

Unitários novos (fora do contrato):

- `playerChrome.test.ts`: tabela de `chromeControls` por mídia ×
  capacidades × vizinhança.
- `tizenMediaKeys.test.ts`: registro estrito e `mediaKeyOf` por `key` e
  por `keyCode`.
- `useRemoteNav`: `onMediaKey` presente e ausente.
- `episodeNavigation.test.ts`: `previousEpisode`.
- Casos de `LiveScreen` para a vizinhança: busca, Favoritos, canal não
  reproduzível e FR-014.
- `SeriesDetailScreen`: `episodeStep`.

`PlayerLayer.test.tsx` é ajustado **só** onde o comportamento muda de
propósito (canal agora tem faixa e linha; contagem de botões no VOD
visível). Nunca editar os contratos travados da 020 e da 027.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`: `tv-web/src/components/PlayerLayer.player-chrome.contract.test.tsx`

Comando: `cd tv-web; npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| filme: chrome com título, Play/Pause focado e mocks "em breve"… | US1/AC1, US5/AC1, FR-007/FR-020/FR-021 | Fase 3 | `Unable to find an element with the text: Filme Exemplo` |
| canal: faixa "AO VIVO" com número e nome; ↓ pede o próximo canal… | US2/AC1-2-5, FR-009/FR-010/FR-013/FR-022/FR-034 | Fase 4 | `Unable to find an element with the text: AO VIVO` |
| canal: ↓ no último canal da lista avisa o limite… | US2/AC3, FR-011 | Fase 4 | `expected "vi.fn()" to be called with arguments: [ 'next' ]` |
| filme: MediaPlayPause pausa e foca Play/Pause; … MediaStop fecha como RETURN | US3/AC1-3-4, FR-024/FR-025/FR-026 | Fase 5 | `expected +0 to be 1` (pauseCount) |
| episódio: "Episódio anterior" no limite só avisa; "Próximo episódio" pede a troca | US4/AC1-3, FR-016/FR-017 | Fase 6 | `Unable to find an element with the text: Série Exemplo` |

Stubs criados pelo plan (ponto de partida do execute, não travados):

- `tv-web/src/components/PlayerLayer.tsx`: props `identity`, `onChannelStep`,
  `episodeStep` e os tipos `PlayerIdentity`/`PlayerEpisodeStep`, só no tipo
  por enquanto.
- `tv-web/src/components/playerChrome.ts`.
- `tv-web/src/lib/tizenMediaKeys.ts`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fases 1–7 (Setup → US5) | Concluídas. Contrato 5/5 verde, suíte completa 1269/1273 (só os 4 flakes-sob-paralelismo já documentados, confirmados isolados), `tsc -b`/lint/`build`/`build:tizen` limpos. |
| Fase 8 (Polish) | Concluída. E2E novo (T035), suíte E2E completa (T036), docs (T039) e a passada na TV física (T040, gate obrigatório) — todas as 54/54 tasks fechadas. |
| Gate da TV física (T040) | Confirmado pelo usuário na QN50Q60DAGXZD em 28/09/2026: teclas de mídia (Play/Pause, ⏪/⏩, Stop, CH±) funcionando em Filme/Episódio/Canal, zapping por ↑/↓ funcionando, direção ↑=anterior/↓=próximo natural (R-003). Confirmação funcional geral, sem log tecla-a-tecla de `event.key`/`keyCode`/`getSupportedKeys()` coletado por escrito. |
| `chromeControls.ts`/`PlayerChrome.tsx` | Implementados e testados (contrato + `chromeControls.test.ts` + `PlayerChrome.test.tsx`). Renomeado de `playerChrome.ts` — ver R-008. |
| `PlayerLayer.tsx` | Reescrito: `chromeMedia`/`chromeLevel`/`focusedIndex`/`seekBarFocused` agora vivem em refs (não `useState`), única fonte de verdade tanto pros handlers quanto pro render — ver R-008. `PlayerControls.tsx` removido (D-011). |
| `LiveScreen.tsx` | `zapSequenceRef`/`stepChannel`/`identity`/`onChannelStep` ligados; `playActiveChannel` captura o snapshot da vizinhança. |
| `SeriesDetailScreen.tsx` | `identity`/`episodeStep` ligados via nova `switchEpisode()` (generaliza o antigo `playNext`, reusada pelo autoplay). |
| `MovieDetailScreen.tsx`/`HomeScreen.tsx` | `identity={{title}}` passado (sem `episodeStep`, D-010). |
| Fase 9 (Convergence) | Concluída. `sdd-converge` (28/09/2026) achou 1 lacuna (C1, MEDIUM): `.planning/migracao-design-system-v14.md` ainda dizia "52/54 tasks, falta o gate da TV física" — corrigido para 54/54 com o gate confirmado (T041). 55/55 tasks fechadas. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Nomes/`keyCode` das teclas de mídia e o que `getSupportedKeys()` lista na QN50Q60DAGXZD só se provam no aparelho | Tecla não chega → atalho inerte (setas+OK continuam) | **Resolvido**: confirmado funcionando na TV física em 28/09/2026 (Play/Pause, ⏪/⏩, Stop, CH±); sem log escrito de `keyCode`/`getSupportedKeys()` exatos, só a confirmação funcional do usuário. |
| R-002 | Toast/chrome precisam aparecer sobre o plano de hardware; `Toast` vai por portal ao `AnnouncerRegion` quando existe | Aviso "Em breve"/limite invisível na TV | **Resolvido**: usuário confirmou "tudo funcionou" na TV física em 28/09/2026, sem relato de chrome/toast invisível sobre o plano AVPlay. |
| R-003 | ↑ = anterior / ↓ = próximo pode contrariar a expectativa de "CH+ = próximo" | Sensação de direção invertida | **Resolvido**: confirmado natural pelo usuário na TV física em 28/09/2026 — mantém D-009 como está. |
| R-004 | `PlayerLayer.test.tsx` tem asserções sobre o comportamento antigo (canal sem foco nenhum, contagem de botões, ordem da navegação) | Suíte vermelha por mudança intencional | **Resolvido**: casos ajustados nas Fases 3/4 (T018/T023), só onde o comportamento mudou por FR desta spec; nenhum contrato travado foi editado. `sdd-converge` confirmou a suíte verde. |
| R-005 | E2E existentes (`zapping-live-tv.mjs`, `ciclo-vida-player.mjs`, `filmes-series-ds-v14.mjs`, `live-tv-ds-v14.mjs`) podem apertar ↑/↓/← → em tela cheia esperando o comportamento antigo | Regressão falsa ou real no fluxo | **Resolvido**: todos rodados no Polish (Fase 8) e verdes, junto do novo `player-chrome.mjs` e de `npm run test:e2e`; nenhum precisou de ajuste além do já registrado. |
| R-006 | Passada na TV física é **gate obrigatório** (decisão do usuário, spec) | Feature não converge sem ela | **Resolvido**: gate cumprido em 28/09/2026, usuário testou diretamente na TV física e confirmou funcionamento (ver T040 em `tasks.md`). |
| R-007 | Episódio aberto pelo hero da Home não tem vizinhança (sem `episodeStep`) | Sem anterior/próximo nesse caminho | Aceito: o detalhe da série é o caminho completo; registrar no Polish se o usuário quiser estender. |
| R-008 | **Achado real (Fase 4)**: corrida de closure obsoleta em `PlayerLayer.tsx` — `sessionRef.current` (ref) é mutado sincronamente quando a sessão nasce (dentro de `start()`, antes de qualquer `await`), mas `chromeMedia`/`chromeLevel`/`focusedIndex`/`seekBarFocused` eram `useState`, só chegando ao closure que `useRemoteNav` usa (`handlersRef.current`) depois de um commit React. Uma tecla que chegasse nesse intervalo lia a sessão NOVA com o nível/mídia ainda no *default* ('vod'/'full'), executando a ação errada — reproduzido por 11 testes de zapping (016/018) em `LiveScreen.test.tsx`, todos com um segundo `Enter` logo após `getByRole('dialog')` (que já existe desde o primeiro render, antes de `fetchPlayback` resolver). Sintoma observado: OK abrindo o mock "tracks" em vez do zapping. | **Resolvido**: os quatro viraram refs (`chromeMediaRef`/`chromeLevelRef`/`focusedIndexRef`/`seekBarFocusedRef`), lidos tanto pelos handlers quanto pelo próprio render — mesmo padrão já usado por `sessionRef.current.state`, documentado no arquivo. Um `useState` numérico (`renderTick`) força o re-render depois de cada mutação. |
| R-009 | `chromeControls`/`PlayerChrome` inicialmente só exigiam `reportsDuration` pra timeline — mas o código antigo (`playerControlsActions`) sempre também exigiu `canSeek` (`capabilities.canSeek && hasSeekBar(...)`), e o FR-002/US1-AC5 confirma: "sem capacidade de busca... a timeline não existe". | Timeline aparecia (sem ser focável) mesmo sem `canSeek` — regressão de FR-002 | **Resolvido** (achado escrevendo T019): `PlayerChrome.tsx` e o `onDirection`/'up' de `PlayerLayer.tsx` agora exigem `capabilities.canSeek` explicitamente, não só `hasSeekBar`. Teste dedicado em `PlayerChrome.test.tsx` e `PlayerLayer.test.tsx` (T019). |
| R-010 | Renomeação de arquivo Windows-only (Fase 1): `tv-web/src/components/playerChrome.ts` (o STUB do plan) e `PlayerChrome.tsx` diferem só na primeira letra. No Windows (filesystem case-insensitive), `import { PlayerChrome } from './PlayerChrome'` (sem extensão) resolvia para `playerChrome.ts` (o resolvedor do Vite tenta `.ts` antes de `.tsx`), devolvendo `undefined` — `Element type is invalid`. | Build/testes quebravam só neste SO, nunca em CI Linux | **Resolvido**: módulo de lógica pura renomeado pra `tv-web/src/components/chromeControls.ts`. Nenhum outro arquivo do repo referenciava o nome antigo fora de comentários. |
| R-011 | **Emenda do contrato travado (feature 029, 2026-09-28)**: `029-audio-legendas-info-player` torna reais os botões "Áudio e legendas" e "Info do stream", removendo os mocks `player-tracks`/`player-info` que a linha 115 de `PlayerLayer.player-chrome.contract.test.tsx` exigia como "— em breve" | Contrato da 027 ficaria vermelho por mudança intencional de outra feature | **Resolvido**: com aprovação explícita do usuário, só aquela linha foi emendada (a lista de mocks exigidos ficou Qualidade/Velocidade/Aspecto) e a trava foi regravada pelo `sdd-plan` da 029. Nenhuma outra asserção mudou. |
| R-012 | **Emenda do contrato travado (feature 041, 2026-10-01)**: `041-player-qualidade-aspecto` remove o controle "Velocidade" (decisão do usuário) e torna reais "Qualidade" e "Aspecto"; o 1º teste de `PlayerLayer.player-chrome.contract.test.tsx` exigia os três como "— em breve" e contava 4 passos de ▶⏸ até "Velocidade" | Contrato da 027 ficaria vermelho por mudança intencional de outra feature | **Resolvido**: com aprovação explícita do usuário (emenda mínima), só o 1º teste e o comentário do cabeçalho mudaram: o motor falso (sem as APIs novas) mostra "Qualidade — indisponível"/"Aspecto — indisponível" com `aria-disabled`, "Velocidade" não existe, 4 passos de ▶⏸ chegam em "Aspecto" e OK só explica (sem painel, sem pausa/salto). Trava regravada pelo `sdd-plan` da 041. O 2º teste ("sem Velocidade" no canal) ficou como estava. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-28 | Fase 1 (Setup) | Ícones (+5), mocks "Em breve" (+5), `styles/player.css` criado e importado. Achado e corrigido: colisão de nome de arquivo Windows-only (R-010) — módulo de lógica renomeado `playerChrome.ts` → `chromeControls.ts`. | Nenhuma |
| 2026-09-28 | Fase 2 (Foundational) | `chromeControls`/`hasSeekBar`/`registerMediaKeys`/`mediaKeyOf`/`useRemoteNav.onMediaKey`/`PlayerChrome.tsx` implementados. 52 testes novos, trava da 017 intacta. | Nenhuma |
| 2026-09-28 | Fase 3 (US1) | `PlayerLayer.tsx` reescrito pro chrome V14 no VOD; `PlayerControls.tsx` removido; `identity` ligado em Movie/Home. Achado e corrigido: timeline exigia só `reportsDuration`, faltava `canSeek` (R-009). Contrato "filme:" 1/1. | Nenhuma |
| 2026-09-28 | Fase 4 (US2) | Níveis `band`/`row` do Live; `zapSequenceRef`/`stepChannel` no `LiveScreen`. Achado e corrigido: corrida de closure obsoleta nos 4 estados do chrome — viraram refs (R-008), destravando 11 testes de zapping que quebravam com o código anterior. Contrato "canal:" 2/2. | Nenhuma |
| 2026-09-28 | Fase 5 (US3) | `onMediaKey` ligado no `PlayerLayer`; 8 testes novos (idempotência, canal só revela, topLayer só Stop, tecla antes de playing). Contrato "MediaPlayPause" 1/1. | Nenhuma |
| 2026-09-28 | Fase 6 (US4) | `previousEpisode` + `switchEpisode()` (generaliza `playNext`) no `SeriesDetailScreen`. Contrato 5/5 completo. | Nenhuma |
| 2026-09-28 | Fase 7 (US5) | Revisão sem mudança de código (foco/reduzir movimento já globais); `PlayerChrome.test.tsx` fecha com 12 testes. | Nenhuma |
| 2026-09-28 | Fase 8 (Polish) | E2E novo `player-chrome.mjs` (33 verificações), suíte E2E completa + `test:e2e` verdes, docs atualizadas (T039), e o gate da TV física (T040) confirmado pelo usuário: teclas de mídia, zapping ↑/↓ e a direção ↑=anterior/↓=próximo (R-003) funcionando na QN50Q60DAGXZD. Achado fora do escopo, não corrigido aqui: scrollbars nativas visíveis e pouco aproveitamento de tela em `MoviesScreen`/`HomeScreen` (025/026) — logado em `.planning/backlog.md` pra feature 028 (Onda 7). Feature 027 fecha 54/54 tasks. | Nenhuma |
| 2026-09-28 | Fase 9 (Convergence) | `sdd-converge` comparou código × spec/plan/tasks: achou só 1 lacuna (C1, MEDIUM) — `.planning/migracao-design-system-v14.md` desatualizado (52/54 + gate pendente, deveria ser 54/54 + gate cumprido). T041 corrigiu a seção "Onda 6" daquele arquivo. Trava de contrato conferida de novo (5/5, íntegra, inalterada). | Nenhuma |

**PRÓXIMO**: Feature 027 implementada por completo (55/55 tasks, incluindo a Fase 9 de convergência). Rodar `sdd-converge` de novo para fechar como `Convergida` (a lacuna C1 já foi corrigida). Próximo item do roteiro é a Onda 7 (feature 028, limpeza/QA), que já herda o achado de scrollbars/espaço vazio desta passada.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/components/PlayerLayer.tsx` — chrome V14, níveis, teclas de mídia (refs, não state — R-008)
- `tv-web/src/components/PlayerChrome.tsx` / `chromeControls.ts` — apresentação + lógica pura do chrome
- `tv-web/src/lib/tizenMediaKeys.ts` / `tv-web/src/lib/useRemoteNav.ts` (`onMediaKey`)
- `tv-web/src/features/live/LiveScreen.tsx` (`zapSequenceRef`/`stepChannel`)
- `tv-web/src/features/series/SeriesDetailScreen.tsx` (`switchEpisode`/`episodeStepFor`)
- `tv-web/src/styles/player.css`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **Nunca nomear um módulo `.ts` e um componente `.tsx` na mesma pasta diferindo só pela caixa da primeira letra** — quebra silenciosamente no Windows (R-010), nunca em CI Linux. Se precisar de um par lógica-pura/componente, use nomes que não colidam por case (ex.: `chromeControls.ts` + `PlayerChrome.tsx`, não `playerChrome.ts` + `PlayerChrome.tsx`).
- **Estado lido dentro de um handler de `useRemoteNav`/`PlayerLayer` precisa vir de ref, não de `useState`**, sempre que ele puder mudar de valor no MESMO tick síncrono em que uma ref relacionada (`sessionRef.current`) também muda — R-008 é o caso concreto; o padrão já valia pra `sessionRef.current.state` antes desta feature, agora vale também pra `chromeMedia`/`chromeLevel`/`focusedIndex`/`seekBarFocused`.
- E2E: `executablePath` Linux fixo nos scripts existentes — no Windows, `tv-web/e2e/player-chrome.mjs` (T035) precisa do mesmo override temporário que os outros scripts já usam localmente.

## Resultado Final

<!-- Anexado pelo sdd-converge ao fechar a feature sem achados. Nunca reescreve o que já existe acima. -->

A feature entregou o chrome V14 completo para os três tipos de mídia
compartilhados pelo `PlayerLayer` (canal, filme, episódio), substituindo a
barra de controles da feature 011: identidade (título/subtítulo no VOD;
live bug + número + logo + nome no canal), timeline e ⏪▶⏸⏩ dirigidos pelo
contrato de capacidades (nunca alterando a regra "capacidade `false` →
controle ausente" da 011), botões de episódio anterior/próximo atravessando
temporada, mocks "Em breve" (Áudio, Qualidade, Velocidade só VOD, Aspecto,
Info, Guia só Live) e as 8 teclas de mídia (`MediaPlayPause`/`Play`/`Pause`/
`Stop`/`Rewind`/`FastForward`/`ChannelUp`/`ChannelDown`), registradas só
quando `getSupportedKeys()` as lista. O canal ganhou dois níveis de chrome —
faixa de identidade sem nenhum controle focável (OK abre o zapping da 016) e
linha de controles revelada por ←/→ — e ↑/↓/CH± agora trocam de canal direto
dentro da vizinhança da trilha de origem, sem voltar nas pontas.

Três achados técnicos reais surgiram durante a execução, todos documentados
em `## Riscos e Decisões` e já resolvidos: uma corrida de closure obsoleta
entre `sessionRef.current` (ref, mutado sincronamente) e o nível/mídia/foco
do chrome (que eram `useState`) — corrigida convertendo os quatro em refs
(R-008); a timeline aparecendo sem `canSeek` explícito, corrigindo uma
regressão do FR-002/US1-AC5 (R-009); e uma colisão de nome de arquivo
Windows-only entre o stub `playerChrome.ts` do plano e o novo
`PlayerChrome.tsx`, resolvida renomeando o módulo de lógica pura para
`chromeControls.ts` (R-010, decisão técnica que diverge do nome original do
plano — `components/playerChrome.ts` — registrada e sem impacto em nenhum
outro consumidor).

O gate obrigatório da TV física (SC-004) foi cumprido e confirmado pelo
usuário na QN50Q60DAGXZD em 28/09/2026 (T040): teclas de mídia, zapping por
↑/↓ e a direção ↑=anterior/↓=próximo (R-003) funcionando — sem log
tecla-a-tecla de `event.key`/`keyCode`/`getSupportedKeys()` coletado por
escrito, só a confirmação funcional do usuário (limitação já registrada em
R-001/R-002/R-003, aceita como suficiente para o gate).

A primeira passada do `sdd-converge` (28/09/2026) encontrou 1 lacuna
(C1, MEDIUM): `.planning/migracao-design-system-v14.md` ainda descrevia a
Onda 6 como "52/54 tasks, gate pendente" depois do gate já ter sido
cumprido. Corrigida via `sdd-execute` (T041, Fase 9) — sem nenhum código
tocado, trava de contrato reconferida íntegra antes e depois. Uma segunda
passada do `sdd-converge` não encontrou mais achados: 55/55 tasks, contrato
5/5 íntegro, spec/plano/backlog e a documentação de migração todos
consistentes com o código real.

Fora de escopo por decisão já registrada na spec (não construído aqui, sem
pendência): capacidade real de áudio/legenda/qualidade/velocidade/aspecto/
info do stream, EPG/"programa atual", seleção de canal por número,
timeshift/catch-up, e a Onda 7 (limpeza de `screens.css`, matriz de QA
Tizen, emenda final da ADR-007) — todas viram a feature 028.
