# Handoff — 029-audio-legendas-info-player (sdd-plan → sdd-execute)

## Contexto

- Repo `ccplayTv`, branch `feature/novo-design-system`. Frontend em `tv-web/` (React 19 + TS + Vite 8, alvo Chromium 108/Tizen 8); nada em `api/` nem em `CCPlayTv/`.
- Próximo comando: `/sdd-execute 029-audio-legendas-info-player`.
- Backlog: **Planejada**, 0/52.
- Arquivos alterados fora do diff desta feature, **pelo próprio sdd-plan** (já commitáveis):
  - `tv-web/src/components/PlayerLayer.player-chrome.contract.test.tsx` (027): emenda da linha 115, aprovada pelo usuário.
  - `sdd/specs/027-player-chrome-ds-v14/contract-tests.lock`: retravado.
  - `sdd/specs/027-player-chrome-ds-v14/plan.md`: R-011 novo.
  - `spec.md` desta feature: FR-019 ajustado + Clarifications do sdd-plan.

## O que a feature entrega

- **US1 (P1)**: "Áudio e legendas" deixa de ser mock em VOD **e Live**. O painel lista as faixas do motor, troca o áudio sem reiniciar e liga a legenda embutida, que o **app desenha**. A legenda **começa desativada**.
- **US2 (P2)**: "Info do stream" mostra só os campos do motor + "Conexão", relidos a cada 1 s. **Nunca protocolo deduzido da URL.**
- **US3 (P3)**: sincronização. **Só atrasar é real**; −500/−1000 ficam soft disabled, porque o AVPlay não adianta legenda embutida. A escolha é reaplicada **por idioma** no próximo canal (zapping/CH±) e no próximo episódio, **inclusive via autoplay/countdown**.
- Não inclui: .srt externo, aparência da legenda (item 56), preferência global (55b), qualidade/velocidade/aspecto (55b).
- Passada na TV física: **recomendada, não gate** (decisão do usuário). O **spike** na TV, porém, é a Fase 1.

## Leitura obrigatória, em ordem

1. `spec.md`: 25 FRs, edge cases e Clarifications (inclusive a sessão do sdd-plan sobre atrasos negativos e protocolo).
2. `plan.md`: D-001…D-012, R-001…R-009, Complexity Tracking (painel sem `Modal`), comandos.
3. `logic/faixas-e-legendas.md`: **o documento-chave**.
   - §1: mapeamento AVPlay/`<video>` e API da sessão.
   - §2: tabela de idiomas e rótulos.
   - §3: painel (ordem, chaves, toasts).
   - §4: continuidade.
   - §5: `SubtitleOverlay`.
   - §6: info (rótulos/formatos).
   - §7: teclado e `chromeControls`.
4. `tasks.md`: 6 fases, T001–T041.
5. `quickstart.md`: roteiro do spike (Fase 1), E2E e passada física.
6. `.planning/memory/constitution.md`: sobretudo Segredos, Foco, Capacidades Reais.

## Testes de contrato

- `tv-web/src/components/PlayerLayer.audio-legendas-info.contract.test.tsx`: 5 testes, travado.
  - US1 → Fase 3: testes 1, 2 e 3.
  - US2 → Fase 4: teste 5 (info).
  - US3 → Fase 5: teste 4 (continuidade).
- Rodar (em `tv-web/`): `npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx`. Hoje: 5/5 vermelhos por asserção.
- Integridade (raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 029-audio-legendas-info-player`.
- Travas de **outras** features que esta pode quebrar, sempre verificar:
  - `027-player-chrome-ds-v14` (`PlayerLayer.player-chrome.contract.test.tsx`, 5): **já emendado, não tocar**.
  - `020-ciclo-vida-player` (`PlayerLayer.ciclo-vida-player.contract.test.tsx`, 4).
  - `028-limpeza-qa-ds-v14` (`accessibleNames…contract`).

## Stubs criados

- `tv-web/src/lib/player/tracks.ts`: os tipos são definitivos (`MediaTrack`, `SubtitleCue`, `StreamInfo`, `TrackChoice`, `DEFAULT_TRACK_CHOICE`, `SUBTITLE_DELAYS_MS`). `normalizeLanguage`, `trackLabel` e `pickTracksForChoice` lançam `not implemented` (T004).
- `tv-web/src/lib/player/PlayerService.ts`:
  - `PlayerAdapter` ganhou os opcionais `getTracks`, `selectAudioTrack`, `selectTextTrack`, `getStreamInfo`.
  - `PlayerAdapterCallbacks` ganhou `onSubtitle`, e os tipos novos são reexportados.
  - **A sessão ainda não tem a API nova** (T005).
- `tv-web/src/components/PlayerLayer.tsx`: `initialTrackChoice`/`onTrackChoiceChange` estão só no tipo das props, **não desestruturadas** (T029).

## Armadilhas já mapeadas

- **`Modal` não funciona dentro do `PlayerLayer`**: o `PlayerLayer` registra `useRemoteNav({modal:true})` primeiro e faz `stopImmediatePropagation` na captura, então o filho nunca recebe tecla. O painel é estado do `PlayerLayer` (D-002, logic §7). Reusa as classes CSS do `Modal`, não o componente.
- **Estado do painel em ref + `rerender()`**, não `useState` (mesma corrida de closure do R-008 da 027: uma tecla chega entre a mutação de `sessionRef` e o commit).
- **O contrato fixa a ordem vertical** áudio → **Áudio-descrição (sempre presente, focável)** → "Desativadas" → legendas → sincronização. O teste 2 aperta ↓ **3 vezes** de "Português (áudio)" até "Português (legenda)".
- **Legenda desativada por padrão.** A sessão **descarta** `onSubtitle` enquanto nenhuma legenda estiver selecionada (teste 2 dispara uma linha antes de ligar). Desativar apaga a linha visível **na hora**.
- **A reaplicação precisa ser síncrona** no `publish()` da primeira entrada em `'playing'`, porque o teste 4 verifica logo depois do `act`. Sem preferência de áudio (`audioLanguage: null`), **não chamar** `selectAudioTrack` (o teste 4 espera `[]` numa montagem nova). Não chamar `onTrackChoiceChange` na reaplicação.
- **Idioma por normalização**: `por`/`pt` e `eng`/`en` são o mesmo idioma (o teste 4 muda o código entre sessões). Use a tabela explícita, não `Intl.DisplayNames`.
- **Autoplay da série desmonta o `PlayerLayer`** (`mode.kind === 'countdown'`). A continuidade depende de `trackChoiceRef` no `SeriesDetailScreen` (T032). Live não precisa (a camada fica montada no zapping).
- **Info**:
  - Rótulos e formatos exatos do logic §6: `1920 × 1080` com U+00D7, `4,0 Mbps` com vírgula.
  - "Conexão/Online" sempre presente.
  - Releitura parada ao fechar: o teste 5 conta chamadas de `getStreamInfo` depois de fechar.
  - O teste 5 usa `vi.useFakeTimers()` **antes** do render e esvazia microtasks com `act(async …)` (padrão do `PlayerLayer.test.tsx` T018).
- **Chrome**: tracks/info **mantêm a posição** na linha (o teste da 027 anda 4× → até "Velocidade"). "Indisponível" é `availability: 'unavailable'`, e o `PlayerChrome` já pinta soft disabled para qualquer valor ≠ `'real'`.
- **`PlayerLayer.test.tsx` conta "8 botões"** e rótulos "em breve". Ajuste só o que FR-001/FR-013 mudam. `e2e/player-chrome.mjs` linhas ~190/194 também precisam de ajuste. No navegador (`<video>`), Info é real (informa a resolução) e Áudio fica "— indisponível".
- **Segredos**: o spike roda no Web Inspector e **não deixa `console.log` no repo**. O `avplayAdapter` nunca repassa o erro bruto (que carrega a URL). Protocolo não vem da URL.
- **Texto de legenda vem do stream**: nunca usar `dangerouslySetInnerHTML`; remover tags.
- **E2E novo** injeta `window.webapis.avplay` falso via `page.addInitScript`, e o app passa a usar o `avplayAdapter` e a transparência do plano de hardware (R-008). Todo `e2e/*.mjs` tem `executablePath` do Chromium do sandbox Linux hardcoded; localmente no Windows é preciso override temporário (mesma nota da 016).
- Flakes conhecidos sob paralelismo: `*.favorites.test.tsx` / `LiveScreen.test.tsx`. Confirmar isolados antes de tratar como regressão. Reinicie o `npm run dev` antes do E2E (feature 022).

## Pendências do Analyze

- **A-001 (HIGH)**: SC-001 ("trocar o áudio e ligar a legenda em ≤ 6 teclas a partir do chrome visível") é inalcançável com o desenho atual. Só abrir o painel já custa 3 teclas; áudio +2 e legenda +4 = 9. Recomendação: o usuário decide antes ou durante a Fase 3. Ou emendar o SC-001 (ex.: "≤ 10 teclas", ou "sem sair do painel"), ou reordenar/atalhar o painel. Isso **exige mexer no contrato travado** (teste 2) e, portanto, aprovação explícita. **Não alterar o contrato sozinho.**
- **A-002 (MEDIUM)**: FR-009 (a troca falha → marcação fiel + toast) não tem teste de UI específico. Recomendação: incluir no T024 um caso com `selectAudioTrack` devolvendo `false`.
- **A-003 (LOW)**: o edge case "app oculto/retomado mantém faixa e legenda" não tem task explícita (vale por construção: a sessão pausada não é recriada). Recomendação: um caso no T033, ou só registrar no quickstart.

## Gate de pronto

- Contratos 029 5/5 verdes; travas íntegras para 029, 027 e 020 (e as demais do repo).
- `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen`.
- `node e2e/audio-legendas-info.mjs`, `node e2e/player-chrome.mjs` e `npm run test:e2e` com dev server recém-iniciado.
- `quickstart.md` (checagens + cenário E2E).
- Docs no Polish (T040):
  - `CLAUDE.md`
  - `.planning/backlog.md` (item 55: 55a entregue, 55b pendente)
  - `.planning/migracao-design-system-v14.md`
- Passada na TV física: **recomendada, não gate**. Registrar como pendente se não houver acesso; "não testado" nunca vira "aprovado".
