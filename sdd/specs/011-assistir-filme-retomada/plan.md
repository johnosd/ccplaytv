# Implementation Plan: Assistir Filme, com Retomada

**Slug**: `011-assistir-filme-retomada` | **Date**: 2026-09-23 | **Spec**: `sdd/specs/011-assistir-filme-retomada/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Hoje o app navega um catálogo real de filmes e **não reproduz nenhum**: o
"Assistir" do detalhe dispara um toast. A abordagem é estender o
`PlayerService` existente com um **contrato de capacidades resolvido por
sessão** (motor ∩ mídia), promover a camada de reprodução de `features/live/`
para `src/components/` e ligá-la ao `MovieDetailScreen`, gravando progresso no
`userStateRepository` — que existe desde a feature 008 e nunca teve consumidor.

Três peças sustentam o desenho, todas derivadas de código já existente:

1. `resolvePlaybackUrl` já monta URL de filme, e `fetchPlayback` já devolve o
   `kind` real — o comentário dele antecipa este uso (`catalogApi.ts:309`).
2. `rendersOnHardwarePlane` já é uma capacidade declarada lida pela UI sem
   saber o motor. O contrato novo estende esse padrão em vez de criar outro.
3. A camada de reprodução já é uma **camada**, não uma rota: a tela de baixo
   permanece montada, e é isso que devolve o foco sem estado de navegação.

O que **não** existe e precisa ser criado: pausa, busca, posição e duração no
`PlayerAdapter` (hoje só `open`/`close`), o estado `completed`, e a tradução
de fim de mídia — que hoje o adaptador AVPlay traduz para **erro**, correto
para canal ao vivo e errado para filme.

## Technical Context

**Language/Version**: TypeScript 5.9 / React 19.2, compilado por Vite com
alvo `chrome108` (o engine da TV de referência; o padrão do Vite 8 é
Chrome 111 e não serve).

**Primary Dependencies**: nenhuma nova. `@tanstack/react-query` ^5.102.8
(estado servidor), `dexie` ^4.4.6 (IndexedDB). `@tanstack/react-virtual` não é
tocada por esta feature.

**Storage**: IndexedDB via Dexie. **O schema não muda** — permanece na v7. A
decisão de não persistir duração está em `research.md` R0-5.

**Testing**: `vitest` (`npx vitest run`), com `@testing-library/react` e
`fake-indexeddb` no padrão já usado por `LiveScreen.test.tsx` e
`userStateRepository.test.ts`.

**Target Platform**: Samsung QN50Q60DAGXZD, Tizen 8.0 / Chromium 108. Motor de
reprodução `webapis.avplay`; adaptador `<video>` só para desenvolvimento.

**Performance Goals**: a gravação de progresso não pode competir com a
decodificação de vídeo — um `put` por chave primária a cada 5 s, em transação
curta, numa tabela (`userStates`) que nenhuma outra escrita da feature 010
toca. Salto por tecla mantida pressionada não pode acumular chamadas
sobrepostas à API do motor (`research.md` R0-1).

**Constraints**: Direct Play — nada proxia ou transcodifica. Nenhum backend
(ADR-008). Segredos nunca em mensagem, rótulo ou log. Controles refletem
capacidade real do motor. Todo estado alcançável por controle remoto.

**Scale/Scope**: um filme por sessão, uma sessão por vez, um aparelho.

## Decisões Invariantes

- **D-001 — Capacidade é resolvida por sessão, não por adaptador.**
  `capacidades = capacidadesDoMotor ∩ capacidadesDaMídia`. O mesmo AVPlay
  serve canal ao vivo e filme; só o filme pode ser buscado. Contrato em
  `contracts/player-capabilities.md` §1.

- **D-002 — A UI lê capacidade, nunca identidade de motor.** Nenhuma tela
  consulta `adapter.name` nem `hasAvplay()` para decidir o que exibir. Segue
  D-007 do plano da feature 003.

- **D-003 — Controle cuja capacidade é `false` não é renderizado.** Não existe
  botão desabilitado: com `canSeek: false` e `canPause: false`, a barra
  inteira não existe. É o que mantém a Live TV idêntica a hoje.

- **D-004 — `kind` é obrigatório em `createPlayerSession`, sem valor padrão.**
  Um padrão faria um filme perder a barra por esquecimento, sem erro de
  compilação.

- **D-005 — O schema do IndexedDB não muda.** O limiar final é aplicado
  apagando o progresso no momento em que é cruzado, o que dispensa persistir
  duração (`research.md` R0-5). Acrescentar `durationSeconds` fica para quando
  os itens 13/16 tiverem um consumidor real.

- **D-006 — O modelo de interação dos controles é o do guia Samsung 06 §1.**
  Ocultar após 5 s; SELECT/cima/baixo revelam; esquerda/direita **saltam**
  quando ocultos e **navegam entre ações** quando visíveis; saltos de 10 s.
  Isso **refina** FR-008 da spec, que dizia apenas "reaparecem ao acionar
  qualquer direcional" — ver `research.md` R0-6.

- **D-007 — A camada de reprodução é movida, não duplicada.**
  `features/live/PlayerOverlay.tsx` → `components/PlayerLayer.tsx`, consumida
  por Live TV e por Filmes. Duplicar espalharia o cuidado com o plano de
  hardware, que já custou um bug na TV.

- **D-008 — Fim de mídia é traduzido pela sessão, não pelo adaptador.** O
  adaptador sempre emite `onCompleted`; a sessão o transforma em `completed`
  (mídia com duração) ou em `error` com a mensagem atual (canal ao vivo).

- **D-009 — Saltos são single-flight com acumulação.** Exigido pela restrição
  da API AVPlay (`research.md` R0-1). Descartar comandos pareceria
  travamento; repassá-los violaria a API. Lógica em
  `logic/reproducao-vod.md` §3.

- **D-010 — Perder retomada nunca vira falha de reprodução.** Um filme sem
  identidade estável (nem `providerStreamId` nem `originalName`) toca
  normalmente e só não grava progresso.

- **D-011 — Fechar a camada invalida o estado do usuário daquele item.** Como
  a camada é camada, o detalhe fica montado por baixo com a leitura de quando
  montou, enquanto o gravador escreve a cada 5 s. Sem invalidar, voltar de 20
  minutos de filme mostraria "Assistir". A invalidação mora na **tela** (que
  detém a consulta e o estado `playing`), nunca na camada — que não conhece
  chaves de consulta do catálogo. Invalidar, não espelhar no cache:
  o gravador é a única fonte da posição, e o limiar final que apaga o
  progresso tornaria o espelho errado exatamente quando a resposta importa
  (`logic/reproducao-vod.md` §5.1).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Nada nesta feature pede login. |
| Segredos Fora dos Clientes e dos Logs | Risco | OK | Callbacks novos carregam só números (`onProgress`). Falha de `seekTo`/`jumpBy` não repassa o erro cru do motor, que embute URL. Contrato §6; verificado no Cenário J e no checklist do `quickstart.md`. |
| Categorias da Fonte São Preservadas | N/A | N/A | Feature não toca classificação nem grupos. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | Sem IA. A regra análoga sobre não inventar duração está no princípio de Progresso. |
| Comandos Locais Independem de Rede/Backend/IA | OK | OK | Pausa, salto e busca são chamadas diretas ao motor, sem rede. A única ida à rede é a resolução da URL no início de cada sessão. |
| Trailers e Metadados Não Alteram Estado | N/A | N/A | Sem trailers aqui. |
| Toda Ação Essencial por Controle Remoto | Risco | OK | "Assistir" é ação essencial e tem caminho completo. **Ressalva**: o bug pré-existente R-011 (OK não ativa botão `.tv-focus`) atinge os estados de erro das telas tocadas — corrigido **localmente** nas telas desta feature (R-005), sem alterar o `useRemoteNav` global, que continua sendo o bug de backlog. |
| Lista de Catálogo ≠ Manifesto de Streaming | N/A | N/A | Feature não importa nem classifica. |
| Foco Visível e Sem Becos Sem Saída | **Desvio** | **Desvio justificado** | Com os controles ocultos, a camada **não tem elemento focável**. É o mesmo desenho aprovado em D-010 da feature 003, e RETURN é a saída garantida de todo estado. Registrado em Complexity Tracking. |
| Voltar Restaura Foco e Posição | Risco | OK (no escopo) | A camada é camada, não rota: o detalhe permanece montado e recupera o foco (FR-009). **Violação pré-existente encontrada e não introduzida por esta feature**: o roteador desmonta a tela ao abrir o detalhe, então voltar do detalhe para a grade perde foco e posição — R-004, encaminhado ao backlog. |
| Identidade de Reprodução Não Depende da URL | OK | OK | Retomada chaveada por `buildStableId` (fonte + tipo + id estável), nunca pela URL. FR-013/FR-018; verificado ressincronizando a fonte. |
| Progresso e Capacidades São Reais | **Central** | OK | É o princípio que a feature existe para atender. Sem duração confiável: tempo decorrido, sem barra e **sem percentual** (FR-004). Canal ao vivo sem DVR não oferece busca (FR-003). Nenhum controle exibido que o motor não execute (D-003). |
| Documentação do Repositório É Canônica | OK | OK | A divergência entre FR-008 e o guia 06 está registrada (`research.md` R0-6, D-006) em vez de resolvida no silêncio. Fase Polish atualiza `CLAUDE.md` e o backlog. |

**Consistência com as ADRs**: nenhuma contrariada. ADR-001 §2 (o
`PlayerService` isola as telas do motor) é estendida no espírito dela; ADR-001
§5 já previa `pause`/`resume`/`seek` como ações de domínio executadas
localmente. ADR-002 §5 (URL nunca reaproveitada entre tentativas) é
preservada. ADR-007 (tokens) e ADR-009 (`useRemoteNav` como engine de foco)
são seguidas. Nenhuma `sdd-adr` é necessária.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/011-assistir-filme-retomada/
├── spec.md                          # Saída do sdd-specify
├── plan.md                          # Este arquivo
├── research.md                      # Fase 0 — R0-1 a R0-7
├── contracts/
│   └── player-capabilities.md       # Contrato da superfície do player
├── logic/
│   └── reproducao-vod.md            # Limiares, saltos, controles, retomada
├── quickstart.md                    # Verificação manual + gate de TV física
└── tasks.md                         # Saída do sdd-plan
```

Sem `data-model.md`: a feature **não** cria nem altera entidade persistida
(D-005). O único tipo novo é de contrato, e mora em `contracts/`.

### Source Code (repository root)

```text
tv-web/                              # ÚNICO alvo desta feature
├── src/
│   ├── App.tsx                      # roteador (não muda nesta feature)
│   ├── index.css                    # tokens ADR-007 (consumidos, não alterados)
│   ├── components/
│   │   ├── ConfirmDialog.tsx
│   │   ├── Toast.tsx
│   │   ├── PlayerLayer.tsx          # NOVO (movido de features/live/PlayerOverlay.tsx)
│   │   ├── PlayerLayer.test.tsx     # NOVO (movido de PlayerOverlay.test.tsx)
│   │   ├── PlayerControls.tsx       # NOVO — barra, botões, tempo
│   │   └── PlayerControls.test.tsx  # NOVO
│   ├── features/
│   │   ├── catalog/catalogApi.ts    # fetchPlayback já devolve `kind` — só consumido
│   │   ├── live/
│   │   │   ├── LiveScreen.tsx       # passa a importar PlayerLayer
│   │   │   ├── PlayerOverlay.tsx    # REMOVIDO (movido)
│   │   │   └── PlayerOverlay.test.tsx # REMOVIDO (movido)
│   │   ├── movies/
│   │   │   ├── MovieDetailScreen.tsx      # ação primária real + camada
│   │   │   └── MovieDetailScreen.test.tsx # NOVO (hoje não existe)
│   │   └── screens.css              # classes .player-* existentes + novas
│   └── lib/
│       ├── catalog/userStateRepository.ts # consumido (sem alteração)
│       └── player/
│           ├── PlayerService.ts     # capacidades, estados novos, progresso
│           ├── PlayerService.test.ts
│           ├── avplayAdapter.ts     # pause/seek/jump/posição/duração
│           ├── avplayAdapter.test.ts     # NOVO (hoje não existe)
│           ├── htmlVideoAdapter.ts  # idem, via HTMLMediaElement
│           ├── htmlVideoAdapter.test.ts  # NOVO (hoje não existe)
│           ├── resumePolicy.ts      # NOVO — limiares e funções puras
│           └── resumePolicy.test.ts # NOVO
└── package.json

api/                                 # NÃO tocada (contorno congelado, ADR-008)
CCPlayTv/                            # pacote Tizen — só o build sincronizado
```

**Structure Decision**: repositório de duas pontas (`tv-web/` frontend,
`api/` backend congelado), e esta feature é **inteiramente frontend**. Nenhum
arquivo de `api/` é tocado. Nenhum Worker novo é criado, então
`tizen_web_project.yaml` não muda — a armadilha do `importWorker.js` (R-002 da
feature 005) não se aplica aqui.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| **"Foco Visível e Sem Becos Sem Saída"**: com os controles ocultos, a camada de reprodução não tem elemento focável | Um filme em tela cheia com uma barra permanente cobre a imagem durante toda a sessão. O guia Samsung 06 §1 é explícito em ocultar após 5 s, e é a expectativa de qualquer app de TV. O princípio é atendido no espírito: RETURN é saída garantida de **todo** estado, e qualquer tecla revela os controles | Manter os controles sempre visíveis foi apresentado ao usuário na clarificação de 23/09 e **recusado** — cobre a imagem o filme inteiro. Precedente idêntico já aceito em D-010 da feature 003, verificado na TV física |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

**Unitário (o grosso)** — a lógica desta feature é quase toda pura e deve ser
testada sem DOM:

- `resumePolicy.ts`: `isResumable`, `isPastEnd`, `shouldWriteProgress`. Casos
  de borda explícitos: duração ausente, duração zero, posição negativa,
  retrocesso.
- `mediaCapabilities`/`resolveCapabilities`: a tabela de
  `contracts/player-capabilities.md` §1 vira tabela de teste, incluindo
  `series`/`unclassified` devolvendo tudo `false`.
- `canTransition`: as transições novas (`paused`, `completed`) **e** as
  proibidas (`completed → playing`, `error → playing`).
- A porta single-flight de saltos: sem DOM, dirigindo os callbacks à mão —
  três `jumpBy(+10s)` em voo produzem **um** salto de +30 s, não três de +10 s.

**Contrato/integração**:

- `PlayerServiceSession` com adaptador falso: capacidade resolvida, `onProgress`
  propagado, `onCompleted` virando `completed` para filme e `error` para canal.
- Cadência de gravação: sessão falsa + `fake-indexeddb`, conferindo quantas
  escritas acontecem e o que sobra no registro ao sair.

**Componente** (`@testing-library/react`): `PlayerLayer` e `PlayerControls`.
Reaproveitar os mocks de jsdom já documentados em `LiveScreen.test.tsx`
(`beforeAll`) — jsdom não faz layout nem implementa `scrollTo`, e o mesmo
conjunto de mocks foi reusado com sucesso em `MoviesScreen.test.tsx`.

**Manual**: `quickstart.md`. Os Cenários F–J **exigem a TV física** e são gate
de conclusão — o adaptador `<video>` suporta tudo, logo o navegador é
estruturalmente incapaz de reprovar uma capacidade ausente no AVPlay.

Comandos-base:

```powershell
cd tv-web
npx tsc -b
npm run lint
npx vitest run
npm run build:tizen          # só para levar à TV
```

Narrow primeiro, conforme a fase:

```powershell
npx vitest run src/lib/player/resumePolicy.test.ts
npx vitest run src/lib/player/PlayerService.test.ts
npx vitest run src/components/PlayerLayer.test.tsx
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup) | Concluída. |
| Fase 2 (Foundational) | Concluída. Contrato de capacidades completo e testado nos dois adaptadores; Live TV intacta. |
| Fase 3 (US1 — MVP) | Concluída. Um filme abre em `PlayerLayer`, com barra de play/pause e saltos de 10s, e RETURN devolve ao detalhe. Live TV migrada para o mesmo componente sem regressão de comportamento. |
| Fase 4 (US2 — Retomar) | Concluída. Progresso gravado por `progressRecorder.ts`, lido por `useUserState`, e a ação primária de `MovieDetailScreen` alterna Assistir ↔ Retomar/Reiniciar. Frescor ao fechar a camada garantido por `invalidateUserState`. |
| Fase 5 (US3 — Conclusão) | Concluída. Filme concluído fecha a camada sem erro e apaga a retomada; canal ao vivo continua tratando fim de stream como falha (FR-021, sem regressão). |
| Fase 6 (TV física) | **Encerrada por decisão do usuário, sem satisfazer o critério por completo** (R-022). Cenários F/G/H aprovados na QN50Q60DAGXZD, com 3 correções reais confirmadas (R-019/R-020/R-021). Cenário I, Cenário J, e o edge case de "buscar além do fim" em H **não foram executados** — risco residual aceito explicitamente, não bloqueia mais o avanço da feature. |
| Fase 7 (Polish) | Parcial. Documentação sincronizada (`CLAUDE.md`, backlog, R-004 registrado) e suíte automatizada limpa. T052 (Cenários A–E no navegador) não executado. |
| Fase 8 (Convergence) | Concluída. Os 3 achados acionáveis da primeira passada de `sdd-converge` (24/09/2026) sanados: FR-008 emendado com a exceção da barra focada (CF-01), teste de clamp de 100% adicionado a `PlayerControls.test.tsx` (CF-02), `research.md` R0-1 atualizado (CF-07). Nenhum achado era `CRITICAL`; os quatro itens de risco residual (R-022) permanecem fora de escopo, não reabertos. |
| `resumePolicy.ts` | `RESUME_MIN_SECONDS=30`, `RESUME_MAX_RATIO=0.95`, `PROGRESS_WRITE_INTERVAL_SECONDS=5`; `isResumable`/`isPastEnd`/`shouldWriteProgress` puras e testadas. |
| `progressRecorder.ts` | `createProgressRecorder(identity, reportsPosition)` — `onProgress`/`onExit('pause'\|'close'\|'completed')`, sem React. Identidade `null` é no-op silencioso (D-010). Selado (`done`) após conclusão — chamadas seguintes são ignoradas (R-018). |
| `userStateRepository.ts` | `clearProgress` novo, mesmo padrão de `toggleFavorite` (zera o campo, não apaga o registro). |
| `catalogApi.ts` | `CatalogItemPlayback` ganhou `source_id`/`provider_stream_id`/`original_name` (obrigatórios); `CatalogItemOut` ganhou os mesmos três, **opcionais** (populados em `toItemOut`, não quebram fixtures de grade); `useUserState`/`invalidateUserState` novos, `queryKey: ['user-state', stableId]`. |
| `features/movies/MovieDetailScreen.tsx` | Reescrito: `buildActions(progressSeconds)` alterna `[Trailer,Assistir]` ↔ `[Trailer,Resume,Restart]`, ação primária sempre no índice 1. `openPlayer` decide `startAtMs` (`undefined`/posição/`0`). `onClose` invalida `useUserState`. |
| `components/PlayerLayer.tsx` (conclusão) | `session.state === 'completed'` chama `recorder.onExit('completed')` e `onClose()` direto, antes do ramo de erro. Canal ao vivo nunca chega lá — D-008 já traduz pra `error` na sessão. |
| `capabilities.ts` | `mediaCapabilities(kind)` e `resolveCapabilities(engine, kind)` prontos; `PlayableKind` local (não importa `lib/catalog`, R-012). |
| `PlayerService.ts` | `PlayerState` com `paused`/`completed`; `PlayerAdapter`/`PlayerAdapterCallbacks` com capacidades, pausa, busca (`onSettled`), progresso; `PlayerServiceSession` resolve capacidades no construtor, expõe `togglePause`/`seekTo`/`jumpBy` com porta single-flight e grampeamento aos limites reais, traduz `onCompleted` por capacidade da mídia (D-008); `createPlayerSession` exige `kind`, aceita `startAtMs`. |
| `avplayAdapter.ts` | Superfície completa implementada (`pause`/`resume`/`seekTo`/`jumpBy`/progresso/`onCompleted`) — **não verificada em hardware** (gate: Fase 6). |
| `htmlVideoAdapter.ts` | Mesma superfície via `HTMLMediaElement`, suporta tudo sempre (motor de desenvolvimento). |
| `components/PlayerLayer.tsx` | Movido de `features/live/PlayerOverlay.tsx` (T020, `git mv`), com `title`/`unavailableMessage`/`genericErrorMessage` generalizados (D-007). Consome `PlayerControls.tsx` (T022) e implementa `controlsVisible`/`focusedIndex`/temporizador de 5s (T023), com os dois ajustes de R-014/R-015 (foco inicial no play/pause; reagenda o temporizador reagindo à confirmação real de pausa, não ao momento do SELECT). |
| `features/live/LiveScreen.tsx` | Importa `PlayerLayer` (T021), passando as mensagens de canal originais — comportamento idêntico a antes da migração (FR-022, suíte `LiveScreen.test.tsx` sem alteração de asserção). |
| `features/screens.css` | `.player-controls`/`.player-time`/`.player-time-bar`/`.player-buttons`/`.player-control-button` (T026) — barra ancorada embaixo da camada, tokens de `index.css`. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Nada da superfície de VOD do AVPlay (`getDuration`, `oncurrentplaytime`, `seekTo`, `pause`) foi exercitado na QN50Q60DAGXZD — o adaptador só usa `open`/`play`/`stop`/`close` | **Alto** — é a premissa que sustenta a barra de progresso e a retomada | Superfície confirmada na referência oficial Samsung (`research.md` R0-1). Verificação em hardware é gate desta feature: Cenários F–I do `quickstart.md`. FR-004 já define a degradação se a duração não vier |
| R-002 | `jumpForward`/`jumpBackward` restringem outras chamadas à API enquanto a operação assíncrona não volta. Segurar a seta emite saltos mais rápido do que o motor os conclui | **Alto** — congelamento do app na TV, invisível no navegador | **Resolvido e confirmado real (24/09/2026)**: a mitigação original (porta single-flight com ACUMULAÇÃO, D-009) travava o app de verdade — ver R-019. Substituída por descarte; segurar a seta confirmado funcionando sem travar na TV física |
| R-003 | A camada compartilhada é o único caminho de reprodução comprovado na TV (feature 003). Generalizá-la pode regredir a Live TV | **Alto** — perderia a única prova de reprodução que o projeto tem | FR-022 + D-003 (controle sem capacidade não é renderizado) mantêm o caminho de canal idêntico. Cenário E (navegador) confirmado por teste automatizado sem alteração de asserção. **Cenário J (TV física) não foi executado** — usuário decidiu não testar Live TV nesta rodada (R-022); risco aceito, não confirmado em hardware |
| R-004 | **Achado na exploração**: `App.tsx` é um `switch` que renderiza uma tela por vez, então abrir o detalhe **desmonta** `MoviesScreen`. Voltar do detalhe reconstrói a tela do zero — categoria não entrada, foco no início, rolagem perdida | Médio — viola "Voltar Restaura Foco e Posição" | **Pré-existente, não introduzido por esta feature**, e fora do escopo dela (a spec trata do retorno *do player para o detalhe*, que funciona por ser camada). Encaminhar ao backlog como `[Bug]` na fase Polish. Corrigir exige estado de foco no histórico de navegação ou manter telas montadas — decisão de design, não ajuste |
| R-005 | O bug conhecido R-011 da feature 010 (botão com `.tv-focus` não é ativado por OK) atinge os estados de carregando/erro do `MovieDetailScreen`, que esta feature toca | Médio — botão que só funciona por mouse | **Resolvido localmente**: corrigido nas telas desta feature, roteando `onSelect` para o botão do estado ativo. **Não** altera o `useRemoteNav` global — esse continua sendo o bug de backlog, porque afeta várias telas e é decisão de design |
| R-006 | `onstreamcompleted` tem significados opostos por tipo de mídia. Se a tradução errar, ou todo filme termina numa tela de erro, ou uma queda de transmissão ao vivo parece conclusão bem-sucedida | Médio | **Resolvido**: D-008 — o adaptador sempre emite `onCompleted` e a **sessão** traduz pela capacidade da mídia. Teste de contrato cobre os dois sentidos explicitamente |
| R-007 | A duração pode não vir para alguns contêineres, deixando a barra sem denominador | Baixo/Médio — seria o percentual inventado que a constitution proíbe | **Resolvido**: FR-004 já define tempo decorrido, sem barra, sem percentual. O Cenário G (TV física, aprovado) confirmou que a duração vem do motor neste caso |
| R-008 | Acrescentar `paused`/`completed` a `ALLOWED_NEXT` pode afrouxar a proteção contra callback atrasado que a tabela existe para dar | Baixo | **Resolvido**: `completed` é terminal exceto por `closed`, como `error`. Os testes cobrem as transições **proibidas**, não só as permitidas |
| R-009 | Gravar progresso a cada 5 s durante um filme concorre com o IndexedDB, que a feature 010 também usa para obter categorias em segundo plano | Baixo | **Resolvido**: escrita é um `put` por chave primária em `userStates` — tabela que a 010 não toca (ela escreve em `channels`/`categories`) — dentro de uma transação curta que já existe (`upsert`, `userStateRepository.ts:72`) |
| R-010 | `buildStableId` **lança** quando o item não tem identificador nem nome (`userStateRepository.ts:41`) | Baixo | **Resolvido**: D-010 — a exceção é contida na camada de progresso e nunca vira erro de player. Filme toca; só não grava retomada |
| R-011 | **Achado na Fase 2**: o contrato original (`player-capabilities.md`) não especificava como a sessão saberia quando uma chamada assíncrona de `seekTo`/`jumpBy` no motor volta, nem como `startAtMs` chegaria ao adaptador a tempo de rodar antes do `play()` — os dois são exigidos pela lógica documentada (porta single-flight, §3; retomada, §5), mas as assinaturas de tipo não os expunham | Médio — sem isso, a porta single-flight não tem como saber quando liberar, e a retomada piscaria o início antes de saltar | **Resolvido**: `seekTo?`/`jumpBy?` do `PlayerAdapter` ganharam um segundo parâmetro `onSettled: () => void`; `open()` ganhou um terceiro parâmetro opcional `startAtMs`. Os dois documentados retroativamente em `contracts/player-capabilities.md` (§2 e novo §4.1), consistente com "Documentação do Repositório É Canônica" |
| R-012 | **Achado na Fase 1/2**: `capabilities.ts` importava `CatalogItemKind` de `lib/catalog/db`, o que criaria uma dependência `lib/player → lib/catalog` — o inverso da fronteira unidirecional que o backlog (item 49) propõe (`lib/catalog/ → lib/player/`) | Baixo — nada quebraria hoje (item 49 ainda não é lint-enforced), mas compraria dívida logo na primeira feature que toca o player | **Resolvido**: `PlayableKind` definido localmente em `capabilities.ts`, estruturalmente idêntico a `CatalogItemKind`. Um `CatalogItemKind` real satisfaz `PlayableKind` por tipagem estrutural — nenhum ponto de chamada precisa converter ou importar de `lib/catalog` |
| R-013 | **Conflito achado na Fase 3 (gatilho de parada do `sdd-execute`)**: a Acceptance Scenario 6 da US1 dizia "a busca não é oferecida" sem duração confiável, mas o contrato trata `canSeek`/`reportsDuration` como capacidades independentes — salto relativo (±10s) não precisa saber o total | Médio — decidiria se ⏪/⏩ desaparecem junto com a barra, ou só a barra some | **Resolvido com o usuário (23/09/2026)**: só a barra/percentual dependem de duração; avançar/retroceder continuam disponíveis sempre que `canSeek` for verdadeiro. `spec.md` AS6 corrigida com nota de rastreio; nenhuma mudança de código necessária — o design já implementava isto |
| R-014 | **Achado ao rodar a suíte herdada de T017/T018 (retomada da Fase 3)**: `playerControlsActions` ordena `[jumpBack, playPause, jumpForward]` (`canSeek` empurra `jumpBack` antes de `canPause` empurrar `playPause`), mas `PlayerLayer.tsx` inicializava e resetava `focusedIndex` para `0` — focando `jumpBack`, não o play/pause que `logic/reproducao-vod.md` §4 exige ("o foco inicial, ao revelar, é sempre o play/pause") | Alto — SELECT com controles recém-revelados executaria um salto em vez de pausar/retomar, e nenhum teste unitário existente pegava isso (a suíte de T018 é que expôs, ao ser rodada pela primeira vez) | **Resolvido**: `playPauseIndexOf(capabilities)` calcula o índice real de `playPause` dentro de `playerControlsActions(capabilities)` (com fallback `0` se a ação não existir); usado tanto na criação da sessão quanto em `revealControls()`, em vez do literal `0` |
| R-015 | **Achado no mesmo lote**: `scheduleHide()` só era chamado dentro dos handlers de tecla, lendo `sessionRef.current.state` **no momento da tecla** — mas `togglePause()` só chama `adapter.pause()`, e a transição real para `paused` só chega depois, pelo callback assíncrono do motor (`onStateChange`). O temporizador de 5s ficava armado com o estado "tocando" e escondia a barra mesmo já pausado, violando `logic/reproducao-vod.md` §4 ("o temporizador não roda enquanto pausado") | Médio/Alto — pausar e sair da tela por 5s faria os controles sumirem sem ação nenhuma, na Live TV e em Filmes igualmente (código compartilhado) | **Resolvido**: novo `useEffect` reage à mudança real de `phase.state` (via uma variável derivada `sessionState`, não ao objeto `phase` inteiro — que muda a cada `onProgress`) e rechama `scheduleHide()` toda vez que o estado confirmado muda, cancelando o temporizador assim que `paused` é confirmado e rearmando ao retomar |
| R-016 | **Achado na Fase 4, ao escrever `progressRecorder.test.ts`**: dois testes meus assumiram comportamento que o próprio design (`logic/reproducao-vod.md` §2) não prevê — (a) que `onExit` forçaria uma gravação incondicional (na verdade reaplica a MESMA porta de `onProgress`, podendo ser no-op se o avanço desde a última escrita for pequeno); (b) que "sem duração conhecida" bloquearia qualquer gravação nova (na verdade só bloqueia a decisão de "passou do fim" — gravação normal continua) | Baixo — eram os testes errados, não o código; mas um teste com premissa errada que "passa por acidente" esconderia uma regressão real depois | **Resolvido**: os dois testes corrigidos para verificar o comportamento real e documentado, com comentário explicando o porquê (SC-002 tolera 10s, então um "no-op" de `onExit` com avanço pequeno é aceitável; `isPastEnd` exige duração, então posição grande sem duração nunca é "fim", só grava normalmente) |
| R-017 | **Decisão na Fase 4**: `MovieDetailScreen.test.tsx` passou a mockar `PlayerLayer` inteiro (`vi.mock('../../components/PlayerLayer', ...)`), não só `fetchPlayback` como na Fase 3 | Baixo — mudança de estratégia de teste, não de comportamento | Necessário pra inspecionar `startAtMs` (T029) sem precisar de um motor de reprodução real — a máquina de estados do player já está coberta em `PlayerLayer.test.tsx`, então duplicar essa cobertura aqui seria desperdício. `useCatalogItem` continua mockado; `useUserState`/`invalidateUserState` ficam com a implementação REAL, contra `fake-indexeddb`, porque é exatamente o mecanismo de invalidação que a Fase 4 precisa provar (T031) |
| R-018 | **Achado na Fase 5, ao implementar T043**: `onClose()` chamado a partir de `session.state === 'completed'` desmonta `PlayerLayer`, o que roda o cleanup do `useEffect` — e esse cleanup **já** chama `recorderRef.current?.onExit('close')` (Fase 4, T034), sobre o MESMO gravador que acabou de processar `onExit('completed')`. Sem proteção, a segunda chamada reaplicaria a última posição conhecida e regravaria progresso sobre um registro que acabou de ser apagado como concluído | Alto — um filme assistido até o fim voltaria a aparecer como "Retomar" segundos depois, o oposto do que FR-020 exige | **Resolvido**: `progressRecorder.ts` ganhou um selo interno (`done`), setado dentro do ramo `'completed'` de `onExit`. Toda chamada posterior (`onProgress` ou `onExit`, qualquer motivo) vira no-op. Testado explicitamente em `progressRecorder.test.ts` (chamando `onExit('close')` e `onProgress` depois de `onExit('completed')` e conferindo que o progresso continua apagado) |
| R-019 | **Achado na Fase 6, TV física (Cenário H)**: segurar a seta ±10s **travava o app**. Causa: a porta single-flight ACUMULAVA deltas de `jumpBy` enquanto um `jumpForward` estava em voo (decisão original de D-009/R0-1, nunca verificada em hardware). Segurar a tecla emite dezenas de eventos de repetição em poucos segundos; quando o salto em voo finalmente respondia (streams HTTP podem levar tempo real), disparava UM salto do tamanho da soma acumulada — potencialmente minutos — e a restrição real da API prendia a interface processando esse salto gigante | **Alto — era exatamente o risco mais concreto da feature (R-002), confirmado real** | **Resolvido e confirmado na TV física (24/09/2026)**: `jumpBy` passou de acumular pra **descartar** enquanto em voo (no máximo um salto de 10s por vez; o próximo toque dispara assim que a porta liberar). `seekTo` (destino absoluto, nunca por tecla mantida) continua substituindo o pendente — o risco de acúmulo não se aplica a ele. Usuário confirmou: segurar a seta não trava mais. `contracts/player-capabilities.md` §5 e `logic/reproducao-vod.md` §3 atualizados com a decisão revertida documentada, não apagada. Teste de `PlayerService.test.ts` reescrito para provar o descarte (3 chamadas em voo → 1 só ao adaptador) |
| R-020 | **Achado no mesmo Cenário H**: o modelo original ("direita a partir do último botão entra na barra") não correspondeu à expectativa do usuário — ele esperava focar a barra especificamente por CIMA (ela fica desenhada acima dos botões) e usar esquerda/direita pra buscar a partir dela, sem essa busca competir com a navegação entre botões | Médio — UX contra-intuitiva seria usável, mas não o que o usuário real pediu ao testar | **Resolvido e confirmado na TV física (24/09/2026)**: redesenhado para CIMA (a partir de qualquer botão) entrar na barra, BAIXO sair de volta pro play/pause. Esquerda/direita entre botões agora se limitam aos 3 botões (nunca alcançam a barra por transbordo); com a barra focada, esquerda/direita buscam direto. Usuário confirmou funcionando. `logic/reproducao-vod.md` §4 reescrita com a tabela de interação completa (ocultos / botão focado / barra focada) |
| R-021 | **Achado na Fase 6, Cenário F**: o backdrop com gradiente opaco de `MovieDetailScreen` (`.movie-detail-backdrop`) vazava por trás do vídeo — mesma causa-raiz do bug `live-tv-toca-audio-sem-imagem` (feature 003), mas numa tela que a proteção existente (`:root.video-plane-visible .screen > *`) não cobria, porque a raiz de `MovieDetailScreen` é `.movie-detail-layout`, não `.screen` | Alto — regressão visível do plano de hardware, feature 011 é a primeira a montar `PlayerLayer` dentro de `MovieDetailScreen` | **Resolvido e confirmado na TV física (24/09/2026)**: `screens.css` ganhou `:root.video-plane-visible .movie-detail-layout > *:not(.player-overlay)` ao lado da regra original de `.screen`, mesmo padrão já comprovado. Usuário confirmou: a faixa sumiu. Registrado como lembrete: a PRÓXIMA tela a hospedar `PlayerLayer` (ex.: detalhe de série) precisa somar sua própria raiz a essa lista — `:has()` generalizaria isso automaticamente (suportado no Chromium 108), mas não foi adotado no meio da sessão de depuração ao vivo por prudência |
| R-022 | **Decisão explícita do usuário (24/09/2026)**: encerrar a Fase 6 sem executar o restante do roteiro de verificação — o edge case de "buscar além do fim" em H, o Cenário I (retomada ponta a ponta com o app fechado), o Cenário J (Live TV) e a checagem de segredo em log via `sdb dlog` (T050) | Médio — são exatamente os caminhos que a constitution e SC-002/SC-005/SC-006 exigem confirmar em hardware; nenhum foi observado | **Aceito como risco residual, não corrigido nem contornado.** Continuam registrados como "não executado" em `tasks.md` (nunca "aprovado" — regra do skill `tizen-tv`). Encaminhamento explícito do usuário: qualquer comportamento incorreto percebido depois nesses quatro caminhos vira `sdd-adhoc` (ajuste pequeno) ou `sdd-bugfix` (bug), **não reabre esta feature nem o gate da Fase 6** |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-23 | Fase 1 (Setup) | Criados `resumePolicy.ts`/`capabilities.ts` com 23 testes; `npx tsc -b` limpo. Nenhum arquivo pré-existente alterado. | Nenhuma — pronto para a Fase 2. |
| 2026-09-23 | Fase 2 (Foundational) | Contrato de capacidades completo: `PlayerService.ts` (estados novos, pausa/busca/progresso, tradução `onCompleted`), os dois adaptadores, e `PlayerOverlay.tsx` (Live TV) passando `kind` sem regressão. Dois refinamentos de contrato (`onSettled`, `startAtMs` em `open()`) e uma correção de fronteira (`PlayableKind` local) documentados em R-011/R-012. `npx vitest run` → 328 passed; `npx tsc -b`/`npm run lint` limpos. | Verificação em hardware real (gate: Fase 6) — nada da superfície de VOD foi exercitado no AVPlay ainda. |
| 2026-09-24 | Fase 3 (US1 — MVP) | T020/T022/T024/T025/T026 já estavam implementados em código de uma sessão anterior (commit `player2`) sem os checkboxes/Registro atualizados — reconciliado. T021 estava genuinamente pendente e quebrado: o `git mv` de T020 apagou `PlayerOverlay.tsx`, deixando `LiveScreen.tsx` com import morto e a prop antiga `channelName`; corrigido para importar `PlayerLayer` com as mensagens de canal originais. Rodar a suíte herdada de T017/T018 pela primeira vez expôs dois bugs reais (R-014: foco inicial/ao revelar mirava `jumpBack` em vez de play/pause; R-015: o temporizador de ocultar não reagia à confirmação assíncrona de pausa), ambos corrigidos em `PlayerLayer.tsx`. T026 (CSS da barra) não existia — criado em `screens.css`, só com tokens de `index.css`. | `npx vitest run` → 357/357 (38 arquivos); `npx tsc -b`/`npm run lint` limpos. Pendência: Cenários A/E do `quickstart.md` (navegador) ainda não rodados manualmente — formalmente T052, mas recomendados antes de prosseguir. |
| 2026-09-24 | Fase 4 (US2 — Retomar) | `progressRecorder.ts` (máquina de gravação, sem React), `clearProgress` em `userStateRepository`, `source_id`/`provider_stream_id`/`original_name` expostos em `CatalogItemPlayback`/`CatalogItemOut` (necessários pra montar a identidade estável fora de `PlayerLayer`), `useUserState`/`invalidateUserState` em `catalogApi.ts`, `PlayerLayer.tsx` alimentando o gravador a cada emissão, e `MovieDetailScreen.tsx` reescrito com lista de ações que alterna Assistir ↔ Retomar/Reiniciar. Dois erros de premissa nos meus próprios testes corrigidos (R-016, não eram bugs de código). `MovieDetailScreen.test.tsx` passou a mockar `PlayerLayer` inteiro (R-017). | `npx vitest run` → 378/378 (39 arquivos); `npx tsc -b`/`npm run lint` limpos. Pendência: nenhuma nova — persistência entre reloads reais e retomada ponta a ponta na TV continuam sendo verificação manual (Cenário B do navegador em T052; Cenário I na TV em T048). |

| 2026-09-24 | Fase 5 (US3 — Conclusão) | `session.state === 'completed'` em `PlayerLayer.tsx` chama `recorder.onExit('completed')` e `onClose()` direto, sem passar pelo ramo de erro. Achado ao implementar: a desmontagem resultante roda o cleanup do efeito, que chamaria `onExit('close')` de novo sobre o mesmo gravador — corrigido com um selo `done` em `progressRecorder.ts` (R-018), que também evita um callback atrasado do motor reviver o progresso depois de concluído. | `npx vitest run` → 381/381 (39 arquivos); `npx tsc -b`/`npm run lint` limpos. As três user stories (P1/P2/P3) estão completas. |
| 2026-09-24 | Fase 6 (TV física) — encerrada por decisão do usuário | Cenários F e G aprovados; Cenário H reprovou duas vezes e gerou três correções reais confirmadas na TV depois: (1) backdrop de `MovieDetailScreen` vazando atrás do vídeo — R-021; (2) segurar a seta travava o app — a porta single-flight acumulava saltos em vez de descartar — R-019; (3) modelo de navegação da barra redesenhado de "direita entra" pra "cima entra, baixo sai", a pedido do usuário depois de testar — R-020. Usuário confirmou os três funcionando após a correção final. `npx vitest run` → 390/390 (39 arquivos); `npx tsc -b`/`npm run lint` limpos. Usuário decidiu então **não testar o restante** (R-022): edge case de busca além do fim, Cenário I, Cenário J e checagem de `sdb dlog`. | Nenhuma bloqueante — risco residual aceito explicitamente (R-022). Documentação de Fase 7 (T053–T057) fechada nesta mesma sessão. |
| 2026-09-24 | Fase 7 (Polish) — parcial | `CLAUDE.md` e `.planning/backlog.md` (itens 4/8/13, resumo "O que já existe hoje") atualizados para refletir a 011; R-004 (roteador perde foco/posição ao voltar de detalhe) registrado como `[Bug]` pré-existente; conferido que os componentes novos só usam tokens ADR-007; suíte completa limpa (390/390, tsc, lint). | T052 (Cenários A–E no navegador) não executado nesta sessão — sem bloqueio, fica para quando o navegador estiver em uso. |
| 2026-09-24 | Fase 8 (Convergence) | Primeira passada de `sdd-converge` encontrou 7 achados, nenhum `CRITICAL`; 3 acionáveis viraram T058-T060. FR-008 (`spec.md`) emendado com a exceção da barra focada e nota "Atualização (Fase 6, R-020)" (T058/CF-01); teste novo em `PlayerControls.test.tsx` cobrindo o clamp de 100% quando a duração encolhe abaixo da posição já alcançada (T059/CF-02) — o clamp em si já existia, só faltava a cobertura; `research.md` R0-1 deixou de afirmar "não verificado em hardware", com nota apontando pra R-019/R-020/R-021/R-022 (T060/CF-07). Também aproveitada pra corrigir a Fase 2 da skill `tizen-tv` (build com `VITE_API_URL`/backend LAN), stale desde a migração client-first (feature 005/ADR-008) — não é código desta feature, mas foi pedido explicitamente no mesmo lote de trabalho. | Nenhuma — os 3 achados acionáveis foram sanados; os 4 achados de risco residual continuam cobertos por R-022, sem nova task. |

**PRÓXIMO**: rodar `sdd-converge` de novo para confirmar que os achados foram sanados e, se não houver novo achado acionável, fechar a convergência (status final). Os quatro caminhos de risco residual (busca além do fim, retomada após fechar o app, Live TV, segredo em log) continuam fora de escopo — qualquer comportamento incorreto percebido neles vira `sdd-adhoc` ou `sdd-bugfix`, não reabre esta feature. T052 (Cenários A–E no navegador) continua disponível para quando fizer sentido rodar.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/components/PlayerLayer.tsx` — camada de reprodução compartilhada, agora alimentando o gravador de progresso (Fase 4, T034)
- `tv-web/src/lib/player/progressRecorder.ts` — máquina de gravação (Fase 4, T032)
- `tv-web/src/lib/catalog/userStateRepository.ts` — ganhou `clearProgress` (Fase 4, T033)
- `tv-web/src/features/catalog/catalogApi.ts` — `useUserState`/`invalidateUserState` e os três campos de identidade em `CatalogItemPlayback`/`CatalogItemOut` (Fase 4, T035)
- `tv-web/src/features/movies/MovieDetailScreen.tsx` — reescrito com `buildActions` (Fase 4, T036/T037); próximo alvo: tratar `completed` (Fase 5, via `PlayerLayer.tsx`)
- `tv-web/src/lib/player/PlayerService.ts` — porta single-flight corrigida pra descartar em vez de acumular (Fase 6, R-019)
- `tv-web/src/components/PlayerLayer.tsx` — navegação da barra redesenhada (cima entra, baixo sai; Fase 6, R-020)
- `tv-web/src/features/screens.css` — regra de plano de hardware estendida a `.movie-detail-layout` (Fase 6, R-021)
- `sdd/specs/011-assistir-filme-retomada/spec.md` — FR-008 emendado com a exceção da barra focada (Fase 8, T058/CF-01)
- `tv-web/src/components/PlayerControls.test.tsx` — teste de clamp de 100% com posição além da duração (Fase 8, T059/CF-02)
- `sdd/specs/011-assistir-filme-retomada/research.md` — R0-1 atualizado, deixou de afirmar "não verificado em hardware" (Fase 8, T060/CF-07)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **jsdom não faz layout nem implementa `scrollTo`.** Testes de componente
  precisam do conjunto de mocks documentado no `beforeAll` de
  `LiveScreen.test.tsx` (`offsetHeight`/`offsetWidth` em `HTMLElement`,
  `clientHeight`/`scrollHeight` em `Element`, e um polyfill de `scrollTo` que
  despacha o evento por `queueMicrotask` — síncrono reentra no React em plena
  fase de commit).
- **jsdom não implementa `HTMLMediaElement.play()`/`pause()`/`load()`.**
  `htmlVideoAdapter.test.ts` mocka `play`/`pause`/`load` no protótipo via
  `beforeAll` (padrão confirmado funcionando). `load()` já era chamado por
  `detach()` num `try/catch` antes desta feature — o aviso "Not implemented"
  continua aparecendo no stderr da suíte inteira mesmo com o mock, mas é
  inofensivo (capturado, não falha nenhum teste). Eventos (`'pause'`,
  `'playing'`, `'ended'`, `'timeupdate'`) precisam ser disparados manualmente
  com `element.dispatchEvent(new Event(...))` — jsdom não os dispara sozinho a
  partir de `play()`/`pause()` mockados.
- **Não remover a classe `video-plane-visible` do caminho de cleanup.** Ela é
  o que libera a área do vídeo no plano de hardware; esquecê-la no cleanup
  deixa o app inteiro transparente na TV — falha pior que o bug original
  (`PlayerOverlay.tsx:130`).
- **O `.wgt` precisa do build sincronizado.** `npm run build:tizen` antes de
  instalar, senão a TV roda o pacote anterior e a verificação mede a versão
  errada.
- **Nunca acumular comandos pendentes contra uma API nativa "restrita durante
  a operação assíncrona" (R-019).** Parecia a escolha certa pra não perder
  toques rápidos, mas turbina o pior caso: tecla mantida pressionada gera
  dezenas de eventos antes do primeiro round-trip nativo voltar, e um
  pendente que SOMA vira um comando de tamanho imprevisível quando finalmente
  dispara. Prefira descartar (ou, na pior hipótese, um teto pequeno e
  explícito no que pode acumular) — só hardware real revela esse tipo de
  interação entre latência de I/O e taxa de eventos de entrada; o adaptador
  `<video>` de desenvolvimento nunca reproduziu o sintoma porque `onSettled`
  roda síncrono ali.
- **Toda tela nova que monta `PlayerLayer` precisa entrar na lista de seletores
  do plano de hardware em `screens.css`** (`:root.video-plane-visible
  .<raiz-da-tela> > *:not(.player-overlay)`) — ver R-021. Esquecer produz
  exatamente o sintoma do bug `live-tv-toca-audio-sem-imagem`, só que
  silencioso até alguém testar na TV física.

## Resultado Final

<!-- Anexado pelo sdd-converge (24/09/2026) ao final de uma convergência sem achados novos. -->

As três user stories (P1 assistir, P2 retomar, P3 concluir) foram entregues e
estão em uso: `PlayerService` ganhou um contrato de capacidades resolvido por
sessão (motor ∩ mídia), `PlayerLayer` (movido de `features/live/`) passou a
servir Live TV e Filmes com o mesmo código, e `MovieDetailScreen` consome
`userStateRepository` pela primeira vez desde a feature 008.

**Verificado na TV física (QN50Q60DAGXZD)**: Cenários F, G e a maior parte de
H, com três correções reais que só um aparelho real revelou — nenhuma visível
no adaptador `<video>` de desenvolvimento:

- **R-019**: a porta single-flight de saltos acumulava comandos em vez de
  descartar, e travava o app de verdade ao segurar a seta — a API AVPlay
  restringe outras chamadas enquanto uma está em voo, e o desenho original
  (D-009) não previa isso corretamente.
- **R-020**: o modelo de foco da barra de progresso foi redesenhado em campo
  — de "direita a partir do último botão entra na barra" para "cima entra a
  partir de qualquer botão, baixo sai" — a pedido do usuário, depois de testar
  o desenho original e achá-lo contraintuitivo.
- **R-021**: o backdrop opaco de `MovieDetailScreen` vazava por trás do vídeo
  porque a regra CSS do plano de hardware só cobria `.screen`, não
  `.movie-detail-layout` — mesma causa-raiz do bug `live-tv-toca-audio-sem-imagem`
  da feature 003, numa tela que a proteção existente não alcançava.

**Risco residual aceito, não bloqueante (R-022)**: por decisão explícita do
usuário em 24/09/2026, quatro itens do roteiro de verificação da TV física
não foram executados — o edge case "buscar além do fim" em H, o Cenário I
(retomada ponta a ponta com o app fechado), o Cenário J (Live TV) e a
checagem de segredo em log via `sdb dlog`. Continuam registrados como "não
executado" em `tasks.md`, nunca como "aprovado". Qualquer comportamento
incorreto percebido depois nesses quatro caminhos segue por `sdd-adhoc` ou
`sdd-bugfix` — não reabre esta feature.

**Divergências acumuladas frente ao plano original**: nenhuma de fundo. O
maior ajuste foi a interação da barra de progresso (R-020), que já nasceu
prevista como um refinamento sobre a spec original (D-006, `research.md`
R0-6) e foi ainda mais longe depois do teste em campo — FR-008 foi emendado
de volta (T058) para refletir o modelo final. `jumpBy` mudou de acumulação
(D-009) para descarte (R-019) — mudança de comportamento interno, sem
qualquer requisito de spec que a contradissesse.

**Primeira passada de `sdd-converge` (24/09/2026)**: 7 achados, nenhum
`CRITICAL`. Três acionáveis (FR-008 desatualizado, clamp de 100% sem teste,
nota obsoleta em `research.md`) viraram a Fase 8 (`T058`-`T060`) e foram
sanados nesta sessão. Os quatro restantes já estavam integralmente cobertos
por R-022, sem trabalho novo necessário.

**Estado dos testes automatizados ao final**: `npx vitest run` → 391/391 (39
arquivos); `npx tsc -b` limpo; `npm run lint` limpo (5 warnings pré-existentes,
nenhum novo).

**Não fechado nesta feature, fora do escopo dela**: R-004 (o roteador
`App.tsx` desmonta telas ao navegar, perdendo foco/posição ao voltar de um
detalhe) — achado durante a exploração, pré-existente, encaminhado ao
backlog como `[Bug]`. T052 (Cenários A–E do `quickstart.md` no navegador)
segue disponível, sem bloqueio, para quando fizer sentido rodar.
