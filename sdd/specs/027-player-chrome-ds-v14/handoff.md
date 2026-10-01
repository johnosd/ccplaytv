# Handoff — 027-player-chrome-ds-v14

## Contexto

- Repositório `ccplayTv`, branch `feature/novo-design-system`. Stack:
  React 19 + TS + Vite (Tizen 8 / Chromium 108), client-first, IndexedDB via
  Dexie.
- Próximo comando: `/sdd-execute 027-player-chrome-ds-v14`.
- Backlog: **Planejada**, 0/54 (a contagem inclui o Checklist de Release).
- Durante o plan, a `spec.md` foi **corrigida**: FR-002 e US1/AC1 passam a
  descrever o comportamento real da 011 (←/→ com o chrome escondido
  **saltam** ∓10 s), e o FR-034 (dois níveis no Live) foi acrescentado.
  Releia a spec, não confie numa versão anterior.

## O que a feature entrega

- **P1 US1**: chrome V14 no filme e no episódio. As teclas da 011 ficam
  **idênticas**; a linha ganha os mocks "Em breve".
- **P1 US2**: canal em dois níveis. A **faixa** (sem botão; OK continua
  abrindo o zapping da 016) e a **linha** revelada por ←/→ (OK aciona o
  botão focado; RETURN volta à faixa). ↑/↓ trocam de canal direto, mesmo
  com o chrome escondido, sem volta nas pontas.
- **P2 US3**: teclas de mídia (Play/Pause, Play, Pause, Stop, ⏪, ⏩, CH±),
  registradas só se `getSupportedKeys()` as listar.
- **P2 US4**: "Episódio anterior" e "Próximo episódio", soft disabled no
  limite, atravessando temporadas.
- **P3 US5**: mocks "Em breve": Áudio e legendas, Qualidade, Aspecto e Info
  nos dois; Velocidade só no VOD; Guia só no Live.
- Decisões do usuário:
  - A Onda 7 (limpeza/QA) é a feature **028**. **Não mexer no
    `features/screens.css`**.
  - Nenhuma linha de "programa atual" é exibida.
  - Stop fecha como RETURN.
  - A **passada na TV física é gate obrigatório**.

## Leitura obrigatória, em ordem

1. `spec.md`: 34 FRs, 5 SCs e 11 clarificações.
2. `plan.md`: D-001 a D-016, Complexity Tracking (faixa sem focável) e
   R-001 a R-007.
3. `logic/chrome-player.md`: **a fonte do "como"**. Ordem e rótulos da
   linha (§2), níveis (§3), auto-hide (§4), tabela de teclas (§5), textos de
   aviso (§6), pseudocódigo da vizinhança de canal (§7) e de episódio (§8).
4. `tasks.md`: T001–T040 em 8 fases.
5. `quickstart.md`: roteiro do navegador e da TV física (gate).
6. `.planning/memory/constitution.md`.

## Testes de contrato

- `tv-web/src/components/PlayerLayer.player-chrome.contract.test.tsx`: 5
  testes. Fase 3 (1), Fase 4 (2), Fase 5 (1), Fase 6 (1).
- Rodar: `cd tv-web; npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx`.
  Hoje dá 5/5 vermelhos por asserção.
- Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 027-player-chrome-ds-v14`.
- Travas de **outras** features que esta pode quebrar:
  - `020-ciclo-vida-player`: `PlayerLayer.ciclo-vida-player.contract.test.tsx`.
    O canal oculto fecha a sessão; o filme pausa.
  - `024-live-tv-ds-v14`: `LiveScreen.live-tv-ds-v14.contract.test.tsx`.
  - `017`/`018`: contratos de busca do `LiveScreen`.
  - Rode as quatro travas no fim de cada fase que tocar `PlayerLayer` ou
    `LiveScreen`.

## Stubs criados

- `tv-web/src/components/PlayerLayer.tsx`: props opcionais `identity`,
  `onChannelStep` e `episodeStep`, mais os tipos `PlayerIdentity` e
  `PlayerEpisodeStep`. **Só no tipo**: ainda não são desestruturados nem
  usados.
- `tv-web/src/components/playerChrome.ts`: tipos `ChromeControl*` e
  `chromeControls(media, capabilities, paused, episode)`, que hoje lança
  `not implemented`. `hasSeekBar` deve ser movido para cá (T004).
- `tv-web/src/lib/tizenMediaKeys.ts`: `MEDIA_KEYS` e `MEDIA_KEY_CODES`
  definitivos; `registerMediaKeys`/`mediaKeyOf` lançam `not implemented`.

## Armadilhas já mapeadas

- **Rótulos são contrato.** O teste busca por nome acessível exato:
  `Pausar`/`Reproduzir`, `Velocidade — em breve`, `Guia — em breve`,
  `Próximo episódio`, e `/Episódio anterior/` com `.is-soft-disabled` no
  limite. Siga a tabela de `logic` §2 ao pé da letra, com travessão `—`.
- **Ordem da linha é contrato.** VOD: `episodePrevious, jumpBack, playPause,
  jumpForward, episodeNext, tracks, quality, speed, aspect, info`. Live:
  `guide, tracks, quality, aspect, info`. O foco inicial do VOD é
  `playPause`; o da linha do Live é o índice 0.
- **Faixa do Live = zero `<button>`** (`queryAllByRole('button')` = 0). O
  logo é `PosterArt`, que não pode renderizar botão.
- **Toast dentro do `.player-overlay`** (`useToast` do próprio
  `PlayerLayer`). No jsdom não há `AnnouncerRegion`, então o `Toast`
  renderiza inline e `getByText` acha. Não use o toast da tela por baixo,
  que pode estar oculto pela regra de plano de hardware (R-002).
- **`scheduleHide` hoje sai cedo quando não há ações** (canal). Essa saída
  precisa sumir para a faixa esconder (D-015). A regra "pausado não
  esconde" continua.
- **`useRemoteNav` é compartilhado por todas as telas.** `onMediaKey` é
  opcional e, sem ele, a tecla **não** pode receber `preventDefault` (D-007).
  O arquivo de contrato da 017 (`useRemoteNav.busca.contract.test.tsx`) é
  travado; os testes novos vão em `useRemoteNav.test.tsx`.
- **O salto por tecla segurada não pode acumular**: use a porta
  single-flight do `PlayerService` (R-019 da 011, que já congelou o app uma
  vez).
- **Registro de teclas estrito** (D-006): diferente de `tizenColorKey.ts`,
  lista vazia ou ausente **não** registra.
- **CSS novo só em `styles/player.css`**, importado depois de
  `features/screens.css` em `main.tsx`. As regras do plano de hardware
  (`screens.css` ~L420–L448) ficam onde estão. Só tokens, nada literal.
- **Nenhum arquivo novo emitido pelo build.** O CSS entra no bundle, então
  `tizen_web_project.yaml` não muda. Se `build:tizen` reclamar, algo saiu
  errado.
- **Flakes conhecidos** sob paralelismo: `LiveScreen.favorites.test.tsx`,
  `LiveScreen.test.tsx` (T010) e `SeriesScreen.favorites.test.tsx`
  falharam na suíte da área e passaram isolados durante o plan. Confirme
  isolado antes de tratar como regressão.
- **E2E**: `executablePath` Linux está fixo nos scripts; no Windows, faça
  override temporário. Reinicie o `npm run dev` antes (dev server antigo
  deixa a sequência instável).
- **Canal no `LiveScreen`**: o `openZapping` troca `entered` para a
  categoria do `original_group`. Por isso a sequência de ↑/↓ é um
  **snapshot** (`zapSequenceRef`) da lista exibida quando o canal começou,
  nunca o `items` corrente (D-008).
- **Episódio aberto pelo hero da Home** não tem `episodeStep`, então fica
  sem botões de episódio (R-007; ver pendência A2).

## Pendências do Analyze

- **A1 (MEDIUM)**: a troca rápida por ↑/↓ (FR-012) não tem teste unitário
  dedicado; depende do descarte de sessão da 016. Cobrir no E2E
  `player-chrome.mjs` (5× ↓ → termina no último pedido) e na TV.
- **A2 (MEDIUM)**: o FR-016 diz "o chrome do episódio DEVE oferecer…", mas
  o episódio aberto pelo hero da Home fica sem botões (D-010/R-007).
  Perguntar ao usuário: restringir o FR-016 ao player aberto pelo detalhe
  da série, ou dar vizinhança ao hero (ler episódios no Dexie, sem rede).
- **A3 (MEDIUM)**: o FR-026 diz que Stop é "exatamente como RETURN", mas o
  D-007 faz Stop fechar o player **inteiro** mesmo com o zapping aberto ou
  a linha do Live visível (onde RETURN fecha só a camada). Confirmar com o
  usuário. A recomendação é manter "Stop fecha o player" e ajustar o texto
  do FR-026.
- **A4 (LOW)**: o FR-031 (reduzir movimento) só tem verificação manual
  (quickstart, cenário 5).

## Gate de pronto

- Contrato 5/5 verde, e as travas da 027, 020, 024, 017 e 018 íntegras e
  verdes.
- `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` e
  `npm run build:tizen` limpos.
- E2E: `tv-web/e2e/player-chrome.mjs` (novo) e todos os scripts
  existentes, mais `npm run test:e2e`.
- `quickstart.md` executado no navegador.
- Docs no Polish: CLAUDE.md, `.planning/backlog.md` (M7) e
  `.planning/migracao-design-system-v14.md`.
- **Passada na TV física obrigatória** (T040, SC-004, skill `tizen-tv`).
  Fechar sem ela só com decisão explícita do usuário registrada em
  `Riscos e Decisões`.
