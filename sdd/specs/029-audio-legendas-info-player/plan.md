# Implementation Plan: Player — Trilhas de Áudio, Legendas e Info do Stream

**Slug**: `029-audio-legendas-info-player` | **Date**: 2026-09-28 | **Spec**: `sdd/specs/029-audio-legendas-info-player/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Dois botões do chrome V14 (feature 027) deixam de ser mock, tanto no VOD
quanto no Live:

- **"Áudio e legendas"** abre um painel com as faixas que o motor informa.
  Permite trocar o áudio e ligar/desligar a legenda embutida, que o próprio
  app desenha sobre o vídeo com estilo fixo. Tem ainda a sincronização da
  legenda (só atrasar é real; adiantar fica soft disabled) e a entrada de
  áudio-descrição (soft disabled, salvo se o motor marcar uma faixa).
- **"Info do stream"** abre um painel com os dados técnicos que o motor
  informa, mais o estado online/offline, relidos a cada 1 s.

A escolha de áudio, legenda e atraso vale para a sessão e é reaplicada **por
idioma** no próximo item da sequência: zapping/CH± no Live, e próximo
episódio (inclusive via autoplay) na série.

Abordagem:

- O contrato de motor ganha métodos **opcionais** (`getTracks`,
  `selectAudioTrack`, `selectTextTrack`, `getStreamInfo`, callback
  `onSubtitle`). Método ausente significa capacidade ausente, e o botão fica
  "— indisponível". É o mesmo espírito do contrato de capacidades da 011.
- A sessão expõe isso sem passar pelo `emit()` de estado.
- O `PlayerLayer` ganha um **painel interno** (estado próprio, roteado como o
  `topLayer` da 016), porque um `Modal` filho nunca receberia tecla (D-002).
- A lógica pura (rótulos, escolha por idioma, formatos) fica em
  `lib/player/tracks.ts` e `components/playerPanels.ts`. Os painéis e a
  legenda são componentes de apresentação.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict), React 19, Vite 8 (`build.target: 'chrome108'`)

**Primary Dependencies**:
- `PlayerService`/adaptadores e o contrato de capacidades (011, `lib/player/`)
- chrome V14: `chromeControls.ts`, `PlayerChrome.tsx`, `PlayerLayer.tsx` (027)
- `useRemoteNav` (ADR-009)
- `useToast` + `Toast` (021)
- `useOnlineStatus` (`lib/onlineStatus.ts`, 022)
- registro `lib/comingSoon.ts` (022)
- estilo de `Modal` via as classes `.modal-overlay`/`.modal-panel` (022)
- `episodeNavigation`/countdown do `SeriesDetailScreen` (012/027)

**Storage**: nenhum. A escolha de faixas vive em memória (ref), sem Dexie, sem `localStorage` e sem estado do usuário.

**Testing**: Vitest + Testing Library + jsdom (`src/setupTests.ts`); Playwright E2E (`tv-web/e2e/*.mjs`) contra `npm run dev`, com um `webapis.avplay` **falso** injetado por `page.addInitScript` para exercitar o caminho real do `avplayAdapter` no Chromium.

**Target Platform**: Samsung Tizen 8.0 / Chromium 108 (QN50Q60DAGXZD), AVPlay no plano de hardware, palco 1920×1080.

**Performance Goals**:
- Linha de legenda aparece no mesmo tick do callback (atraso 0) ou em `delay` ms (±100 ms, SC-003).
- A legenda não re-renderiza o `PlayerLayer` inteiro: há uma assinatura própria.
- A releitura de 1 s só acontece com um painel aberto.

**Constraints**:
- Só o que o motor informa (FR-005/FR-014), e nada derivado da URL (constitution, "Segredos"). O motor é singleton.
- Setas+OK+RETURN alcançam tudo; RETURN fecha o painel antes do player.
- Só tokens V14. Nenhum arquivo novo emitido pelo build.
- API AVPlay confirmada só pela referência oficial até o spike (R-001).

**Scale/Scope**: poucas faixas por stream (tipicamente 1–6); um player por vez.

## Decisões Invariantes

- **D-001 — Capacidade por presença de método.** Os métodos novos de
  `PlayerAdapter` são opcionais. Ausente = capacidade ausente = botão
  `'unavailable'` ("— indisponível", soft disabled, SELECT explica). Presente
  mas devolvendo `null`/`false` em runtime = falha pontual (toast), nunca
  modal vazio. Nenhum desses métodos lança para fora do adaptador
  (`logic §1`).
- **D-002 — Painel interno do `PlayerLayer`, sem `Modal`.** O `PlayerLayer`
  registra `useRemoteNav({modal:true})` antes de qualquer filho e para a
  propagação na captura, então um `Modal` filho nunca recebe tecla. O painel
  é estado do `PlayerLayer` (ref + `rerender()`, mesmo padrão e motivo de
  `chromeLevelRef`, R-008 da 027), roteado com prioridade `topLayer` →
  painel → erro → chrome. Os painéis ficam dentro do `.player-overlay`, com
  as classes visuais do `Modal` (`logic §3/§7`).
- **D-003 — Ordem e rótulos fixados** por `logic §2/§3/§6/§7.1`, dos quais o
  contrato depende: painel com lista vertical única áudio → áudio-descrição
  → legendas → sincronização; nomes de grupos; formatos de info.
- **D-004 — Legenda desenhada pelo app, estilo fixo.** `SubtitleOverlay`
  mostra texto puro (tags removidas, nunca `innerHTML`), com tokens V14, e
  sobe quando o chrome está visível. Não aparece sob o zapping nem na tela
  de erro. `type`/`attributes` do `onsubtitlechange` são ignorados; a
  aparência configurável é o item 56.
- **D-005 — Legenda começa desativada.** O adaptador AVPlay chama
  `setSilentSubtitle(true)` ao abrir. Sem idioma escolhido, o "padrão do
  stream" para legenda é desativada. A sessão descarta linhas do motor
  enquanto nenhuma legenda estiver selecionada.
- **D-006 — Sincronização só para trás.** `+500`/`+1000` são aplicados pelo
  app. `-500`/`-1000` ficam soft disabled com explicação, porque
  `setSubtitlePosition` vale só para legenda externa e o app recebe a linha
  no instante de exibir (spec ajustada, Clarifications do sdd-plan). Sem
  legenda ativa, todos ficam soft disabled (FR-020).
- **D-007 — Info só do motor.** No AVPlay: resolução, codec e taxa de bits
  (`CURRENT_BANDWIDTH`, ou `Bit_rate`); no `<video>`: só resolução. FPS,
  buffer e protocolo ficam ausentes nesses dois motores. Protocolo nunca é
  deduzido da URL. "Conexão" (`useOnlineStatus`) sempre aparece.
- **D-008 — Continuidade por idioma, em memória.**
  - `choiceRef` é semeado de `initialTrackChoice` só na montagem.
  - A reaplicação é **síncrona** na primeira entrada em `'playing'` de cada
    sessão, sem `onTrackChoiceChange`.
  - Live não precisa de nada: a camada fica montada.
  - A série guarda `trackChoiceRef`: zera ao sair ou cancelar o countdown, e
    mantém no autoplay (`logic §4`).
  - Filme e Home: montagem nova, escolha zerada (FR-023).
- **D-009 — Releitura de 1 s só com painel aberto**, pulada com a página
  oculta e cancelada ao fechar. Relê faixas (FR-012) e info (FR-016).
- **D-010 — Chrome.** `chromeControls` ganha o 5º parâmetro opcional
  `features` e a disponibilidade `'unavailable'`. A posição dos botões na
  linha não muda. Entradas `player-tracks`/`player-info` saem de
  `comingSoon.ts`. `PlayerChrome.tsx` não muda.
- **D-011 — Emenda aprovada no contrato da 027.** Só a linha 115 de
  `PlayerLayer.player-chrome.contract.test.tsx` (mocks exigidos agora são
  Qualidade/Velocidade/Aspecto) foi emendada, e a trava foi regravada **por
  este sdd-plan**. Está registrada como R-011 no `plan.md` da 027. O
  executor não mexe mais nesse arquivo.
- **D-012 — Sem dependência npm nova, sem migração Dexie, sem arquivo novo
  emitido pelo build.** O CSS novo vai em `styles/player.css`; um token
  novo, se preciso (`--subtitle-bg`), vai em `index.css`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Nada exige conta. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Info só com campos do motor; protocolo nunca vem da URL (D-007); o texto da legenda é renderizado como texto puro. O contrato 5 verifica que nenhuma URL ou credencial aparece no DOM. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Não toca catálogo. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Idioma nunca adivinhado pelo nome; sem idioma o rótulo é "Faixa N"; áudio-descrição só com a marca do motor; campo de info ausente não aparece (D-001/D-007). |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Trocar faixa e atraso são chamadas locais ao motor, sem rede. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | Não se aplica; trocar faixa não mexe em progresso (contrato 1: sem salto, pausa ou fechamento). |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | ↑/↓/OK no painel; RETURN fecha primeiro o painel, depois o player (D-002). |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto | ✅ | ✅ | Protocolo não é deduzido pela extensão da URL (D-007). |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | O painel sempre tem uma linha focável (no mínimo "Desativadas"); o info tem "Fechar"; soft disabled explica no SELECT. Ao fechar, o foco volta ao botão de origem. Não cria nenhum desvio novo; o desvio pré-existente do chrome oculto (027) não muda. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Painel → botão de origem por índice guardado. Dentro do painel, o foco é reconciliado pela chave da linha, não pelo índice (`logic §3`). |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | A escolha é por idioma e não persiste; ids de faixa valem só na sessão. |
| Progresso e Capacidades São Reais, Nunca Prometidos | ⚠️ | ✅ | No pré-design, o FR-019 prometia adiantar a legenda sem motor capaz. Resolvido por D-006: os negativos ficam soft disabled e a spec foi ajustada. O botão de faixas só é real com a API do motor (D-001). |
| Documentação do Repositório É Canônica | ✅ | ✅ | O Polish atualiza `CLAUDE.md`, o backlog (item 55 → 55b pendente), `migracao-design-system-v14.md` (matriz de mocks) e o R-011 da 027 (já feito). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/029-audio-legendas-info-player/
├── spec.md                     # sdd-specify (+ Clarifications do sdd-plan)
├── plan.md                     # este arquivo
├── logic/faixas-e-legendas.md  # contrato motor→sessão, rótulos, painéis, continuidade, legenda, teclado
├── quickstart.md               # verificação manual + roteiro do spike na TV
├── tasks.md
├── contract-tests.lock
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── lib/
│   │   ├── player/
│   │   │   ├── tracks.ts                 # NOVO (stub): tipos + normalizeLanguage/trackLabel/pickTracksForChoice
│   │   │   ├── tracks.test.ts            # NOVO
│   │   │   ├── PlayerService.ts          # métodos opcionais do adaptador (stub feito) + API da sessão
│   │   │   ├── PlayerService.test.ts
│   │   │   ├── avplayAdapter.ts          # getTotalTrackInfo/setSelectTrack/setSilentSubtitle/onsubtitlechange/getCurrentStreamInfo
│   │   │   ├── avplayAdapter.test.ts
│   │   │   ├── htmlVideoAdapter.ts       # só getStreamInfo (videoWidth/Height)
│   │   │   └── htmlVideoAdapter.test.ts
│   │   ├── comingSoon.ts / .test.ts      # remove player-tracks/player-info
│   │   └── onlineStatus.ts               # reuso (useOnlineStatus)
│   ├── components/
│   │   ├── chromeControls.ts / .test.ts  # features + 'unavailable'
│   │   ├── playerPanels.ts / .test.ts    # NOVO: linhas do painel de faixas, movimento de foco, linhas de info
│   │   ├── PlayerTracksPanel.tsx         # NOVO (apresentação)
│   │   ├── PlayerInfoPanel.tsx           # NOVO (apresentação)
│   │   ├── SubtitleOverlay.tsx / .test.tsx # NOVO
│   │   ├── PlayerLayer.tsx               # props initialTrackChoice/onTrackChoiceChange (stub feito) + painel + roteamento
│   │   ├── PlayerLayer.test.tsx          # ajustes de contagem de botões/rótulos
│   │   ├── PlayerLayer.audio-legendas-info.contract.test.tsx   # CONTRATO 029 (travado)
│   │   └── PlayerLayer.player-chrome.contract.test.tsx         # CONTRATO 027 (emendado + retravado pelo plan; não tocar)
│   ├── features/series/SeriesDetailScreen.tsx  # trackChoiceRef (logic §4)
│   ├── styles/player.css                 # .player-subtitle, painéis
│   └── index.css                         # token --subtitle-bg (se preciso)
└── e2e/
    ├── audio-legendas-info.mjs           # NOVO (webapis.avplay falso via addInitScript)
    └── player-chrome.mjs                 # rótulos de Áudio/Info atualizados
```

**Structure Decision**: frontend único em `tv-web/` (React/Vite), como todas
as features client-first desde a 005. Nada em `api/` (congelado, ADR-008)
nem em `CCPlayTv/` (sem arquivo emitido novo). A lógica pura fica em
`lib/player/tracks.ts` (camada de player, sem UI, respeitando a direção
catalog→player do item 49) e em `components/playerPanels.ts` (modelo da UI),
para o `PlayerLayer.tsx` (já com ~850 linhas, candidato do item 49) ganhar só
roteamento e estado.

## Complexity Tracking

> Nenhuma violação da constitution. Um desvio de padrão de projeto fica registrado aqui por transparência:

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Painel com visual de `Modal` mas sem o componente `Modal` (D-002) | O `PlayerLayer` intercepta todo teclado na captura (`modal:true`) antes de qualquer filho, e o `Modal` só funciona como o primeiro interceptador | Usar `Modal`: nunca recebe tecla. Tirar `modal:true` do `PlayerLayer`: reabre as corridas de tecla contra a tela de baixo que a 003/016/027 fecharam. Pilha genérica de modais no `useRemoteNav`: mudança transversal em ADR-009 sem ganho fora daqui. |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

- **Unitário**:
  - `tracks.ts`: normalização, rótulos, duplicados, escolha por idioma.
  - `playerPanels.ts`: linhas, disponibilidade, movimento de foco, formatos
    de info.
  - Adaptadores: mapeamento de `extra_info`, falhas → `null`/`false`, legenda
    desativada ao abrir.
  - Sessão: descarte de linhas com legenda desativada, `active` de texto,
    no-op após `close`.
  - `SubtitleOverlay`: atraso, duração, pausa, texto vazio, tags removidas.
  - `chromeControls`: `features`/`'unavailable'`.
- **Contrato**: 5 casos, travados (abaixo).
- **E2E**: `e2e/audio-legendas-info.mjs` injeta `window.webapis.avplay` falso
  (faixas, `onsubtitlechange`, `getCurrentStreamInfo`), cobrindo painel,
  legenda na tela, info, continuidade no zapping e sincronização.
  `player-chrome.mjs` é atualizado. `npm run test:e2e` completo.
- **Manual/TV**: spike (Fase 1) e passada recomendada (SC-006, **não gate**),
  pelo `quickstart.md`.

Comandos-base (em `tv-web/`):

```powershell
npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx
npx vitest run src/lib/player src/components src/lib/comingSoon.test.ts
npx tsc -b
npm run lint
npm run test
npm run build
npm run build:tizen
# com `npm run dev` rodando em outro terminal:
node e2e/audio-legendas-info.mjs
node e2e/player-chrome.mjs
npm run test:e2e
```

Integridade das travas (raiz do repo):

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 029-audio-legendas-info-player
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 027-player-chrome-ds-v14
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 020-ciclo-vida-player
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`: `tv-web/src/components/PlayerLayer.audio-legendas-info.contract.test.tsx` (5 testes)

Comando: `npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx` (em `tv-web/`)

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| filme: "Áudio e legendas" abre o painel com a faixa ativa marcada e focada; trocar o áudio não reinicia nada; RETURN volta ao botão | US1/AC1-2-5, FR-001/003/006/010 | Fase 3 | `Unable to find … role "button" and name "Áudio e legendas"` |
| filme: legenda começa desativada; escolher a faixa embutida exibe a linha do motor e "Desativadas" a apaga | US1/AC3, FR-004/007, D-005 | Fase 3 | `Unable to find … role "dialog" and name "Áudio e legendas"` |
| sem API de faixas o botão é soft disabled e só explica; no canal com uma faixa só o painel diz "Nenhuma legenda neste conteúdo" | FR-002/004/001 (Live); Constitution: Foco Visível | Fase 3 | `Unable to find … name "Áudio e legendas — indisponível"` |
| escolha de áudio atravessa a troca de item por idioma, não vaza para uma montagem nova e volta via initialTrackChoice | FR-021/022/023, D-008 | Fase 5 | `expected "vi.fn()" to be called at least once` |
| info: só os campos que o motor informou, relidos a cada ~1 s enquanto aberto, sem URL nem credencial; "Fechar" para a releitura e volta ao botão | US2, FR-013–018; Constitution: Segredos | Fase 4 | `Unable to find … name "Info do stream"` |

Vermelho confirmado em 2026-09-28: 5/5 falham por asserção. Nenhuma falha
é de import, sintaxe ou tipo; `tsc -b` limpo com os stubs. A suíte de
`src/components`, `src/lib/player` e `comingSoon` roda com 304 verdes.

Stubs criados pelo plan (ponto de partida do execute, não travados):
- `tv-web/src/lib/player/tracks.ts`: tipos reais; `normalizeLanguage`,
  `trackLabel` e `pickTracksForChoice` lançam `not implemented`.
- `tv-web/src/lib/player/PlayerService.ts`: métodos opcionais em
  `PlayerAdapter`, `onSubtitle` em `PlayerAdapterCallbacks`, reexport dos
  tipos. A sessão ainda não tem a API nova.
- `tv-web/src/components/PlayerLayer.tsx`: props `initialTrackChoice` e
  `onTrackChoiceChange` declaradas no tipo, ainda não desestruturadas nem
  usadas.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Código | **Completo** (Fases 2–6). US1 (painel de faixas + legenda desenhada pelo app), US2 (info do stream) e US3 (atraso +500/+1000 e continuidade por idioma, inclusive autoplay da série) implementadas. |
| Contratos 029 | **5/5 verdes**; as 13 travas de contrato do repositório íntegras (a da 027 foi emendada com aprovação, R-011 daquele plan). |
| Testes | `tsc`/lint/`build`/`build:tizen` limpos. `npm run test` 1433/1437 (4 falhas do padrão instável já documentado, 106/106 isoladas). Novos: `tracks`, `PlayerService.tracks`, `avplayAdapter.tracks`, `htmlVideoAdapter.streamInfo`, `playerPanels`, `SubtitleOverlay`, `PlayerLayer.faixas/info/continuidade`, +4 em `SeriesDetailScreen`. |
| E2E | `audio-legendas-info.mjs` (39 verificações, AVPlay **falso**) e `player-chrome.mjs` verdes; `npm run test:e2e` completo (12 roteiros) verde. |
| Spike do AVPlay (Fase 1) | **NÃO executado** — T001/T002 adiadas (sem TV). R-001…R-004 "não testado". O formato real (`getTotalTrackInfo`/`extra_info`, `setSelectTrack` pausado, `onsubtitlechange`, unidade de `CURRENT_BANDWIDTH`) segue só na referência da Samsung. |
| Passada na TV física (SC-006) | **Pendente** — recomendada, não gate (decisão do usuário na spec). Nada foi visto na TV, nem a legenda sobre o plano de hardware. |
| Spec | SC-001 emendado para ≤ 10 teclas (A-001, decisão do usuário). FR-019/FR-020 ajustados (adiantar legenda embutida soft disabled, D-006). |
| Pendências abertas | `paridade-limpeza.mjs` não re-executado (sobrescreveria a evidência da 028, R-007); A-002/A-003 do Analyze cobertos por testes (FR-009 em `PlayerLayer.faixas.test.tsx`; app oculto/retomado vale pela sessão pausada não ser recriada — sem teste próprio). |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | **Não testado (spike adiado por decisão do usuário, 2026-09-28)** — Superfície de faixas/legenda/info do AVPlay confirmada só pela referência oficial (`getTotalTrackInfo`, formato de `extra_info`, `setSelectTrack` em PLAYING/PAUSED, `setSilentSubtitle`, `onsubtitlechange`, `getCurrentStreamInfo`, `CURRENT_BANDWIDTH`) | Mapeamento errado → faixas sem idioma, troca inerte, legenda que nunca chega | **Fase 1 = spike na TV** (roteiro no `quickstart.md` §Spike). Resultado registrado aqui antes da Fase 2; divergência ajusta só `avplayAdapter.ts` e `logic §1.2`, nunca o contrato (que usa motor falso). Sem acesso à TV: seguir pela referência e deixar este risco aberto (a passada física é recomendada, não gate). |
| R-002 | **Não testado** — `setSelectTrack('AUDIO')` não é permitido em PAUSED pela referência | Trocar áudio pausado falha | Coberto por FR-009 (toast + marcação fiel ao motor). Confirmar no spike; se falhar sempre pausado, avaliar deixar o áudio soft disabled enquanto pausado (emenda de `logic §3`). |
| R-003 | **Não testado** — Adiantar legenda embutida é impossível pela referência (`setSubtitlePosition` só externa) | Os −500/−1000 do §27.4 ficam soft disabled | Decidido (D-006), spec ajustada. Se o spike mostrar `setSubtitlePosition` funcionando com legenda embutida, vira seleção real numa emenda. |
| R-004 | **Não testado** — Legenda em bitmap (`subtitle_type` de imagem) chega sem texto | Faixa listada que nunca mostra nada | Anotar no spike o `subtitle_type` das faixas reais; fora de escopo exibir bitmap (spec, Assumptions). |
| R-005 | `PlayerLayer.tsx` cresce além de ~850 linhas (item 49) | Manutenção | Lógica pura em `playerPanels.ts`/`tracks.ts`, apresentação em componentes próprios; o `PlayerLayer` só roteia. **Desfecho (sdd-execute):** OCORREU em parte. A lógica pura ficou em `tracks.ts`/`playerPanels.ts` e a apresentação em componentes próprios, mas o `PlayerLayer.tsx` cresceu de 784 para 1040 linhas (estado do painel, handlers de teclas, reaplicação). Candidato claro ao item 49: extrair um hook (ex.: `usePlayerPanels`) — não feito aqui para não ampliar o escopo nem mexer nos contratos travados. |
| R-006 | Testes existentes contam botões/rótulos da linha (`PlayerLayer.test.tsx` "8 botões", `chromeControls.test.ts`, `comingSoon.test.ts`, `e2e/player-chrome.mjs` linhas 190/194) | Suíte vermelha por mudança intencional | Ajustar só o que FR-001/FR-013 mudam (rótulos "em breve" → reais ou "indisponível"). Contratos travados de outras features não são editados; o da 027 já foi emendado (D-011). Resolvido: `PlayerLayer.test.tsx` não precisou mudar (contagem de 8 botões e rótulos existentes intactos); ajustados só `chromeControls.test.ts`, `comingSoon.test.ts` e `e2e/player-chrome.mjs`. Contratos travados de outras features não foram editados; o da 027 já estava emendado (D-011). |
| R-007 | `e2e/paridade-limpeza.mjs` (028) compara screenshots; se capturar o chrome do player, o rótulo curto não muda, mas o soft disabled de "Áudio" no navegador muda a aparência | Falso diff visual | Rodar no Polish; um diff restrito ao botão Áudio/Info é esperado e deve ser registrado, não "corrigido". **Não verificado:** `paridade-limpeza.mjs` NÃO foi re-executado — o modo `depois` sobrescreveria a evidência arquivada da 028. O diff esperado (botões Áudio/Info do chrome VOD em `18-player-vod`) fica registrado, não comprovado. |
| R-008 | E2E com `webapis.avplay` falso faz o app escolher o `avplayAdapter` e aplicar a transparência do plano de hardware | Screenshot/visibilidade diferentes do dev normal | Esperado: é o caminho da TV. O script não depende de vídeo visível, só de DOM. Resolvido: confirmado — o E2E com AVPlay falso passa pelo `avplayAdapter` de verdade e só depende de DOM (39 verificações, suíte completa verde). O `<video>` de desenvolvimento segue exercitado por `player-chrome.mjs`. |
| R-009 | A passada na TV física é **recomendada, não gate** (decisão do usuário na spec), embora o spike dependa dela | Feature pode convergir sem prova no motor real | Registrar honestamente como pendente no `Estado Atual`/SC-006; "não testado" nunca vira "aprovado". **Em aberto (registrado):** nada foi visto na TV. A feature converge com R-001…R-004 "não testado" e SC-006 pendente; a passada física é o próximo passo recomendado. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-28 | Fase 1 (spike) | Pulada por decisão do usuário (sem TV); R-001…R-004 marcados "não testado"; SC-001 emendado para ≤ 10 teclas (A-001). | Spike vira a passada física (T041/SC-006). |
| 2026-09-28 | Fase 2 (fundação) | T004–T016: `tracks.ts`, API da sessão, adaptadores AVPlay/`<video>`, `chromeControls` com `features`, mocks removidos, `playerPanels.ts` + 5 arquivos de teste. 160/160 verdes. | Fase 3: UI (painel, legenda) e roteamento no `PlayerLayer`. |

| 2026-09-28 | Fase 3 (US1) | T017–T025: `PlayerTracksPanel`, `SubtitleOverlay`, CSS + `--subtitle-bg`, painel interno no `PlayerLayer` (`panelRef`, roteamento, releitura 1 s). Contratos 1–3 verdes; 4 falhas instáveis conhecidas confirmadas isoladas. | Fase 4 (info). |
| 2026-09-28 | Fase 4 (US2) | T026–T028: `PlayerInfoPanel`, `readInfoSnapshot`, `activatePanelControl` cobrindo 'info'. Contrato 5 verde (4/5). | Fase 5 (continuidade). |
| 2026-09-28 | Fase 5 (US3) | T029–T034: `reapplyTrackChoice` síncrono no 1º `playing`, `trackChoiceRef` na série. Contratos 5/5. Emenda de `logic §4` (só liga legenda quando há idioma). | Fase 6 (polish). |
| 2026-09-28 | Fase 6 (Polish) | T035–T041: E2E novo + `player-chrome.mjs` ajustado, builds, revisão de segredos, docs. Suíte E2E completa verde na 2ª rodada (1ª: corrida de timing no meu roteiro, corrigida). | Passada na TV física (spike + SC-006); `sdd-converge`. |

**PRÓXIMO**: passada na TV física (spike do AVPlay — `quickstart.md` §Spike — e SC-006), registrando o resultado em R-001…R-004; depois `sdd-converge`. Sem TV: rodar `sdd-converge` já e deixar R-001…R-004/SC-006 como pendentes, sem marcar "aprovado".

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/player/avplayAdapter.ts` — faixas/legenda/info do AVPlay (**só pela referência oficial; não verificado na TV** — é onde o spike, se divergir, mexe)
- `tv-web/src/lib/player/PlayerService.ts` — API nova da sessão (`getTracks`, `select*`, `getStreamInfo`, `subscribeSubtitles`)
- `tv-web/src/lib/player/tracks.ts` — tipos + normalização/rótulos/escolha por idioma
- `tv-web/src/components/PlayerLayer.tsx` — painel interno (`panelRef`), roteamento de teclas, reaplicação, `SubtitleOverlay`
- `tv-web/src/components/playerPanels.ts`, `PlayerTracksPanel.tsx`, `PlayerInfoPanel.tsx`, `SubtitleOverlay.tsx`
- `tv-web/src/features/series/SeriesDetailScreen.tsx` — `trackChoiceRef` (continuidade no autoplay)
- `tv-web/e2e/audio-legendas-info.mjs` — E2E com `webapis.avplay` falso
- Contrato: `tv-web/src/components/PlayerLayer.audio-legendas-info.contract.test.tsx` (travado, não editar)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `Set-Content -Encoding` falhou no PowerShell desta máquina ("parameter cannot be found"): para editar `.md` em lote usar `[System.IO.File]::ReadAllText/WriteAllText` com `UTF8Encoding($false)`, ou a ferramenta de edição — nunca `Set-Content`.
- `npx vitest run <arquivo>` só roda a partir de `tv-web/`; os scripts `.planning/...ps1` só rodam da raiz do repo (o diretório do shell persiste entre chamadas).
- `chromeControls` tem Áudio/Info `'unavailable'` por padrão; o `PlayerLayer` passa `features` a partir de `session.supportsTracks`/`supportsStreamInfo` — quem criar outro ponto de chamada de `chromeControls` precisa passar o 5º parâmetro, senão os dois botões ficam "— indisponível" mesmo com motor de faixas.
- E2E: `.player-chrome` é um contêiner sem tamanho (filhos absolutos) — o Playwright o trata como "hidden"; esperar com `state: 'attached'` ou contar (`.count()`), nunca por visibilidade. Verificação logo após uma tecla precisa de `eventually` (render assíncrono do React) na suíte completa.
- `e2e/paridade-limpeza.mjs depois` sobrescreve `sdd/specs/028-.../evidencias/paridade/depois/`: não rodar só para "ver"; o `18-player-vod` vai mudar de propósito (botões Áudio/Info).
- Feature 041 (2026-10-01): "Velocidade" saiu do chrome. O contrato travado desta feature (`PlayerLayer.audio-legendas-info.contract.test.tsx`) **não precisou de emenda** — os 6 passos ainda terminam em "Info do stream" porque o foco para no fim da linha — mas o comentário da linha 315 ainda cita "Velocidade" e, por estar travado, não foi editado. `e2e/audio-legendas-info.mjs` passou de 4 para 3 passos até "Info do stream" (Áudio → Qualidade → Aspecto → Info).
- Os testes de faixas/info/continuidade estão em arquivos próprios (`PlayerLayer.faixas/info/continuidade.test.tsx`), fora da trava; `PlayerLayer.test.tsx` não precisou mudar.

## Resultado Final

**Convergida em 2026-09-28 — SEM passada na TV física, por decisão explícita do usuário.** Nada desta feature foi visto na QN50Q60DAGXZD; R-001…R-004 e SC-006 ficam "não testado", nunca "aprovado".

**O que foi construído** (todas as três user stories, como especificado):
- **US1 (P1)** — "Áudio e legendas" real em VOD e Live: painel com as faixas que o motor informa, troca de áudio sem reiniciar, legenda embutida desenhada pelo app (começa desativada), áudio-descrição soft disabled salvo marca explícita do motor.
- **US2 (P2)** — "Info do stream" real: só os campos que o motor informa + Online/Offline, relidos a cada ~1 s; nada derivado da URL.
- **US3 (P3)** — atrasar a legenda (+500/+1000 ms) e reaplicar a escolha por idioma no próximo canal (zapping/CH±) e no próximo episódio, inclusive no autoplay da série (`trackChoiceRef` no `SeriesDetailScreen`).

**Desvios em relação ao plano original** (todos já nas Execution Notes/Riscos):
- Spike do AVPlay (Fase 1, T001/T002) adiado — o adaptador segue só a referência oficial da Samsung.
- SC-001 emendado de "≤ 6" para "≤ 10 teclas" (o painel em lista única custa ~9); FR-019/FR-020 ajustados: adiantar legenda embutida (−500/−1000 ms) é soft disabled, porque `setSubtitlePosition` só vale para legenda externa (D-006).
- Painel com visual de `Modal`, mas sem o componente (D-002, Complexity Tracking): o `PlayerLayer` intercepta o teclado antes de qualquer filho.
- `logic §4` emendado: a reaplicação só chama `selectTextTrack` quando há idioma a ligar (a sessão já nasce desativada, D-005).
- `trackLabels` (nome de rótulos repetidos), token `--subtitle-bg`, e os testes de T012–T014/T024/T025/T028/T033 em arquivos próprios em vez de dentro dos existentes.
- Contrato da 027 emendado só na linha dos dois mocks (aprovação do usuário, R-011 da 027) e retravado.
- `PlayerLayer.tsx` cresceu de 784 para 1040 linhas (R-005); extrair um hook fica para o item 49.

**Verificação:** 5/5 contratos da 029 (14/14 com 027 e 020), 13 travas do repositório íntegras; `npm run test` 1433/1437 (4 falhas do padrão instável já documentado, 106/106 isoladas); `tsc`/lint/`build`/`build:tizen` limpos; `e2e/audio-legendas-info.mjs` (39 verificações, AVPlay **falso**) e `npm run test:e2e` completo (12 roteiros) verdes. Auditoria do `sdd-converge`: nenhum atalho para os contratos e nenhum desvio por ambiente; FR-001…FR-025 e SC-001…SC-005 rastreáveis a código e teste.

**Resíduo aberto (registrado, não bloqueia):** R-001…R-004 (formato real do AVPlay, troca de áudio pausado, `subtitle_type` bitmap, `setSubtitlePosition`), R-005 (tamanho do `PlayerLayer`), R-007 (`paridade-limpeza.mjs` não re-executado, evidência da 028), R-009 e SC-006 (passada física); SC-003 (±100 ms) só provado com relógio falso; o edge case "app oculto/retomado" vale por construção (a sessão não é recriada) e não tem teste próprio. Para fechar o resíduo: `quickstart.md` §Spike e passada física, e se o formato divergir só o `avplayAdapter.ts` e `logic §1.2` mudam.