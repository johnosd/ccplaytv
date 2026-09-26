# Implementation Plan: Ciclo de Vida do Player na TV

**Slug**: `020-ciclo-vida-player` | **Date**: 2026-09-26 | **Spec**: `sdd/specs/020-ciclo-vida-player/spec.md`

## Summary

Fecha o item 10 do backlog (última peça pendente da Fase 1 "MVP: do catálogo
real até assistir"): desligar a proteção de tela do sistema Tizen enquanto o
player está em reprodução ativa (US1), e tratar a ocultação do app
(`visibilitychange`) como uma pausa automática que revalida a URL de
reprodução ao voltar (US2). Tudo vive dentro de `PlayerLayer.tsx` — a única
camada de reprodução compartilhada por Live TV, Filmes e Séries (feature
011/016) — sem tocar nenhuma tela consumidora.

A decisão técnica central (D-002 abaixo) resolve uma tensão que a spec não
podia ver sem olhar o código: "pausar automaticamente" (FR-003) pressupõe uma
capacidade de pausa que **canal ao vivo não tem** (`mediaCapabilities
('channel').canPause === false`, decisão já tomada pela feature 011 — uma
transmissão sem DVR não tem pausa real, constitution "Progresso e
Capacidades São Reais"). Para canal, "pausar" se traduz em fechar a sessão
(mesmo efeito de RETURN); para filme/episódio, é uma pausa real que mantém a
camada aberta. Isso não contraria a spec — o Edge Case "a revalidação só
acontece se ainda existir uma sessão de player aberta" já antecipava
exatamente essa bifurcação.

## Technical Context

**Language/Version**: TypeScript 5 / React 19, mesmo stack de `tv-web/` (sem mudança)

**Primary Dependencies**: nenhuma nova. Reaproveita `PlayerService`/
`PlayerServiceSession` (feature 011), `fetchPlayback` (`catalogApi.ts`), a
API padrão do navegador `document.visibilitychange`/`document.
visibilityState` (disponível em Chromium 108 e em desenvolvimento desktop), e
a API Tizen `tizen.power` (só existe na TV real — feature-detectada, mesmo
padrão de `hasAvplay()`).

**Storage**: nenhuma. Sem migração de schema Dexie, sem entidade nova.

**Testing**: Vitest + Testing Library (o padrão já usado por `PlayerLayer.
test.tsx`), Playwright (E2E, Polish).

**Target Platform**: mesmo alvo do projeto (Tizen 8.0 / Chromium 108,
`tv-web/`). O comportamento real de `tizen.power` (proteção de tela
efetivamente desligando/religando) só é observável na TV física — a spec já
marca isso como recomendado, não bloqueante (mesmo padrão das features
011/012/019).

**Performance Goals**: N/A — duas chamadas síncronas de API por transição de
estado, mais um único `fetchPlayback` leve ao voltar a ficar visível (mesmo
custo de rede que abrir o item já tem hoje). Nenhum overhead perceptível.

**Constraints**: nunca deixar áudio residual com o app oculto (FR-007); a
revalidação de URL nunca dispara fora de uma sessão de player aberta
(FR-008); "pausar" para canal ao vivo não é uma capacidade real disponível —
tratado como fechamento de sessão (D-002), não como pausa fingida.

**Scale/Scope**: 1 arquivo novo pequeno (`screenSaver.ts`, wrapper de 2
chamadas Tizen), `PlayerLayer.tsx` ganha 2 efeitos + os handlers de
`visibilitychange` dentro do efeito de ciclo de vida já existente. Nenhuma
tela nova, nenhum componente novo, nenhuma prop nova em `PlayerLayerProps`.

## Decisões Invariantes

- **D-001**: Toda a lógica desta feature vive dentro de `PlayerLayer.tsx` —
  nunca duplicada por tela (Live TV/Filmes/Séries continuam sem saber que
  isso existe, mesmo padrão de `onIdleSelect`/`onEnteredPlaying`, que já
  vivem só ali).
- **D-002** (a decisão técnica central): "pausar automaticamente ao ocultar"
  (FR-003) usa `session.togglePause()` quando `session.capabilities.
  canPause` é verdadeiro (filme/episódio) — pausa real, sessão continua
  aberta, pronta para retomar com SELECT como já funciona hoje. Quando
  `canPause` é falso (canal ao vivo — decisão já tomada pela feature 011/
  `capabilities.ts`, `mediaCapabilities('channel')` nega tudo), NÃO existe
  uma pausa de verdade pra chamar: a única forma de garantir "sem áudio
  residual" (FR-007) é fechar a sessão inteira (`session.close()` primeiro,
  garantindo que o motor pare de fato antes de qualquer re-render, depois
  `onClose()` pra notificar quem montou a camada) — exatamente o mesmo
  efeito de RETURN hoje. Ao voltar a ficar visível, não há reabertura
  automática do canal (não há posição pra retomar, `reportsPosition` também
  é `false` pra canal) — a pessoa reabre normalmente pela tela de origem.
  Consistente com o Edge Case já escrito na spec: "a revalidação da URL só
  acontece se ainda existir uma sessão de player aberta" — pra canal, depois
  de fechar, não existe mais.
- **D-003**: A revalidação da URL (FR-004) é uma chamada de **confirmação**,
  nunca uma reconstrução de sessão. Ao voltar a ficar visível com uma sessão
  ainda aberta (só acontece pra filme/episódio pausado, por D-002 — canal já
  fechou), o sistema chama `fetchPlayback(itemId)` de novo e **descarta o
  resultado se a chamada resolver** — a sessão pausada existente (adaptador/
  motor já aberto) permanece intocada, pronta pra retomar com SELECT no
  MESMO adaptador (`togglePause()` → `resume()`, sem URL nova, sem
  `startAtMs` recalculado). Só se a chamada **rejeitar** (item não mais
  reproduzível, credencial expirada) é que a tela transiciona pro estado de
  erro já existente (FR-005), reaproveitando o mesmo bloco `catch` que
  `start()` já usa ao abrir a sessão pela primeira vez — nenhum estado de
  erro novo, nenhuma mensagem nova. Rejeitada deliberadamente: reconstruir a
  sessão inteira (bump de `attempt`) reabriria a mídia já tocando
  automaticamente, violando a spec ("a camada de player continua... pausada
  ... antes de qualquer nova tentativa de retomar", US2 AC2).
- **D-004**: Proteção de tela é um `useEffect` separado do ciclo de vida da
  sessão, keyed em `phase.kind === 'session' && phase.state === 'playing'`
  — desliga ao entrar nesse estado, religa no cleanup do efeito (cobre
  pausar, completar, erro, fechar E desmontar, todos num só lugar, sem
  listar cada transição manualmente). O zapping (feature 016) não pausa a
  sessão do canal (continua tocando por baixo da lista sobreposta), então
  esse efeito permanece desligado durante o zapping por construção, sem
  código extra — fecha a US1 AC3 de graça.
- **D-005**: `tv-web/src/lib/player/screenSaver.ts` (novo, já escrito por
  este plano — módulo trivial, sem ambiguidade de design a deixar pro
  execute): `disableScreenSaver()`/`enableScreenSaver()` chamando
  `tizen.power.request('SCREEN', 'SCREEN_NORMAL')`/`.release('SCREEN')`, com
  cast local (`window as unknown as {tizen?: ...}`) — **nunca** `declare
  global` sobre `Window.tizen`, porque isso invalidaria os `@ts-expect-
  error` que `tizenColorKey.test.ts`/`tizenExit.test.ts` já têm sobre
  acessar essa propriedade sem cast (achado real durante este plano: a
  primeira versão com `declare global` quebrou `tsc -b` nesses dois
  arquivos — corrigido antes de travar o contrato). Nenhuma chamada lança:
  sem `tizen.power` (dev/desktop), os dois viram no-op.
- **D-006**: O listener de `visibilitychange` é registrado **dentro** do
  `useEffect` de ciclo de vida da sessão já existente (o que hoje faz
  `start()`/`teardown()`, dependências `[itemId, attempt, createAdapter]`)
  — não um efeito novo — porque só faz sentido existir enquanto uma sessão
  está viva, e reaproveita exatamente o `return () => {...}` de limpeza que
  já existe, sem risco de acumular listeners entre re-renders (edge case da
  spec: "ocultar e mostrar o app repetidamente... nunca acumula múltiplas
  revalidações concorrentes nem múltiplos listeners").

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | não tocado |
| Segredos Fora dos Clientes e dos Logs | PASS | PASS | a revalidação usa `fetchPlayback`, que já sanitiza; nenhum log novo, nenhuma URL exposta |
| Categorias da Fonte São Preservadas | N/A | N/A | não tocado |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | não tocado |
| Comandos Locais Independem de Rede, Backend ou IA | PASS | PASS | proteção de tela é 100% local; a revalidação de URL é a única chamada de rede desta feature, e só dispara num evento explícito de `visibilitychange` com sessão aberta — nunca em navegação normal (FR-008) |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | N/A | N/A | não tocado |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | PASS | PASS | nenhuma ação nova de controle remoto — os comportamentos são automáticos, sem elemento focável novo necessário |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | não tocado |
| Foco Visível e Sem Becos Sem Saída | PASS | PASS | fechar a sessão de canal ao ocultar (D-002) devolve o foco pra tela de categoria já existente, que já tem foco válido; revalidação com erro cai no estado de erro já existente, com foco navegável |
| Voltar Restaura Foco e Posição | PASS | PASS | não introduz navegação nova; fechar por ocultação de canal é equivalente a RETURN, já tratado pela tela consumidora |
| Identidade de Reprodução Não Depende da URL | PASS | PASS | revalidação não cria identidade nova; reaproveita `itemId`/`stableId` já existentes |
| Progresso e Capacidades São Reais, Nunca Prometidos | PASS | PASS | núcleo da D-002 — "pausar" nunca é fingido pra canal, que não tem essa capacidade real; resolvido fechando a sessão em vez de simular uma pausa que a mídia não suporta |
| Documentação do Repositório É Canônica | PASS | PASS | `CLAUDE.md` ganha parágrafo no Polish, mesmo padrão de toda feature anterior |

Nenhuma violação não-justificada. `## Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/020-ciclo-vida-player/
├── spec.md
├── plan.md                    # este arquivo
├── tasks.md
└── contract-tests.lock        # criado no passo 7.5
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── lib/
│   │   └── player/
│   │       ├── screenSaver.ts                              # NOVO — wrapper tizen.power, feature-detect
│   │       ├── PlayerService.ts                             # intocado (só consumido)
│   │       └── capabilities.ts                              # intocado (só consumido — canPause/reportsPosition)
│   └── components/
│       ├── PlayerLayer.tsx                                  # + efeito de screensaver, + visibilitychange no efeito de sessão
│       ├── PlayerLayer.test.tsx                              # intocado, sem regressão
│       └── PlayerLayer.ciclo-vida-player.contract.test.tsx  # NOVO — testes de contrato (travados)
├── e2e/
│   └── ciclo-vida-player.mjs                                 # novo roteiro E2E (Polish)
```

**Structure Decision**: mesma estrutura já usada pelas features 011/012/016
— nenhum diretório novo. `screenSaver.ts` fica ao lado de `resumePolicy.ts`/
`progressRecorder.ts` em `lib/player/`, mesmo espírito de módulo puro/
pequeno sem React. Toda a orquestração fica em `PlayerLayer.tsx`, a única
camada de reprodução do projeto — nenhuma tela consumidora (`LiveScreen.tsx`,
`MovieDetailScreen.tsx`, `SeriesDetailScreen.tsx`) precisa de mudança.

## Complexity Tracking

*(vazio — nenhuma violação a justificar)*

## Estratégia de Testes

Prioridade: unitário → contrato/componente → E2E → manual (último recurso,
reservado ao comportamento real de `tizen.power` na TV física).

Comandos-base (em `tv-web/`):

```powershell
npx tsc -b
npx vitest run
npm run lint
npm run build
```

### Testes de Contrato

Orçamento de 5 disponível; usado **4**. O quinto candidato óbvio — "conclusão
detectada enquanto o app estava oculto é tratada como conclusão normal"
(FR-006) — **não vira contrato**: o mecanismo de conclusão em `publish()`
(`PlayerLayer.tsx`) já é inteiramente agnóstico de `document.
visibilityState` (não checa nem nunca checou visibilidade em lugar nenhum),
então esse comportamento já está garantido pelo código existente, sem
depender de nenhuma linha nova desta feature — testá-lo aqui não provaria
nada que o `PlayerLayer.test.tsx` já não prove sobre conclusão (regra do
sdd-plan: teste que já passa antes do execute é reescrito ou removido).
Registrado como observação no Polish, não como contrato.

Arquivo travado em `contract-tests.lock`:
`tv-web/src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx`

Comando (rodar de dentro de `tv-web/`):
`npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| "desliga a proteção de tela ao entrar em playing; religa ao pausar" | FR-001/FR-002, US1 AC1-2 | Fase 2 (Screensaver) | asserção: `disableScreenSaver`/`enableScreenSaver` nunca chamados (`PlayerLayer.tsx` ainda não os importa) |
| "app oculto pausa um filme (capaz de pausar) sem fechar a sessão" | FR-003, US2 AC1, D-002 (ramo `canPause`) | Fase 3 (Visibilitychange) | asserção: `driver.pauseCount` continua `0` (nenhum listener de `visibilitychange` registrado ainda) |
| "app oculto fecha a sessão de canal ao vivo, que não tem pausa real" | FR-003/FR-007, D-002 (ramo canal) | Fase 3 (Visibilitychange) | asserção: `driver.closeCount` continua `0` e `onClose` nunca chamado |
| "app volta a ficar visível: revalida a URL e mostra o erro existente se falhar" | FR-004/FR-005, US2 AC2-3, D-003 | Fase 3 (Visibilitychange) | asserção: `fetchPlayback` nunca chamado uma segunda vez; texto de erro nunca aparece |

Stubs criados por este plano (ponto de partida do execute, **já implementado
por inteiro** — módulo trivial sem decisão de design a deixar em aberto,
mesmo espírito de `MOVIE_WATCHED_RATIO` na feature 019):
`tv-web/src/lib/player/screenSaver.ts` (`disableScreenSaver`/
`enableScreenSaver`, funcionais, feature-detectados). O que falta é só a
**orquestração** em `PlayerLayer.tsx` — chamar essas funções e registrar o
listener de `visibilitychange` nos pontos certos — que é o que os 4
contratos cobram.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup | Fase 1 concluída — baseline confirmado (`tsc -b` 0 erros, 4 contratos vermelhos pelo motivo certo, trava íntegra) |
| US1 — Proteção de tela | Fase 2 concluída — `useEffect` keyed em `phase.state==='playing'` liga/desliga `disableScreenSaver`/`enableScreenSaver` (D-004); confirmado que zapping (feature 016) não religa a proteção de tela, por construção |
| US2 — Visibilitychange | Fase 3 concluída — `onVisibilityChange` registrado dentro do efeito de ciclo de vida já existente (D-006): oculto pausa (filme/episódio, `canPause`) ou fecha a sessão (canal, D-002), guardado por `isActive` pra nunca agir sobre uma sessão já parada; visível revalida via `fetchPlayback` (D-003), caindo no erro existente (`applyFetchError`, extraída do `catch` original) se falhar |
| Polish | Fase 4 concluída — E2E `ciclo-vida-player.mjs` (8 asserções, mock de `tizen.power` injetado via `page.addInitScript`) confirmado estável em 4 execuções; gates completos rodados (`tsc -b`, `vitest run`, `lint`, `build`, `test:e2e`); `CLAUDE.md` atualizado |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A API Tizen exata para controlar a proteção de tela (o guia consultado, `06_player_de_midia.md`, só recomenda "desligar screensaver", sem citar a assinatura) foi escolhida como `tizen.power.request('SCREEN','SCREEN_NORMAL')`/`.release('SCREEN')` — a API padrão Tizen de gerência de energia para "manter a tela ligada", amplamente documentada em amostras Samsung/Tizen para este exato propósito | Médio — se a API real da TV usar outro nome/assinatura, a chamada falha silenciosamente (try/catch mudo) e a proteção de tela simplesmente não desliga, sem quebrar a reprodução | A spec já marca a verificação real na TV física como recomendada, não bloqueante (mesma exceção usada pelas features 011/012/019). Se a TV física mostrar que a API está errada, é uma correção isolada em `screenSaver.ts`, sem tocar `PlayerLayer.tsx` |
| R-002 | Descoberto durante este plano: uma primeira versão de `screenSaver.ts` usava `declare global` sobre `Window.tizen`, o que invalidou os `@ts-expect-error` de `tizenColorKey.test.ts`/`tizenExit.test.ts` (`tsc -b` passou a reportar `TS2578: Unused '@ts-expect-error' directive`) | Baixo — pego antes de travar o contrato, corrigido na hora | Resolvido: `screenSaver.ts` usa cast local (`window as unknown as {tizen?: ...}`), mesmo padrão já estabelecido por `tizenColorKey.ts`/`tizenExit.ts` — nenhuma declaração global nova sobre `Window` |
| R-003 | D-002 muda o comportamento observável de "pausar ao ocultar" para canal ao vivo especificamente: em vez de uma pausa real (que a mídia não suporta — `canPause=false`), fecha a sessão inteira. A spec descreve US2 de forma uniforme para os três tipos de mídia, sem essa distinção explícita | Baixo — decisão technical bem fundamentada na Constitution ("Progresso e Capacidades São Reais") e no Edge Case já escrito na spec ("revalidação só acontece se ainda existir sessão aberta"), não uma reinterpretação de escopo | Documentado com destaque no relatório final do `sdd-plan` para o usuário confirmar se concorda; se não concordar, é uma revisão local de D-002, sem impacto no restante do design |
| R-004 | Achado durante T005 (Fase 3): chamar `session.togglePause()` às cegas em `onVisibilityChange` retomaria uma sessão que a pessoa já tinha pausado manualmente antes de ocultar o app (o `toggle` olha o estado atual — `paused` → chamaria `resume()`), contrariando o próprio edge case que a spec já citava | Médio — sem o guard, ocultar o app com o filme já pausado manualmente faria o vídeo voltar a tocar em segundo plano, exatamente o que FR-007 proíbe | Resolvido: `onVisibilityChange` só age no ramo oculto quando `session.state === 'playing' \|\| 'buffering'` (`isActive`) — uma sessão já parada (pausada, erro, concluída, fechada) nunca sofre nova ação |
| R-005 | Achado durante T009 (E2E): o adaptador `<video>` de desenvolvimento, com `autoplay` e uma URL cuja requisição de rede fica pendente pra sempre (padrão de todo script E2E deste repositório, pra nunca deixar o `<video>` errar sozinho em corrida com eventos sintéticos), nunca chega a iniciar reprodução de verdade — `.paused` nasce `true` e permanece assim, e o evento nativo `pause` nunca dispara, mesmo quando `session.togglePause()`/`adapter.pause()` são chamados de verdade | Baixo — não afeta o código de produção, só invalidou a estratégia inicial de asserção do E2E (checar `.paused`) | Resolvido: o script (`ciclo-vida-player.mjs`) passou a verificar pausa (filme, D-002 ramo pausável)/fechamento (canal, D-002 ramo canal) pela presença ou ausência da camada de player no DOM (`[role="dialog"]`), um sinal confiável já usado por todos os outros scripts E2E do projeto — o pause/resume real via `togglePause()`/`adapter.resume()` continua coberto pelos testes de contrato (adaptador fake controlável, sem essa limitação) |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-26 | Fase 1 (Setup) | Baseline confirmado: `tsc -b` 0 erros; 4 contratos vermelhos pelo motivo certo (asserção); trava íntegra. | Nenhuma |
| 2026-09-26 | Fase 2 (US1 — Proteção de tela) | `screenSaver.ts` já existia (escrito pelo plan); `PlayerLayer.tsx` ganhou o `useEffect` de D-004. Teste adicional (T003) confirma que zapping não religa a proteção de tela. 1/4 contrato verde (o de screensaver). | Nenhuma |
| 2026-09-26 | Fase 3 (US2 — Visibilitychange) | `onVisibilityChange` implementado dentro do efeito de sessão já existente (D-006); `applyFetchError` extraída do `catch` de `start()` pra ser reaproveitada pela revalidação (D-003). Guard `isActive` (achado durante a task, não estava em prosa no plano) evita `togglePause()` retomar uma sessão já pausada manualmente. 4/4 contratos verdes. Suíte completa das áreas tocadas: 231/233 sob paralelismo (2 falhas de `SeriesScreen.favorites.test.tsx`, confirmadas 233/233 isoladas — flakiness pré-existente, não desta feature). | Nenhuma |
| 2026-09-26 | Fase 4 (Polish) | E2E `ciclo-vida-player.mjs` criado — achado real (R-005): o `<video>` de dev nunca toca de verdade neste tipo de fixture, `.paused` inútil pra provar pausa; script corrigido pra verificar pela presença/ausência da camada no DOM, estável em 4 execuções (8/8). Gates completos: `tsc -b` 0 erros, `vitest run` 737/739 (2 flakiness pré-existente confirmada isolada), `lint`/`build` limpos, `test:e2e` documentado honestamente (bloqueio pré-existente em `e2e.mjs`, limitação de path em 2 scripts antigos no Windows, 1 flake ambiental sob carga pesada em `historico-continuar-assistindo.mjs` confirmado não-regressão). `CLAUDE.md` atualizado. | `quickstart.md`/verificação em TV física não executado (não é gate obrigatório) |

**PRÓXIMO**: Todas as tasks concluídas — feature pronta para `sdd-converge`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/player/screenSaver.ts`
- `tv-web/src/components/PlayerLayer.tsx`
- `tv-web/src/components/PlayerLayer.test.tsx`
- `tv-web/src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx`
- `tv-web/e2e/ciclo-vida-player.mjs`
- `tv-web/e2e/fixtures/ciclo-vida-player.m3u`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Nunca declarar `Window.tizen` globalmente (`declare global`) em nenhum
  módulo novo deste projeto — quebra os `@ts-expect-error` de
  `tizenColorKey.test.ts`/`tizenExit.test.ts` (achado real durante este
  plano, R-002). Sempre usar cast local, como `screenSaver.ts` já faz.
- `document.visibilityState` em jsdom precisa de
  `Object.defineProperty(document, 'visibilityState', {value, configurable:
  true})` antes de disparar `document.dispatchEvent(new Event
  ('visibilitychange'))` — a propriedade não é gravável por atribuição
  direta.
- E2E com o `<video>` de desenvolvimento: nunca confiar em `.paused`/`.
  currentTime` reais quando a URL da fixture fica com requisição de rede
  pendente pra sempre (padrão usado por todo `e2e/*.mjs` deste repositório)
  — o elemento nunca chega a tocar de verdade, `.paused` nasce `true` e fica
  assim, e eventos nativos (`pause`) nunca disparam (R-005). Verificar
  comportamento pela presença/ausência da camada (`[role="dialog"]`) no DOM,
  nunca pela mecânica nativa de mídia.
- Rodar a suíte inteira de testes com `--no-file-parallelism` (não é o
  comando exigido pela Estratégia de Testes, só uma checagem extra) pode
  levar dezenas de minutos e expor um artefato de timers fake não
  relacionado ao código sob teste — prefira isolar só os arquivos que
  falharam sob paralelismo normal, como as features anteriores já fazem.

## Resultado Final

<!-- Anexado pelo sdd-converge ao fechar a feature limpa. -->

Convergência limpa em 2026-09-26 — nenhum achado. As duas user stories (US1
proteção de tela, US2 visibilitychange) foram construídas exatamente como
desenhado, inteiramente dentro de `PlayerLayer.tsx`, sem tocar nenhuma tela
consumidora (Live TV, Filmes, Séries). Os 4 testes de contrato passam sem
atalho — confirmado lendo o código de produção que os satisfaz (`onVisibility
Change`, o efeito de screensaver), nenhuma lógica condicionada aos valores
exatos dos testes.

Dois desvios reais em relação ao design inicial da spec, ambos capturados
como decisões técnicas durante o `sdd-plan`/`sdd-execute`, não como
correções de bug:

- **D-002** (já no plano original, não um desvio de execução): canal ao vivo
  não tem capacidade de pausa real (`canPause=false`, decisão pré-existente
  da feature 011) — "pausar ao ocultar" só existe de fato para filme/
  episódio; para canal, o comportamento observável é fechar a sessão
  inteira, como RETURN. A spec descrevia US2 de forma uniforme para os três
  tipos; **isso permanece uma decisão técnica não confirmada explicitamente
  pelo usuário** (R-003, aberto) — o mecanismo está correto e testado, mas
  vale uma palavra do usuário se esse comportamento (fechar em vez de
  pausar) for percebido como uma surpresa na TV física.
- **R-004** (achado real durante a execução, T005): `session.togglePause()`
  chamado às cegas em `onVisibilityChange` teria RETOMADO uma sessão que a
  pessoa já tinha pausado manualmente antes de ocultar o app — corrigido com
  o guard `isActive`, que a spec não previa explicitamente em prosa, mas que
  decorre diretamente de FR-003 ("reprodução ATIVA") e do próprio edge case
  que a spec já citava.

Uma limitação estrutural do ambiente de teste (R-005, não do código de
produção) obrigou o E2E a verificar pausa/fechamento pela presença/ausência
da camada de player no DOM, em vez de `.paused` do `<video>` — o elemento de
desenvolvimento nunca chega a tocar de verdade quando a URL fica com
requisição de rede pendente pra sempre (padrão de todos os scripts E2E deste
repositório).

**Riscos ainda abertos, conscientemente não fechados por esta convergência**
(nenhum dos dois é verificável por auditoria de código — cada um só se
fecha por um evento externo específico, não por uma correção):

- **R-001**: a API `tizen.power.request('SCREEN','SCREEN_NORMAL')`/
  `.release('SCREEN')` escolhida para controlar a proteção de tela é a API
  padrão Tizen mais documentada para esse fim, mas não foi confirmada contra
  o comportamento real da TV — só a verificação física fecha isso.
- **R-003**: a decisão de fechar (em vez de pausar) a sessão de canal ao
  vivo ao ocultar o app está bem fundamentada tecnicamente, mas não foi
  explicitamente confirmada pelo usuário como o comportamento desejado —
  só uma palavra direta do usuário fecha isso.

Nenhuma mudança no `README.md` do projeto — a feature é polimento de
qualidade (screensaver, ciclo de vida do player) que não aparece na lista de
visão de alto nível do README, e não contradiz nenhuma frase já existente
nele.
