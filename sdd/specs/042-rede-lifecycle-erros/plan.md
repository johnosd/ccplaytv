# Implementation Plan: Rede, lifecycle e erros acionáveis

**Slug**: `042-rede-lifecycle-erros` | **Date**: 2026-10-01 | **Spec**: `sdd/specs/042-rede-lifecycle-erros/spec.md`

## Summary

Duas metades da mesma regra do DS V14 (§40 rede/lifecycle, §45 erros): (1) o app
passa a **saber** em que estado de rede está e a agir com limites — reconexão
automática do stream (≤ 3, só com rede, retomando da posição), retomada do app
oculto que **não** retoma o filme sem rede, banner offline com ação alcançável
pelo controle remoto, pré-carga que respeita o 429 do painel; (2) todo erro vira
"o que houve + por quê + uma ação + código", numa **tabela única de códigos**,
com diagnóstico de reprodução (rede × formato × fonte) e "Info técnica"
sanitizada. Abordagem: funções puras (`diagnosePlayback`, `nextReconnect`,
`reduceNetworkState`, `describeError`, `verifyNetwork`) e integração fina nos
hooks já divididos pela feature 040 — nenhum módulo novo no player além do
painel de erro, nenhuma versão de Dexie.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 (Vite 8, alvo `chrome108`)

**Primary Dependencies**: as existentes (`@tanstack/react-query`, Dexie). Nenhuma nova.

**Storage**: N/A — estado de rede, reconexão e diagnóstico ficam em memória. **Sem bump do Dexie** (hoje v15; a v16 segue reservada para o item 27 se precisar).

**Testing**: Vitest + Testing Library (jsdom); Playwright E2E em `tv-web/e2e/*.mjs` com adaptador/AVPlay falsos (`e2e/audio-legendas-info.mjs` é o modelo).

**Target Platform**: Samsung Tizen (QN50Q60DAGXZD, Chromium 120, origem `file://`) + navegador de desenvolvimento.

**Performance Goals**: reconexão e verificação não podem travar a thread de UI; `verifyNetwork` ≤ 5 s por `Promise.race`; pré-carga continua cedendo (gate de atividade).

**Constraints**: AVPlay é singleton (nunca duas sessões); foco nunca fica sem elemento acionável; nada de URL/credencial em mensagem, `aria-*`, log ou Info técnica; `useRemoteNav` sem handler novo; ordem de efeitos de `PlayerLayer` preservada (`040/logic/divisao.md` §1).

**Scale/Scope**: ~30 arquivos com erro a migrar, em três ondas (P1/P2/P3); núcleo (P1) toca ~8 arquivos.

## Decisões Invariantes

- **D-001** Tabela única `lib/errors/errorCatalog.ts`. Códigos novos: `NET-01/02`, `SRC-001/401/402/409/422`, `API-401/429`, `PLAY-01..04`. **Os códigos existentes** (`EPG-02`, `STO-01`, `TRL-REDE/TEMPO/PONTE`, `YT-n`) **não são renomeados**.
- **D-002** `diagnosePlayback` é pura e usa **lista branca** de nomes de erro do motor; qualquer coisa fora dela é `PLAY-04`. O texto vem sempre da tabela; o erro cru nunca é exibido nem serializado.
- **D-003** Reconexão: ≤ 3 tentativas, esperas `RECONNECT_DELAYS_MS = [2 s, 5 s, 10 s]`, só com `autoReconnect` **e** rede; Live reabre o canal, VOD retoma da última posição (`resumeAtRef`); o contador só zera após `RECONNECT_STABLE_MS = 30 s` ininterruptos em `playing`; "Tentar de novo" manual zera.
- **D-004** Reconectar **reusa** `setAttempt` do efeito de sessão (teardown antes de abrir): nunca duas sessões AVPlay, nenhum efeito novo em `usePlayerSession`.
- **D-005** `navigator.onLine` é só o sinal inicial. `verifyNetwork(origin?)` (≤ 5 s, `Promise.race`) decide na retomada do app e no "Tentar de novo" do banner; **não** é usada para decidir reconexão (essa lê `navigator.onLine`, barato). `origin` = só `esquema://host[:porta]` do provedor da lista ativa — nunca caminho/credencial.
- **D-006** Retomada do VOD: `resumeGateRef` (`'verifying' | 'blocked' | null`); enquanto ≠ `null`, só **retomar** é bloqueado (SELECT no play, `MediaPlay`, `MediaPlayPause` via `togglePauseGuarded`); pausar e saltar não. Liberar o gate **não** retoma sozinho.
- **D-007** Banner offline: texto em `AppShell`; a ação é o item `'connection'` da ordem de foco da `TopBar` (último, só offline), porque o botão atual só responde a clique — a TV não o alcança.
- **D-008** 429 do painel = `ProviderError('rate_limited')` → `PrefetchRunOutcome 'rate_limited'` → pausa `RATE_LIMIT_PAUSE_MS = 60 s`, sem contar tentativa, mesma categoria volta primeiro, `pausedReason` aparece na linha de estado do Início.
- **D-009** Ocultar **não** desmonta nem limpa foco; só `ensureTitleMetadata` (TMDB/BYOK) deixa de iniciar busca com o app oculto (`isAppHidden()`).
- **D-010** Sem Dexie. Sem toast por categoria/detalhe (comportamentos da 032/038 preservados).
- **D-011** Ondas: P1 (player+rede: US1, US2) → P2 (catálogo/fonte/EPG/TMDB/trailer: US3) → P3 (demais + formulário: US4). Cada onda é entregável sozinha.
- **D-012** O rótulo da ação é **"Tentar de novo"** (33 arquivos o usam); "Tentar novamente" da spec é o nome do DS.

## Constitution Check

*GATE: passa antes do design. Reavaliado depois.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Nada de conta. O bloqueio por conta expirada (034) já existe; só ganha código. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Núcleo da feature: diagnóstico por lista branca, Info técnica de 5 campos, varredura automática (SC-004). `verifyNetwork` manda `no-cors` só à **origem** do provedor da própria lista, sem credencial — não é terceiro. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Não toca em categorias. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Causa desconhecida é `PLAY-04`, nunca palpite; progresso retomado é o real. |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Offline bloqueia só o que depende de internet (soft disabled com motivo); navegação local segue livre. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | Trailer só registra seus códigos na tabela; TMDB só deixa de iniciar com o app oculto. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Corrige um buraco existente: o "Testar conexão" só respondia a clique → item `'connection'` na ordem de foco da topbar (D-007). |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | ✅ | ✅ | Falha de stream não reclassifica o catálogo. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Todo estado novo (reconectando, verificando, bloqueado, erro, Info técnica) tem foco/saída (RETURN); foco que sumia (item `'connection'` com rede de volta) cai em `'home'`. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | RETURN no painel Info técnica volta à ação de origem; RETURN na tela de erro fecha o player como hoje. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Reconexão busca a URL de novo por `itemId` (`fetchPlayback`), nunca reaproveita a anterior; retomada pela posição, gravada por `stableId` como hoje. |
| Progresso e Capacidades São Reais, Nunca Prometidos | ✅ | ✅ | A reconexão do VOD usa a posição que o motor informou; Live não promete posição. |
| Documentação do Repositório É Canônica | ✅ | ✅ | Polish atualiza `CLAUDE.md`, backlog e `comingSoon` (nada a remover). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/042-rede-lifecycle-erros/
├── spec.md
├── plan.md
├── tasks.md
├── quickstart.md
├── handoff.md
├── contract-tests.lock
└── logic/
    ├── rede-e-lifecycle.md      # estados, verifyNetwork, reconexão, retomada, 429
    └── erros-acionaveis.md      # tabela de códigos, diagnóstico, tela de erro, migração
```

Sem `data-model.md` (nada persiste), sem `contracts/` (nenhuma superfície de API), sem `research.md` (a única incerteza — os nomes de erro do AVPlay — é o R-001).

### Source Code (repository root)

```text
tv-web/src/
├── lib/
│   ├── errors/errorCatalog.ts            # NOVO — tabela única + describeError
│   ├── network/
│   │   ├── verifyNetwork.ts              # STUB do plan (D-005)
│   │   ├── networkState.ts               # NOVO — reduceNetworkState + useNetworkState; isAppHidden
│   │   └── (onlineStatus.ts em lib/)     # passa a ler do redutor
│   ├── player/
│   │   ├── playbackDiagnosis.ts          # STUB do plan
│   │   └── reconnectPolicy.ts            # constantes prontas, nextReconnect é STUB
│   └── catalog/
│       ├── xtreamConnector.ts            # 429 → ProviderError('rate_limited')
│       ├── categoryLoader.ts             # failureOf distingue rate_limited
│       └── prefetch/{prefetchScheduler.ts,index.ts}   # outcome + pausa
├── components/
│   ├── PlayerLayer.tsx                   # fase reconnecting, tela de erro nova, aviso do gate
│   ├── PlayerErrorInfoPanel.tsx          # NOVO — Info técnica
│   ├── OfflineBanner.tsx                 # só texto + estado
│   └── player/{usePlayerSession.ts,usePlayerKeyboard.ts,playerLayerTypes.ts,playerMessages.ts}
├── features/
│   ├── shell/{AppShell.tsx,TopBar.tsx}   # item 'connection'
│   ├── home/homeStatusLine.ts            # pausedReason
│   ├── import/AddSourceScreen.tsx        # P3: 4 erros do formulário
│   └── …                                 # P2/P3: ver logic/erros-acionaveis.md §4
├── lib/metadata/titleMetadata.ts         # não inicia com o app oculto
└── navigation/appNav.ts                  # TopbarItem ganha 'connection'
tv-web/e2e/rede-lifecycle-erros.mjs       # NOVO (Polish)
```

**Structure Decision**: o repositório real é `tv-web/` (React/Vite) — `api/` está congelado (ADR-008) e não é tocado. Nada de módulo novo dentro de `components/player/`: o gate e a reconexão entram nos hooks existentes para respeitar `040/logic/divisao.md`.

## Complexity Tracking

Sem violações da constituição. Uma **mudança de comportamento deliberada** em testes existentes não travados: `OfflineBanner.test.tsx` e `AppShell.test.tsx` afirmam o botão "Testar conexão" (R-004).

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (a partir de `tv-web/`):

```powershell
npx tsc -b
npm run lint
npx vitest run <arquivos>
npm run test
npm run build:tizen
npm run test:e2e        # com `npm run dev` já rodando; reinicie o dev server se estiver de pé há horas
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/player/playbackDiagnosis.rede-lifecycle.contract.test.ts`,
`tv-web/src/components/PlayerLayer.rede-lifecycle.contract.test.tsx`,
`tv-web/src/lib/catalog/prefetch/prefetchScheduler.rede-lifecycle.contract.test.ts`

Comando: `npx vitest run src/lib/player/playbackDiagnosis.rede-lifecycle.contract.test.ts src/components/PlayerLayer.rede-lifecycle.contract.test.tsx src/lib/catalog/prefetch/prefetchScheduler.rede-lifecycle.contract.test.ts`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `distingue rede, formato, fonte e desconhecido…` | US2/AC1–AC3, FR-012/FR-013 | Fase 2 | `Error: not implemented` (`diagnosePlayback`) |
| `a Info técnica e o diagnóstico nunca carregam URL…` | FR-014/FR-019, Constitution: Segredos | Fase 2 | `Error: not implemented` |
| `filme: reconecta sozinho até 3 vezes…` | US1/AC2, FR-008/009/010 | Fase 3 | `Unable to find an element with the text: /Reconectando/` |
| `filme pausado ao ocultar: voltando sem rede NÃO retoma…` | US1/AC4, FR-006/FR-007 | Fase 3 | `Unable to find role "button" name "Tentar de novo"` |
| `um 429 pausa a pré-carga pela espera inteira…` | US3/AC2, FR-017, SC-007 | Fase 4 | `expected "vi.fn()" to be called 1 times, but got 3 times` |

Stubs criados pelo plan (ponto de partida do execute, **não travados**): `tv-web/src/lib/player/playbackDiagnosis.ts`, `tv-web/src/lib/player/reconnectPolicy.ts` (constantes reais; `nextReconnect` é stub), `tv-web/src/lib/network/verifyNetwork.ts`, e a extensão de tipo/constante em `tv-web/src/lib/catalog/prefetch/prefetchScheduler.ts` (`'rate_limited'`, `RATE_LIMIT_PAUSE_MS`, `pausedReason`).

Fora do contrato (orçamento de 5): foco do item `'connection'` na `TopBar`, tela de erro do player com ações e Info técnica, `describeError` cobrindo todo código, `networkState`, o gate no teclado, o mapeamento `ProviderFailureKind`→código, varredura de segredos e E2E — vão em "Testes da fase" e no Polish.

## Estado Atual

| Área | Estado |
| --- | --- |
| Spec / plano / tasks | prontos |
| Contratos | 5/5 escritos, vermelhos, travados |
| Fase 1 (Setup) | concluída (T001–T005) |
| Fase 2 (Foundational) | concluída (T006–T010); contratos 1–2 verdes |
| Fase 3 (US1) | concluída (T011–T023); contratos 3–4 verdes |
| Fase 4 (US2) | concluída (T024–T030) |
| Fase 5 (US3) | concluída (T031–T038); contrato 5 emendado com aprovação (R-013) |
| Fase 6 (US4) | concluída (T039/T041/T042); T040 não feita (R-014) |
| Fase 8 (Convergence) | concluída (T047–T051) |
| Fase 7 (Polish) | E2E novo verde (25 verificações) e dentro de `test:e2e`; docs atualizadas; passada na TV recomendada, não feita |
| Suíte | 2279/2279; `tsc` limpo; lint 0 erros; 25/25 travas íntegras; `test:e2e` completo verde |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Os **nomes de erro do AVPlay** da lista branca (`PLAYER_ERROR_CONNECTION_FAILED`, `…NOT_SUPPORTED_FILE`, `…AUTHENTICATION_FAILED`…) vêm da referência da Samsung, **não foram vistos na TV** — o adaptador só repassa `name`/string | Médio: um nome real fora da lista cai em `PLAY-04` + "Tentar de novo" (falha segura), mas a categoria pode ficar menos específica | Lista em um único const; `PLAY-04` como saída segura; passada na TV (recomendada) coleta os nomes reais e amplia a lista. "Não testado" nunca vira "aprovado". |
| R-002 | `sourceAccess` do diagnóstico depende de ler o registro da lista (feature 034) a partir do `source_id` | Baixo | Resolvido: Leitura local; falhou → `null` (cai nas regras de rede/formato). |
| R-003 | O contrato 3 usa `fakeTimers` + `PlayerLayer` com refs: reconectar **cria uma sessão nova** a cada tentativa; um efeito mal posto pode abrir duas | Alto (AVPlay singleton) | Resolvido: D-004: só `setAttempt`; teardown fecha antes de abrir; teste do contrato afirma `closeCount` por adaptador indiretamente via contagem de adaptadores. |
| R-004 | `OfflineBanner.test.tsx` e `AppShell.test.tsx` (não travados) afirmam o botão "Testar conexão" | Baixo | Resolvido: Mudança **por decisão** (D-007): o execute atualiza esses testes e registra em Execution Notes. |
| R-005 | `TopbarItem` ganha `'connection'`: ~56 usos em 12 arquivos; `Record<TopbarItem,…>`/`switch` exaustivos podem quebrar o `tsc` | Médio | Resolvido: Mudança só de tipo; `tsc` aponta cada ponto; as travas 023/024/026 rodam na fase. |
| R-006 | HTTP 429 de **stream** (não do JSON) chega ao AVPlay como erro genérico | Baixo | Resolvido: Cai em `PLAY-01`/`PLAY-04`; `API-429` só para o painel JSON e TMDB. |
| R-007 | O `verifyNetwork` com `no-cors` conta qualquer resposta (até 404) como "alcançável" | Baixo (intencional) | Resolvido: O objetivo é alcance de rede, não saúde do painel; saúde é a verificação de conta da 034. |
| R-008 | Reconexão não foi vista numa **queda real** do AVPlay (só adaptador falso) | Médio | Passada na TV **recomendada**, não gate (spec); roteiro no `quickstart.md`. |
| R-009 | **Emenda ao D-005** (achada no execute): a retomada do app usa `verifyNetwork()` **sem origem** (só `navigator.onLine`), e o "Tentar de novo" da topbar também. Motivos: (a) o contrato travado da 020 exige que o `fetchPlayback` rode ao voltar visível, com o `verifyNetwork` **real** — uma sonda de origem em `.invalid` o derrubaria; (b) a origem do provedor está atrás de `readCredential`, "porta restrita" (só conector e montagem de URL). A sonda com origem existe em `verifyNetwork(origin)` mas nenhum chamador a usa | Médio: uma TV com `navigator.onLine` errado (standby) não é corrigida pela sonda; a confirmação real passa a ser a própria reabertura/retomada, que cai no caminho de erro | Resolvido: FR-002 atendido pelo caminho de erro (stream/requisição falhando prevalece). Se a passada na TV mostrar `onLine` mentindo, abrir feature para expor a origem por uma porta sanitizada. |
| R-010 | **D-003 refinado**: a reconexão automática só vale para um stream que **já tocou** (ou já está numa sequência). Um canal morto/URL ruim vai direto ao erro | Baixo (melhora a UX: 17 s de espera por canal morto seria pior que o erro) | Resolvido: Registrado no código (`playedThisSession`) e em `PlayerLayer.reconexao.test.tsx`. |
| R-011 | 7 testes antigos de `PlayerLayer.test.tsx`/`.faixas` simulavam "tocou e falhou" esperando erro imediato | Baixo | Resolvido: Ajustados **na entrada** (erro antes de `playing`, código de formato, ou timers falsos); nenhuma asserção do resultado mudou. Registrado como ajuste esperado (T030). |
| R-012 | Lint: +9 avisos `react(refs)` em `PlayerLayer.tsx` (45 → 54) | Baixo | Resolvido: Mesma categoria já aceita na 040/R-006 (refs lidos no render). |
| R-013 | **Resolvido (opção A, aprovada pelo usuário em 2026-10-01): o teste foi emendado — `toBeGreaterThanOrEqual(2)` + `toHaveBeenNthCalledWith(2, 'fonte-1', 1)` — e a trava regravada.** Texto original: **Contrato 5 (`prefetchScheduler.rede-lifecycle.contract.test.ts`) parece errado** (passo 5b do execute, **parada obrigatória**). Depois de a pausa de 60 s terminar, o teste afirma `toHaveBeenCalledTimes(2)` numa janela de +3 s, mas o agendador (com `gapMs: 500` e o 2º `runCategory` devolvendo `done` na hora) legitimamente já chama a categoria 2: são 3 chamadas (`1 rate_limited`, `1 done`, `2 done`). O comportamento pedido está implementado e correto — pausa pela espera inteira, mesma categoria volta primeiro, motivo exposto, sem tentativa contada. Só o número de chamadas na janela é inalcançável sem inventar espaçamento | Alto para fechar a feature (contrato travado vermelho) | **Decisão do usuário.** A) emendar o teste (`toHaveBeenNthCalledWith(2, 'fonte-1', 1)` e `toBeGreaterThanOrEqual(2)`), regravar a trava e registrar aqui — recomendado; B) o agendador passa a espaçar mais as chamadas depois de um 429 (ex.: `gapMs` × 4 por um período) — comportamento novo não pedido pela spec, adotado só para caber na janela. Nenhum dos dois foi aplicado; o teste não foi editado. |
| R-014 | **Resolvido (T049, 2026-10-01): a spec foi emendada — FR-015/P3 vale só para erros com causa de rede/fonte/serviço; toasts de operação local ficam fora.** Texto original: **T040 não feita**: os "demais avisos" de P3 (toasts de favorito, histórico, ator, semelhantes, zapping) são avisos transitórios de operação **local**, sem causa de rede, sem ação e sem código na tabela (STO-01 já existe para espaço) — migrar para `describeError` não acrescenta causa/ação | Baixo | Os erros com causa de rede/fonte/serviço foram todos migrados (US3/US4 formulário). O `sdd-converge` decide se a spec FR-015 (P3) exige mais; se sim, vira task nova. |
| R-015 | O formulário `AddSourceScreen` só valida campos vazios; os 4 erros da conexão (endereço inválido, falha de conexão, recusa, incompatível) aparecem na `ImportProgressScreen`. Foi lá que ganharam código | Baixo | Resolvido: A spec dizia "formulário"; a tela certa é a de progresso (onde o erro de fato surge). `InvalidServerAddressError` é subclasse de `ProviderIncompatibleError`, então o fallback M3U não mudou. |
| R-017 | **Decisão (T047):** o "Verificar de novo" do `SourceAccessGate` NÃO foi tornado soft disabled offline — ele é, ele mesmo, a verificação de conectividade/conta; offline já cai no aviso "Não foi possível confirmar agora" (com `NET-02`). Soft disabled valeria para ações que só funcionam com internet e não a testam: Ressincronizar (Configurações, cartão de Perfis, "Ressincronizar lista" de Live/Filmes/Séries) | Baixo | Resolvido: `ErrorState` ganhou `softDisabledReason` (focável, motivo no nome, não dispara). |
| R-018 | **Decisão (T048):** `networkState.ts` virou um store compartilhado (`useSyncExternalStore`): uma fonte para `online`, `verifying` e `suspenso/retomado`. Eventos governam com consumidores montados; sem nenhum montado, `navigator.onLine` vence (como o `useState(() => navigator.onLine)` antigo) | Baixo | Resolvido: `connectionCheck` despacha `verify-start/done` e ainda emite o evento da janela para quem só o ouve (pré-carga). |
| R-016 | `npm run build:tizen` **não foi rodado**: ele reescreve `CCPlayTv/assets/index.js`, que já estava modificado e não commitado antes desta sessão. `npm run build` (tsc + vite) passou; nenhum arquivo emitido novo (nenhum Worker/fonte), então a guarda de `tizen_web_project.yaml` não tem o que reclamar | Baixo | Rodar `npm run build:tizen` ao commitar (como nas features anteriores). |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-01 | Fase 1 (Setup) | errorCatalog, networkState, verifyNetwork, `rate_limited` no conector (+ `ImportErrorKind`/mensagem da importação, ad-hoc) | — |
| 2026-10-01 | Fase 2 (Foundational) | `diagnosePlayback` (6 regras, lista branca) e `nextReconnect`; contratos 1–2 verdes | — |
| 2026-10-01 | Fase 3 (US1) | Reconexão e gate da retomada em `usePlayerSession`/teclado/`PlayerLayer`; banner só texto + item `connection` na topbar; TMDB não inicia oculto; Ressincronizar soft disabled offline; R-009..R-012 | Fase 5 (contrato 5) |
| 2026-10-01 | Fase 4 (US2) | Tela de erro do player com mensagem, código, ações do diagnóstico + Voltar, Info técnica, `onEditSource` ligado (App → Live/Início/Filme/Série); 4 testes antigos ajustados na entrada | — |
| 2026-10-01 | Fase 5 (US3) | 429 do painel/seção como dado; `errorCode` no carregador e nas telas de categoria; linha de estado do Início; códigos em SourceAccessGate e TMDB. **Contrato 5 vermelho (R-013)** | Decisão do usuário (R-013) |
| 2026-10-01 | Fase 6 (US4) | `InvalidServerAddressError` → `invalid_address`; códigos SRC-001/NET-02/SRC-401/SRC-422 na `ImportProgressScreen`; T040 fora (R-014) | — |
| 2026-10-01 | Fase 8 (Convergence) | concluída (T047–T051) |
| Fase 7 (Polish) | `e2e/rede-lifecycle-erros.mjs` (3 cenários, 25 verificações) em `test:e2e`; `test:e2e` completo verde; CLAUDE.md/backlog | Contrato 5; passada na TV (recomendada) |

**PRÓXIMO**: `/sdd-converge 042-rede-lifecycle-erros` (abertas: T046 passada na TV recomendada, `quickstart.md` cenário 5, `build:tizen` ao commitar — R-016).

## Arquivos Principais

- `tv-web/src/components/player/usePlayerSession.ts` (fase de erro com diagnóstico — Fase 4)
- `tv-web/src/components/PlayerLayer.tsx` e `player/usePlayerKeyboard.ts` (tela de erro nova)
- `tv-web/src/lib/player/playbackDiagnosis.ts`, `tv-web/src/lib/errors/errorCatalog.ts`
- `tv-web/src/components/PlayerErrorInfoPanel.tsx` (a criar)

## Cuidados para Retomada

- Ordem dos efeitos e refs de `PlayerLayer`/`usePlayerSession`: `sdd/specs/040-dividir-player-live/logic/divisao.md` §1.
- Os contratos de 020/027/029/031/041 também montam `PlayerLayer`; rode as travas ao fim de cada fase.

## Resultado Final

**Convergida em 2026-10-01** (`sdd-converge`, duas passadas: a 1ª achou 5 lacunas MEDIUM/LOW — viraram a Phase 8 —, a 2ª fechou sem achado).

**O que foi construído.** Estado de rede num store único (`lib/network/networkState.ts`: `online`, `verifying`, `suspenso/retomado`, com `navigator.onLine` só como sinal inicial) e `verifyNetwork`/`connectionCheck` para a verificação. No player: reconexão automática de um stream que **caiu** (≤ 3, 2/5/10 s, só com rede, VOD retoma da última posição, contador zera após 30 s estáveis), reusando o `setAttempt` do "Tentar de novo"; retomada do app oculto com `resumeGate` (só retomar é bloqueado; pausar e saltar não); tela de erro com mensagem, código e ações do `diagnosePlayback` (lista branca de erros do AVPlay, `PLAY-04` como saída segura) mais "Info técnica" de 5 campos. No shell: banner offline só texto e "Tentar de novo" como último item da `TopBar` (`TopbarItem` ganhou `connection`), "Ressincronizar" soft disabled offline (Configurações, Perfis, estados de erro de Live/Filmes/Séries via `ErrorState.softDisabledReason`). Tabela única `lib/errors/errorCatalog.ts`; HTTP 429 do painel virou `ProviderError('rate_limited')` e a pré-carga espera 60 s sem contar tentativa; erros da conexão de uma lista (`SRC-001/401/402/422`, `NET-02`) na tela de progresso da importação.

**Desvios em relação ao plano original** (todos registrados nos riscos): a retomada e o "Tentar de novo" do banner verificam só o sinal do aparelho, sem sonda de origem (R-009 — o contrato da 020 e a porta restrita de `readCredential` impedem); a reconexão só vale para stream que já tocou (R-010); 7 testes antigos de player ajustados na entrada (R-011); os 4 erros do formulário vivem na `ImportProgressScreen` (R-015); contrato 5 emendado com aprovação (R-013); FR-015/P3 emendado — toasts de operação local ficam fora (R-014/T049); `Verificar de novo` do `SourceAccessGate` não é soft disabled porque ele próprio é a verificação (R-017).

**Verificação.** 5/5 contratos travados e verdes; suíte 2279/2279; `tsc` limpo; lint 0 erros (54 avisos `react(refs)`, mesma categoria aceita na 040); 25/25 travas do repositório íntegras; `npm run build` ok; `npm run test:e2e` completo verde, incluindo o novo `e2e/rede-lifecycle-erros.mjs` (25 verificações).

**Ainda aberto (não bloqueia a convergência).** R-001/R-008: os nomes reais de erro do AVPlay e a reconexão numa queda de rede de verdade só a TV prova — passada **recomendada**, não gate (T046). R-016: `npm run build:tizen` não foi rodado (reescreveria `CCPlayTv/assets/index.js`, já modificado antes da sessão); rodar ao commitar.