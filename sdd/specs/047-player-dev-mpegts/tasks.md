---
description: "Tasks da feature 047-player-dev-mpegts"
---

# Tasks: Reprodução de canais ao vivo MPEG-TS no navegador do dev

**Input**: Documentos de design de `sdd/specs/047-player-dev-mpegts/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `logic/fallback-demux.md`, `quickstart.md`; contratos travados em `contract-tests.lock`

**Organization**: por user story. **A Fase 3 (spike) é porta de saída: nada das Fases 4–6 começa sem `spike.md` registrando "seguir" (D-007, FR-002).**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1–US4

## Path Conventions

- Frontend em `tv-web/` (comandos rodam dali). Código em `tv-web/src/lib/player/`, scripts em `tv-web/scripts/`, E2E em `tv-web/e2e/`.
- Documentos da feature em `sdd/specs/047-player-dev-mpegts/`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: medir a linha de base de produção e instalar a dependência.

- [X] T001 Antes de qualquer mudança: rodar `npm run build` e gravar em `sdd/specs/047-player-dev-mpegts/baseline.md` a lista exata de arquivos emitidos em `tv-web/dist/` (nome + tamanho). Não rodar `build:tizen` (reescreve `CCPlayTv/`). → base de SC-004
- [X] T002 Instalar `mpegts.js` **só** como devDependency (`npm install -D mpegts.js`) em `tv-web/package.json`; conferir que `dependencies` não mudou (D-004) e anotar a versão instalada e a licença.

**Registro da Fase**:

- Status: concluída (2026-10-02)
- Feito: T001 — `baseline.md` com os 16 arquivos de `dist/` (build exit 0). T002 — `mpegts.js@1.8.2` (Apache-2.0) em `devDependencies` (`^1.8.2`); `dependencies` intacto; o lockfile ganhou só `mpegts.js`, `es6-promise` e `events`, todos `dev: true`.
- Contrato: sem contrato nesta fase; trava íntegra (4/4, conferida na abertura).
- Testes executados: `npm run build` → exit 0. `import('playwright')` continua resolvendo (o `npm install` removeu 7 pacotes extras fora do lockfile; nenhum usado).
- Pendências: o build desta linha de base já incluía as duas correções de CSS ad-hoc da Live (ficam fora da 047); isso também fecha a pendência "rodar `npm run build`" daquela correção.

---

## Phase 2: Foundational (Blocking Prerequisites)

Nenhuma além do Setup: os stubs (`devDemux.ts`, parâmetro de opções do adaptador) e os contratos já foram entregues pelo `sdd-plan`.

---

## Phase 3: User Story 1 - Spike: os canais reais decodificam no navegador? (Priority: P1) 🎯 PORTA DE SAÍDA

**Objetivo**: decidir com dado real se a feature vale a pena.

**Independent Test**: ler `spike.md` — resultado numérico e decisão escritos.

### Implementation

- [X] T003 [US1] Criar `tv-web/e2e/spike-mpegts-real.mjs` (fora do `test:e2e`): lê o `.env` em tempo de execução, sobe um servidor HTTP local com uma página que carrega `mpegts.js` de `node_modules/mpegts.js/dist/mpegts.js`, amostra ~10 canais ao vivo da lista real (via `player_api.php`), tenta tocar cada um por até 15 s num `<video>` e conta os que chegam a vídeo **e** áudio (`videoWidth > 0`, `webkitAudioDecodedByteCount > 0`). Mede também `MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"')` no navegador do Playwright e, se falso, tenta `chromium.launch({ channel: 'chrome' })` (R-002). **Saída só com contagens e booleanos** — nunca host, usuário, senha, URL ou nome de canal (FR-010).
- [X] T004 [US1] Rodar o spike com o dev server e a lista real do `.env`; repetir uma vez para estabilidade.
- [X] T005 [US1] Gravar `sdd/specs/047-player-dev-mpegts/spike.md`: amostrados × decodificaram vídeo+áudio, o que não decodificou (categoria: vídeo/áudio/rede), se o navegador do E2E decodifica H.264/AAC, e a decisão **seguir** ou **parar** (SC-001). **Se parar: registrar o motivo em `Riscos e Decisões` (R-001), marcar as Fases 4–6 como não executadas e encerrar (FR-002).**

### Testes da Fase

- [X] T006 [P] [US1] Teste do próprio spike: função pura que resume "n de m decodificaram" e garante que o texto impresso não contém `http`, `@` nem o host (em `tv-web/e2e/lib/` com teste Vitest ao lado, se o spike extrair essa função; caso contrário, justificar em `Execution Notes`).

**Critério de Conclusão**: `spike.md` existe com resultado numérico e decisão explícita; saída do spike sem segredo. Se "parar", a feature termina aqui.

**Checkpoint**: decisão tomada com dado real.

**Registro da Fase**:

- Status: concluída (2026-10-02) — decisão **SEGUIR**
- Feito: T003 `e2e/spike-mpegts-real.mjs` (+ `scripts/spikeSummary.mjs`); T004 duas execuções com a lista real (9/10 decodificam vídeo+áudio; o décimo, erro de rede persistente); T005 `spike.md`; T006 teste do resumo.
- Contrato: sem contrato nesta fase; trava íntegra (4/4).
- Testes executados: `npx vitest run scripts/spikeSummary.test.mjs` → 2/2. Spike real ×2 → mesma saída; o Chromium do Playwright decodifica H.264/AAC (R-002 resolvido).
- Pendências: nenhuma. T006 ficou em `tv-web/scripts/` (não `e2e/lib/`) porque só o projeto `node` do Vitest enxerga `scripts/**/*.test.mjs`.

---

## Phase 4: User Story 2 - Assistir um canal ao vivo no `npm run dev` (Priority: P1) 🎯 MVP

**Objetivo**: o canal `.ts` toca no dev, com fallback seguro e sessão encerrada por completo.

**Independent Test**: com a lista real, abrir um canal `.ts` em `npm run dev` e ver `playing`; trocar de canal e fechar sem conexão/áudio residual.

### Contrato da Fase

- `só autoriza o fallback para .ts com erro 4, disponível e sem tentativa anterior` — FR-003/006/008/009
- `em .ts recusado pelo <video>, inicia o demux sobre o mesmo elemento e ainda não reporta erro` — US2/AC1
- `quando o demux falha, reporta uma única falha genérica (code null) sem URL nem credencial` — FR-006/FR-010
- `close() destrói o demux, inclusive o que termina de anexar depois do close, sem callbacks tardios` — FR-005/SC-003
- Comando: `npx vitest run src/lib/player/devDemux.player-dev-mpegts.contract.test.ts src/lib/player/htmlVideoAdapter.player-dev-mpegts.contract.test.ts`

### Implementation

- [X] T007 [US2] Em `tv-web/vite.config.ts`, adicionar `optimizeDeps: { include: ['mpegts.js'] }` (D-009, R-004). Conferir que `npm run build` não muda. → contrato: nenhum (config)
- [X] T008 [US2] Implementar `isMpegTsUrl` e `shouldFallbackToDemux` em `tv-web/src/lib/player/devDemux.ts` conforme `logic/fallback-demux.md` §1. → contrato: `só autoriza o fallback para .ts com erro 4, disponível e sem tentativa anterior`
- [X] T009 [US2] Implementar `defaultDemuxStarter` em `tv-web/src/lib/player/devDemux.ts` conforme `logic/fallback-demux.md` §3: guarda `import.meta.env.DEV` + `MediaSource`, `import('mpegts.js')` **dentro** da guarda, log da biblioteca desligado (confirmar o nome da API nos tipos instalados), `onFailure` sem repassar argumento, `destroy()` idempotente. Remover o `throw` do stub.
- [X] T010 [US2] Integrar o fallback em `tv-web/src/lib/player/htmlVideoAdapter.ts` conforme `logic/fallback-demux.md` §2: opção `startDemux` (ausente = `defaultDemuxStarter()`, `null` desliga), `demuxTried`, `closed`, `errorReported`, destruição tardia e `close()`. Trocar `_options` por `options`. → contrato: `em .ts recusado…`, `quando o demux falha…`, `close() destrói…`
- [X] T011 [US2] Atualizar o comentário de cabeçalho de `tv-web/src/lib/player/htmlVideoAdapter.ts`: agora, só em dev, `.ts` recusado cai num demux em JavaScript; **continua não provando mídia da TV** (FR-011).

### Testes da Fase

- [X] T012 [P] [US2] Teste unitário de `defaultDemuxStarter()` em `tv-web/src/lib/player/devDemux.test.ts`: devolve `null` sem `MediaSource` (jsdom) e devolve função quando `MediaSource` existe (stub global) com `DEV` verdadeiro.
- [X] T013 [P] [US2] Teste unitário do adaptador em `tv-web/src/lib/player/htmlVideoAdapter.demux.test.ts` (arquivo novo, não de contrato): URL `.mp4` com erro 4 e `startDemux` presente → `onError` imediato e demux nunca chamado; `startDemux: null` com `.ts` → `onError` imediato (FR-009/FR-013).

**Critério de Conclusão**: o comando do contrato → 4/4 verdes e `check-contract-tests.ps1 -Slug 047-player-dev-mpegts` íntegro; `npm test` verde sem editar asserção existente (FR-013); `npx tsc --noEmit` e `npm run lint` sem novos erros.

**Checkpoint**: US2 funcional no nível de unidade; prova real em Chromium vem na Fase 6.

**Registro da Fase**:

- Status: concluída (2026-10-02)
- Feito: T007 `optimizeDeps.include ['mpegts.js']` em `vite.config.ts`; T008/T009 `isMpegTsUrl`, `shouldFallbackToDemux` e `defaultDemuxStarter` em `devDemux.ts` (guarda `import.meta.env.DEV` + `MediaSource`, log da lib desligado, `onFailure` sem argumento, `destroy()` idempotente); T010 fallback no `htmlVideoAdapter.ts` (`demuxTried`/`demuxDead`/`errorReported`/`closed`, destruição tardia); T011 cabeçalho do adaptador; T012/T013 testes extras.
- Contrato: `npx vitest run src/lib/player/devDemux.player-dev-mpegts.contract.test.ts src/lib/player/htmlVideoAdapter.player-dev-mpegts.contract.test.ts` → 4/4 verdes (eram 4/4 vermelhos); trava íntegra.
- Testes executados: `npx vitest run src/lib/player` → 192/192 antes dos testes extras; `npx vitest run src/lib/player/devDemux src/lib/player/htmlVideoAdapter` → 28/28 com eles (+3 em `devDemux.test.ts`, +4 em `htmlVideoAdapter.demux.test.ts`); `npx tsc --noEmit` exit 0; `npx oxlint src/lib/player` sem avisos. Nenhuma asserção existente editada.
- Pendências: o fallback ainda não foi provado num Chromium real dentro do app (Fase 6); a suíte unitária completa fica para o gate final.

---

## Phase 5: User Story 3 - Nada disso chega à TV nem à produção (Priority: P2)

**Objetivo**: garantir, por verificação automática, que o build não contém a biblioteca nem muda.

**Independent Test**: `npm run build` → verificador verde; arquivos emitidos = `baseline.md`.

### Implementation

- [X] T014 [US3] Criar `tv-web/scripts/check-no-demux-in-build.mjs`: varre os arquivos de `tv-web/dist/` procurando marcadores estáveis da biblioteca (`mpegts`, `MSEController`, `FetchStreamLoader`; R-005) e sai com código ≠ 0 listando **só nomes de arquivo**, nunca trechos. Aceita um diretório como argumento (para teste).
- [X] T015 [US3] Encadear o verificador em `tv-web/package.json`: `build` = `tsc -b && vite build && node scripts/check-no-demux-in-build.mjs`; `build:tizen` idem antes do `sync-tizen.mjs`.

### Testes da Fase

- [X] T016 [P] [US3] Teste Vitest do verificador em `tv-web/scripts/check-no-demux-in-build.test.ts` (ou `.mjs` equivalente do repositório): falha numa pasta temporária com um arquivo contendo `FetchStreamLoader` e passa numa limpa (R-005).
- [X] T017 [US3] Rodar `npm run build`, comparar os arquivos emitidos com `baseline.md` (devem ser idênticos em nomes; tamanhos podem variar só por código novo do adaptador) e usar `findUnlistedFiles` de `tv-web/scripts/tizenFiles.mjs` **em leitura** contra `CCPlayTv/tizen_web_project.yaml` para provar que nada novo é exigido (SC-004). Não rodar `build:tizen`.

**Critério de Conclusão**: `npm run build` verde com o verificador; lista de arquivos igual à da linha de base; nenhum arquivo novo para `tizen_web_project.yaml`.

**Checkpoint**: produção e TV provadamente intactas.

**Registro da Fase**:

- Status: concluída (2026-10-02)
- Feito: T014 `scripts/check-no-demux-in-build.mjs` (marcadores `FetchStreamLoader`, `MSEController`, `TSDemuxer`, `enableStashBuffer`, `liveBufferLatencyChasing` — medidos na lib minificada; imprime só nomes de arquivo/marcador; ignora binários); T015 encadeado em `build` e `build:tizen` (antes do `sync-tizen.mjs`); T016 `scripts/check-no-demux-in-build.test.mjs` (3 casos); T017 build real comparado com `baseline.md`.
- Contrato: sem contrato nesta fase (US3 virou o próprio verificador); trava íntegra (4/4).
- Testes executados: `npx vitest run scripts/check-no-demux-in-build.test.mjs` → 3/3. `npm run build` → exit 0 e `check-no-demux-in-build: ok`. Comparação: 16 arquivos = 16 da linha de base, nenhum novo/removido; só `assets/index.js` mudou (778053 → 778694, +641 bytes, código do adaptador). `findUnlistedFiles` (leitura) → nenhum arquivo fora de `tizen_web_project.yaml`. SC-004 atendido. `build:tizen` não foi rodado (reescreve `CCPlayTv/`).
- Pendências: o T016 ficou em `.test.mjs` (não `.test.ts`) porque o projeto `node` do Vitest só inclui `scripts/**/*.test.mjs`. O verificador não foi exercitado contra um build que de fato contenha a lib (o teste usa pastas sintéticas); o `npm run build` com a lib vazando falharia aqui, mas isso não foi reproduzido.

---

## Phase 6: User Story 4 - Prova automatizada (Priority: P3)

**Objetivo**: cenário E2E padrão com stream local e script real fora do `test:e2e`.

**Independent Test**: `npm run test:e2e` verde (3 execuções) com o cenário novo; script real imprime só estados.

### Implementation

- [X] T018 [US4] Gerar `tv-web/e2e/fixtures/canal-teste.mpegts` com o `ffmpeg` do comando de `research.md` R0-4 (~30 s, ~400 KB) e conferir o tamanho.
- [X] T019 [US4] Criar `tv-web/e2e/player-dev-mpegts.mjs`: servidor HTTP local (porta 0, CORS `*`) servindo `canal-teste.mpegts` em `/live/u/p/<id>.ts` e uma lista M3U fictícia apontando para ele (`e2e/lib/entrada.mjs`, `cadastrarListaM3u`); abre o canal em Live e espera `playing` real (`video.readyState`, `currentTime` avançando). Antes, checa `isTypeSupported` H.264/AAC: se falso (e `channel: 'chrome'` indisponível) imprime `PULADO: <motivo>` e sai com 0 **rotulado** (D-008). Prova também: 10 trocas de canal sem conexão residual (servidor conta conexões abertas), console da página sem host/credencial (R-003), sem reload da página (R-004), RETURN sem áudio.
- [X] T020 [P] [US4] Registrar `e2e/player-dev-mpegts.mjs` em `SUITE` de `tv-web/e2e/run.mjs` e em `test:e2e:serial` de `tv-web/package.json`.
- [X] T021 [P] [US4] Criar `tv-web/e2e/player-dev-mpegts-real.mjs` (fora da `SUITE`; cabeçalho no estilo de `epg-guia-completo-real.mjs`): lista real do `.env`, mede tempo até `playing` (SC-002) e conexões residuais em 10 trocas (SC-003); saída só com estados, ms e contagens.

### Testes da Fase

- [X] T022 [US4] Rodar `npm run dev` (reiniciado) e `npm run test:e2e` **3 vezes seguidas** com o cenário novo; registrar resultado (SC-005). Rodar o script real uma vez e registrar SC-002/SC-003.

**Critério de Conclusão**: `npm run test:e2e` verde em 3 execuções, incluindo `player-dev-mpegts.mjs` (ou `PULADO` rotulado por D-008, com a decisão do usuário registrada); script real executado; suítes existentes sem edição de asserção (FR-013).

**Checkpoint**: feature provada em navegador real.

**Registro da Fase**:

- Status: concluída (2026-10-02)
- Feito: T018 `e2e/fixtures/canal-teste.mpegts` (30 s, H.264 baseline + AAC, 584 KB, `ffprobe` confirma); T019 `e2e/player-dev-mpegts.mjs` (servidor local de lista M3U + `.ts` em ritmo de "ao vivo" contando respostas abertas; 10 trocas; RETURN; sem reload; console sem a URL; `PULADO` rotulado se o navegador não decodificar H.264/AAC); T020 registrado em `SUITE` de `e2e/run.mjs` e em `test:e2e:serial`; T021 `e2e/player-dev-mpegts-real.mjs` (fora da `SUITE`, só estados/ms/contagens).
- Contrato: sem contrato novo nesta fase; trava íntegra (4/4).
- Testes executados: `node e2e/player-dev-mpegts.mjs` → todas as verificações (primeiro canal tocou em 7,1 s; 10 trocas tocaram, pior caso 1 conexão aberta; 0 conexões e 0 `<video>` depois do RETURN; página sem reload; console sem a URL). `npm run test:e2e` ×3 seguidas, dev server reiniciado antes → **27/27 scripts nas 3 execuções** (270 s, 270 s, 277 s; `player-dev-mpegts` ≈ 86 s). Script real com a lista do `.env` → primeiro canal em **4,7 s** (SC-002), **10/10 trocas tocaram**, mediana 4,2 s, pior caso 1 conexão aberta e **0 após fechar** (SC-003).
- Pendências: (1) a 1ª versão do E2E media 14 s até tocar porque a rajada inicial do servidor falso (150 KB) não cobria o buffer inicial da biblioteca (~384 KB); corrigido no teste (rajada de ~420 KB), nada no app — com a lista real são 4,7 s. (2) `player-dev-mpegts` é o 2º mais lento da suíte, depois de `carga-listas` (≈ 86 s, por causa das 10 trocas); aceitável com 3 em paralelo (total 270 s). (3) Nenhuma asserção de outro script foi editada.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T023 Limpeza: sem `console.log`, sem URL/credencial em log; remover stubs mortos.
- [X] T024 Atualizar `CLAUDE.md` (entrada da feature 047, honesta sobre o que foi provado e o que não) e `.planning/backlog.md` via `update-feature-status.ps1`.
- [X] T025 Rodar a validação de `quickstart.md`.

### Checklist de Release

- [X] Fase 3 (US1, spike) concluída com decisão registrada
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro
- [X] `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` limpos
- [X] `npm run test:e2e` verde (3 execuções)
- [X] Revisão de segredos (nada de host/credencial em log, saída de script ou commit)
- [X] `quickstart.md` executado com sucesso
- [X] Passada na TV física: **não foi feita e não é gate** desta feature (spec); confirmado que nada declara a reprodução em dev como aceite da TV (FR-011)

---

## Dependencies & Execution Order

- Setup (Fase 1) → **Spike (Fase 3, porta de saída)** → US2 (Fase 4) → US3 (Fase 5) e US4 (Fase 6) em qualquer ordem entre si, depois da Fase 4.
- Dentro da Fase 4: T007 e T008 podem ir juntos; T009 depende de T002; T010 depende de T008–T009.
- Tasks `[P]` na mesma fase mexem em arquivos diferentes.

## Implementation Strategy

1. Fase 1 → Fase 3: **parar e decidir** com o `spike.md`.
2. Se "seguir": Fase 4 (MVP) → validar → Fase 5 → Fase 6 → Polish.
3. Commitar após cada fase.

## Notes

- Nunca editar os arquivos `*.player-dev-mpegts.contract.test.ts` (travados).
- Nunca imprimir o `.env`, URL, usuário, senha ou nome de canal.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 8: Convergence

**Origem**: `sdd-converge` de 2026-10-02 (achados F-001…F-003). Nenhuma task acima foi alterada.

- [X] T026 [US2] (MEDIUM, origem: US2/AC4, edge "codec não suportado", `quickstart.md` cenário 3) Em `tv-web/e2e/player-dev-mpegts.mjs`, adicionar um cenário com um endpoint `.ts` que serve bytes não decodificáveis (ex.: texto/bytes aleatórios com `Content-Type: video/mp2t`): esperar a tela de erro `PLAY-04` com uma ação focável ("Tentar de novo"), nenhuma conexão residual depois de fechar e nada da URL no console. Depois, executar de fato o cenário 3 do `quickstart.md` e corrigir o Registro do T025.
- [X] T027 [US2] (MEDIUM, origem: US2/AC5, edge "rede cai no meio do stream") No mesmo script, adicionar um cenário em que o servidor derruba o socket do stream depois de alguns KB: confirmar que a reconexão da feature 042 faz uma nova requisição ao stream e volta a tocar; se a queda se repete, o fim é a tela de erro com ação focável, sem conexão residual.
- [X] T028 [US3] (LOW, origem: FR-007/R-005) Provar o verificador contra um build real que vaza: remover **temporariamente** a guarda `import.meta.env.DEV` de `tv-web/src/lib/player/devDemux.ts`, rodar `npm run build` e confirmar que o `check-no-demux-in-build` falha listando só nomes de arquivo; reverter (sem commitar a mutação), repetir o build verde e registrar o resultado em R-005.

**Registro da Fase**:

- Status: concluída (2026-10-02)
- Feito: T026 cenário do canal 4 (bytes que dizem ser MPEG-TS mas não são) em `e2e/player-dev-mpegts.mjs`: chega à tela de erro em ~0,2 s (não fica carregando), código `PLAY-04`, ação "Tentar de novo" presente e exatamente uma ação com foco, 0 conexões abertas depois de fechar; T027 cenário do canal 5 (o servidor derruba o socket sob comando depois que o canal tocou): o app pede o stream de novo (reconexão da 042), volta a tocar, sem tela de erro e sem conexão residual; T028 mutação real: sem a guarda `import.meta.env.DEV` o `npm run build` falhou (exit 1) apontando `assets/mpegts.js` e os 5 marcadores; arquivo revertido (SHA-256 idêntico ao backup) e build verde de novo com o verificador.
- Contrato: sem contrato novo; trava íntegra (4/4, conferida na abertura da fase).
- Testes executados: `node e2e/player-dev-mpegts.mjs` → todas as verificações (116 s), incluindo os 10 novos checks; `npx oxlint e2e/player-dev-mpegts.mjs` exit 0; `npm run build` exit 0 com `check-no-demux-in-build: ok` e os mesmos 16 arquivos da linha de base. Gate `npm run test:e2e` ×3 com os cenários novos: **27/27 scripts nas 3 execuções** (325 s, 285 s, 283 s) rodando no código commitado (worktree do HEAD `2b980ae` com o `player-dev-mpegts.mjs` atualizado copiado). Na árvore de trabalho atual, 3 execuções deram 25/27, 25/28 e 23/28 — ver a pendência (5).
- Pendências / desvios: (1) **Bug pré-existente achado e logado (item 67 do backlog, decisão do usuário):** `lastGoodChannelRef` em `useLiveZapping.ts` nunca é zerado ao fechar o player nem ao abrir canal novo, então depois de zapear um canal que falha reverte para o anterior em vez de mostrar o erro. O cenário T026 roda **antes** das 10 trocas de canal para não esbarrar nele; essa ordem é intencional e não deve ser desfeita antes do bugfix. (2) T027 cobre só o ramo "volta a tocar depois da queda"; o ramo "a queda se repete e termina na tela de erro" leva ~50 s (atrasos de 2/5/10 s da 042) e é contrato da própria 042, então não foi duplicado aqui. (3) O canal 4 usa bytes inválidos como proxy de "codec não decodificável": prova o caminho de erro com a demux real, mas não um stream HEVC/AC3 de verdade. (4) Duas execuções seguidas do script falharam em 15 s no primeiro passo (espera de `.add-card.tv-focus`) logo depois de subir o dev server, com `live.css` alterado por fora; a terceira e as seguintes passaram e a página carrega em ~3,1 s de forma estável; causa não identificada; não voltou a acontecer nas 4 execuções seguintes do script nem nas 3 do gate. (5) **Falhas que não são da 047, na árvore de trabalho atual:** `live-tv-ds-v14`, `epg-dados-agora` e `busca-por-categoria` falham (também isoladas, serial) e passam no HEAD (mesmos 3 scripts, 11/16/14 s, 0 falhas). O HEAD já contém as minhas correções de CSS da Live; a árvore atual tem uma reforma da tela de Live ainda não commitada (`liveColumns.tsx` +214, `live.css` +409, `LiveHeroArt.tsx`, `SideCategoryNav.tsx`…) que não é desta feature. `ime-formularios` falhou uma vez, numa rodada saturada (618 s), e passou nas outras. (6) Em uma rodada saturada o `player-dev-mpegts` falhou no T027 porque o canal 5 levou mais de 15 s para tocar (as outras duas falhas dele eram em cascata); `START_BUDGET_MS` do script subiu de 15 s para 30 s (o limite de 15 s do SC-002 é provado pelo script com a lista real: 4,7 s) — R-008.
