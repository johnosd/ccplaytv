# Handoff — 042-rede-lifecycle-erros (para o `sdd-execute`)

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Stack: React 19 + TS + Vite em `tv-web/` (Tizen Smart TV; `api/` congelado, não tocar).
- Próximo comando: **`/sdd-execute 042-rede-lifecycle-erros`** (Fase 1).
- Backlog: itens **61 + 19** → `Planejada`. A feature irmã `043-gostei-filmes-series` está só `Especificada` (sem plano); **não depende desta**.
- Arquivos que mudaram fora desta sessão e valem ser relidos: `.planning/backlog.md` (linhas 61/19/27 trocadas de `Pronto` para `Especificada`).

## O que a feature entrega

- **US1 (P1)**: reconexão automática do stream (≤ 3, 2/5/10 s, só com rede, VOD retoma da última posição); app oculto → voltando **sem rede** o filme fica pausado e não retoma até verificar; banner offline com ação **alcançável pelo controle remoto** (item `'connection'` da topbar).
- **US2 (P1)**: tela de erro do player com causa, **código** e ≤ 3 ações; "Info técnica" de 5 campos, sem URL/credencial.
- **US3 (P2)**: mesma taxonomia em categoria/fonte/EPG/TMDB/trailer; **429 do painel** pausa a pré-carga 60 s.
- **US4 (P3)**: demais avisos + 4 erros do formulário de lista (IME fica no item 18).
- Decisões que contrariam o óbvio: o rótulo continua **"Tentar de novo"** (não "Tentar novamente"); códigos **existentes** (`EPG-02`, `STO-01`, `TRL-*`, `YT-n`) **não** são renomeados; `OfflineBanner` perde o botão (vira só texto).

## Leitura obrigatória, em ordem

1. `spec.md` — 21 FR, 7 SC, 4 stories.
2. `plan.md` — D-001..D-012, Constitution Check, R-001..R-008.
3. `tasks.md` — 46 tasks em 7 fases.
4. `logic/rede-e-lifecycle.md` — estados, `verifyNetwork`, reconexão (§3), retomada/gate (§4), 429 (§5).
5. `logic/erros-acionaveis.md` — tabela de códigos, 6 regras do diagnóstico, tela de erro, migração por ondas.
6. `quickstart.md`.
7. `.planning/memory/constitution.md` e `sdd/specs/040-dividir-player-live/logic/divisao.md` §1 (refs, ordem de efeitos).

## Testes de contrato (5/5 travados, vermelhos)

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/player/playbackDiagnosis.rede-lifecycle.contract.test.ts` | 2 | Fase 2 |
| `tv-web/src/components/PlayerLayer.rede-lifecycle.contract.test.tsx` | 2 | Fase 3 |
| `tv-web/src/lib/catalog/prefetch/prefetchScheduler.rede-lifecycle.contract.test.ts` | 1 | Fase 5 |

- Rodar: `npx vitest run <os três arquivos>` (de `tv-web/`).
- Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 042-rede-lifecycle-erros`.
- **Nunca editar** esses arquivos.
- Travas de outras features que esta mexe e pode quebrar: **020, 027, 029, 031, 041** (montam `PlayerLayer`), **023, 024, 026** (topbar/shell), **030, 032, 033, 038** (EPG/TMDB/trailer/pré-carga), **034, 036, 037** (fontes/formulário). Rodar `check-contract-tests.ps1 -Slug <slug>` ao fim de cada fase.

## Stubs criados (não travados)

- `tv-web/src/lib/player/playbackDiagnosis.ts` — tipos reais, `diagnosePlayback` lança `not implemented` (T006).
- `tv-web/src/lib/player/reconnectPolicy.ts` — **constantes reais** (`RECONNECT_DELAYS_MS`, `RECONNECT_STABLE_MS`, os contratos as importam; não mudar valores); `nextReconnect` lança (T008).
- `tv-web/src/lib/network/verifyNetwork.ts` — lança (T003). Os contratos o **mockam** por esse caminho exato.
- `tv-web/src/lib/catalog/prefetch/prefetchScheduler.ts` — `'rate_limited'` no tipo, `RATE_LIMIT_PAUSE_MS = 60_000` e `pausedReason?` já adicionados; o **comportamento** falta (T031).

## Armadilhas já mapeadas

- **AVPlay é singleton**: reconectar = `setAttempt` do efeito existente (fecha antes de abrir). Nunca criar uma segunda sessão nem um efeito novo em `usePlayerSession` (ordem de efeitos da 040).
- **Refs, não state** para o que o teclado lê (`resumeGateRef`, `resumeAtRef`…): `sessionRef` muda de forma síncrona, e `state` lê o render anterior (lição da 027).
- Zerar `resumeAtRef` ao trocar `itemId` — senão a posição de um canal/episódio vaza para o próximo.
- Contador de tentativas só zera após **30 s** em `playing`; zerar no 1º `playing` faz um stream que oscila reconectar para sempre.
- O **botão do banner só respondia a clique** (a TV não o alcança); por isso o item `'connection'` na `TopBar`. A `TopBar` lê `useOnlineStatus()` sozinha — os 7 consumidores não mudam de assinatura. `TopbarItem` tem ~56 usos: o `tsc` aponta os pontos exaustivos (R-005). Foco em `'connection'` com a rede de volta → `'home'`.
- `OfflineBanner.test.tsx` e `AppShell.test.tsx` (não travados) afirmam "Testar conexão": **atualizar por decisão**, não por regressão.
- A origem para `verifyNetwork` é `new URL(playback.url).origin` calculada na hora (o `.origin` já descarta usuário/senha); nunca guardar, logar nem exibir.
- HTTP **429** do painel hoje vira `ProviderIncompatibleError('status 429')` (erro de classificação) → T004 cria `ProviderError('rate_limited')`.
- Mensagens de `genericErrorMessage`/`unavailableMessage` do `PlayerLayer` são afirmadas por testes de Live/Filmes/Séries: ficam para `unknown`/409.
- A tela de erro do player **não** reaproveita `ErrorState` (1–2 ações); mantém `.player-message`/`.player-action`.
- `Modal` não recebe tecla dentro do player (o layer captura o teclado): "Info técnica" é estado do próprio `PlayerLayer`.
- Nomes de erro do AVPlay (R-001): lista branca em **um** `const`; fora dela é `PLAY-04`. Não inventar nomes.
- Flakes conhecidos sob paralelismo: `*.favorites.test.tsx`, `LiveScreen.test.tsx` — confirmar isolados.
- E2E: reiniciar o dev server antes; o `executablePath` do Chromium nos `e2e/*.mjs` é o do sandbox Linux (override temporário no Windows).

## Pendências do Analyze

| ID | Sev | Resumo | Recomendação |
| --- | --- | --- | --- |
| A1 | MEDIUM | FR-003 pede "banner dentro do player"; o plano resolve offline no player pela tela `NET-01` (sem reconexão automática offline) — não há banner sobre o vídeo | Aceitar: a tela de erro `NET-01` com "Tentar de novo" **é** o aviso do player; registrar em Execution Notes na Fase 3 |
| A2 | MEDIUM | FR-005 ("suspender timers") está coberto só para reconexão e TMDB (D-009); o auto-hide do chrome e o toast continuam rodando oculto | Aceitável (não fazem chamada externa); confirmar no `/sdd-converge` |
| A3 | MEDIUM | FR-004 (soft disabled offline) só tem task nas Configurações (T019); nenhuma outra tela hoje tem ação puramente de rede além do TMDB | Revisar no converge se surgir outra |
| A4 | LOW | Spec diz "Tentar novamente"; implementação usa "Tentar de novo" (D-012) | Sem ação; registrado |
| A5 | LOW | Nenhum contrato cobre o item `'connection'` da `TopBar` (orçamento de 5) | Coberto por T021 e pelo E2E (T043) |

## Gate de pronto

- 5/5 contratos verdes + todas as travas íntegras.
- `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build:tizen` limpos; `npm run test:e2e` verde (novo `e2e/rede-lifecycle-erros.mjs`, T043).
- `quickstart.md` executado.
- Docs no Polish: `CLAUDE.md` (parágrafo da 042), `.planning/backlog.md` (61/19), `plan.md` (Estado Atual/Resultado).
- Passada na TV: **recomendada, não gate** (R-001/R-008) — a spec não declarou exceção de hardware.
