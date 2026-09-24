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
| `resumePolicy.ts` | `RESUME_MIN_SECONDS=30`, `RESUME_MAX_RATIO=0.95`, `PROGRESS_WRITE_INTERVAL_SECONDS=5`; `isResumable`/`isPastEnd`/`shouldWriteProgress` puras e testadas. |
| `capabilities.ts` | `mediaCapabilities(kind)` e `resolveCapabilities(engine, kind)` prontos; `PlayableKind` local (não importa `lib/catalog`, R-012). |
| `PlayerService.ts` | `PlayerState` com `paused`/`completed`; `PlayerAdapter`/`PlayerAdapterCallbacks` com capacidades, pausa, busca (`onSettled`), progresso; `PlayerServiceSession` resolve capacidades no construtor, expõe `togglePause`/`seekTo`/`jumpBy` com porta single-flight e grampeamento aos limites reais, traduz `onCompleted` por capacidade da mídia (D-008); `createPlayerSession` exige `kind`, aceita `startAtMs`. |
| `avplayAdapter.ts` | Superfície completa implementada (`pause`/`resume`/`seekTo`/`jumpBy`/progresso/`onCompleted`) — **não verificada em hardware** (gate: Fase 6). |
| `htmlVideoAdapter.ts` | Mesma superfície via `HTMLMediaElement`, suporta tudo sempre (motor de desenvolvimento). |
| `components/PlayerLayer.tsx` | Movido de `features/live/PlayerOverlay.tsx` (T020, `git mv`), com `title`/`unavailableMessage`/`genericErrorMessage` generalizados (D-007). Consome `PlayerControls.tsx` (T022) e implementa `controlsVisible`/`focusedIndex`/temporizador de 5s (T023), com os dois ajustes de R-014/R-015 (foco inicial no play/pause; reagenda o temporizador reagindo à confirmação real de pausa, não ao momento do SELECT). |
| `features/live/LiveScreen.tsx` | Importa `PlayerLayer` (T021), passando as mensagens de canal originais — comportamento idêntico a antes da migração (FR-022, suíte `LiveScreen.test.tsx` sem alteração de asserção). |
| `features/movies/MovieDetailScreen.tsx` | Ação primária "Assistir" liga a `PlayerLayer` (T024); OK nos estados de carregando/erro ativa o botão focado (T025, R-005 local). |
| `features/screens.css` | `.player-controls`/`.player-time`/`.player-time-bar`/`.player-buttons`/`.player-control-button` (T026) — barra ancorada embaixo da camada, tokens de `index.css`. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Nada da superfície de VOD do AVPlay (`getDuration`, `oncurrentplaytime`, `seekTo`, `pause`) foi exercitado na QN50Q60DAGXZD — o adaptador só usa `open`/`play`/`stop`/`close` | **Alto** — é a premissa que sustenta a barra de progresso e a retomada | Superfície confirmada na referência oficial Samsung (`research.md` R0-1). Verificação em hardware é gate desta feature: Cenários F–I do `quickstart.md`. FR-004 já define a degradação se a duração não vier |
| R-002 | `jumpForward`/`jumpBackward` restringem outras chamadas à API enquanto a operação assíncrona não volta. Segurar a seta emite saltos mais rápido do que o motor os conclui | **Alto** — congelamento do app na TV, invisível no navegador | Porta single-flight com acumulação (D-009, `logic/reproducao-vod.md` §3), testada sem DOM e verificada no Cenário H (segurar a seta 3 s) |
| R-003 | A camada compartilhada é o único caminho de reprodução comprovado na TV (feature 003). Generalizá-la pode regredir a Live TV | **Alto** — perderia a única prova de reprodução que o projeto tem | FR-022 + D-003 (controle sem capacidade não é renderizado) mantêm o caminho de canal idêntico. Cenário E (navegador) e Cenário J (TV) reexecutam a verificação da 003. SC-005 |
| R-004 | **Achado na exploração**: `App.tsx` é um `switch` que renderiza uma tela por vez, então abrir o detalhe **desmonta** `MoviesScreen`. Voltar do detalhe reconstrói a tela do zero — categoria não entrada, foco no início, rolagem perdida | Médio — viola "Voltar Restaura Foco e Posição" | **Pré-existente, não introduzido por esta feature**, e fora do escopo dela (a spec trata do retorno *do player para o detalhe*, que funciona por ser camada). Encaminhar ao backlog como `[Bug]` na fase Polish. Corrigir exige estado de foco no histórico de navegação ou manter telas montadas — decisão de design, não ajuste |
| R-005 | O bug conhecido R-011 da feature 010 (botão com `.tv-focus` não é ativado por OK) atinge os estados de carregando/erro do `MovieDetailScreen`, que esta feature toca | Médio — botão que só funciona por mouse | Corrigido **localmente** nas telas desta feature, roteando `onSelect` para o botão do estado ativo. **Não** altera o `useRemoteNav` global — esse continua sendo o bug de backlog, porque afeta várias telas e é decisão de design |
| R-006 | `onstreamcompleted` tem significados opostos por tipo de mídia. Se a tradução errar, ou todo filme termina numa tela de erro, ou uma queda de transmissão ao vivo parece conclusão bem-sucedida | Médio | D-008: o adaptador sempre emite `onCompleted` e a **sessão** traduz pela capacidade da mídia. Teste de contrato cobre os dois sentidos explicitamente |
| R-007 | A duração pode não vir para alguns contêineres, deixando a barra sem denominador | Baixo/Médio — seria o percentual inventado que a constitution proíbe | FR-004 já define: tempo decorrido, sem barra, sem percentual. O Cenário G **registra qual dos dois ocorreu** na TV, em vez de presumir |
| R-008 | Acrescentar `paused`/`completed` a `ALLOWED_NEXT` pode afrouxar a proteção contra callback atrasado que a tabela existe para dar | Baixo | `completed` é terminal exceto por `closed`, como `error`. Os testes cobrem as transições **proibidas**, não só as permitidas |
| R-009 | Gravar progresso a cada 5 s durante um filme concorre com o IndexedDB, que a feature 010 também usa para obter categorias em segundo plano | Baixo | Escrita é um `put` por chave primária em `userStates` — tabela que a 010 não toca (ela escreve em `channels`/`categories`) — dentro de uma transação curta que já existe (`upsert`, `userStateRepository.ts:72`) |
| R-010 | `buildStableId` **lança** quando o item não tem identificador nem nome (`userStateRepository.ts:41`) | Baixo | D-010: a exceção é contida na camada de progresso e nunca vira erro de player. Filme toca; só não grava retomada |
| R-011 | **Achado na Fase 2**: o contrato original (`player-capabilities.md`) não especificava como a sessão saberia quando uma chamada assíncrona de `seekTo`/`jumpBy` no motor volta, nem como `startAtMs` chegaria ao adaptador a tempo de rodar antes do `play()` — os dois são exigidos pela lógica documentada (porta single-flight, §3; retomada, §5), mas as assinaturas de tipo não os expunham | Médio — sem isso, a porta single-flight não tem como saber quando liberar, e a retomada piscaria o início antes de saltar | **Resolvido**: `seekTo?`/`jumpBy?` do `PlayerAdapter` ganharam um segundo parâmetro `onSettled: () => void`; `open()` ganhou um terceiro parâmetro opcional `startAtMs`. Os dois documentados retroativamente em `contracts/player-capabilities.md` (§2 e novo §4.1), consistente com "Documentação do Repositório É Canônica" |
| R-012 | **Achado na Fase 1/2**: `capabilities.ts` importava `CatalogItemKind` de `lib/catalog/db`, o que criaria uma dependência `lib/player → lib/catalog` — o inverso da fronteira unidirecional que o backlog (item 49) propõe (`lib/catalog/ → lib/player/`) | Baixo — nada quebraria hoje (item 49 ainda não é lint-enforced), mas compraria dívida logo na primeira feature que toca o player | **Resolvido**: `PlayableKind` definido localmente em `capabilities.ts`, estruturalmente idêntico a `CatalogItemKind`. Um `CatalogItemKind` real satisfaz `PlayableKind` por tipagem estrutural — nenhum ponto de chamada precisa converter ou importar de `lib/catalog` |
| R-013 | **Conflito achado na Fase 3 (gatilho de parada do `sdd-execute`)**: a Acceptance Scenario 6 da US1 dizia "a busca não é oferecida" sem duração confiável, mas o contrato trata `canSeek`/`reportsDuration` como capacidades independentes — salto relativo (±10s) não precisa saber o total | Médio — decidiria se ⏪/⏩ desaparecem junto com a barra, ou só a barra some | **Resolvido com o usuário (23/09/2026)**: só a barra/percentual dependem de duração; avançar/retroceder continuam disponíveis sempre que `canSeek` for verdadeiro. `spec.md` AS6 corrigida com nota de rastreio; nenhuma mudança de código necessária — o design já implementava isto |
| R-014 | **Achado ao rodar a suíte herdada de T017/T018 (retomada da Fase 3)**: `playerControlsActions` ordena `[jumpBack, playPause, jumpForward]` (`canSeek` empurra `jumpBack` antes de `canPause` empurrar `playPause`), mas `PlayerLayer.tsx` inicializava e resetava `focusedIndex` para `0` — focando `jumpBack`, não o play/pause que `logic/reproducao-vod.md` §4 exige ("o foco inicial, ao revelar, é sempre o play/pause") | Alto — SELECT com controles recém-revelados executaria um salto em vez de pausar/retomar, e nenhum teste unitário existente pegava isso (a suíte de T018 é que expôs, ao ser rodada pela primeira vez) | **Resolvido**: `playPauseIndexOf(capabilities)` calcula o índice real de `playPause` dentro de `playerControlsActions(capabilities)` (com fallback `0` se a ação não existir); usado tanto na criação da sessão quanto em `revealControls()`, em vez do literal `0` |
| R-015 | **Achado no mesmo lote**: `scheduleHide()` só era chamado dentro dos handlers de tecla, lendo `sessionRef.current.state` **no momento da tecla** — mas `togglePause()` só chama `adapter.pause()`, e a transição real para `paused` só chega depois, pelo callback assíncrono do motor (`onStateChange`). O temporizador de 5s ficava armado com o estado "tocando" e escondia a barra mesmo já pausado, violando `logic/reproducao-vod.md` §4 ("o temporizador não roda enquanto pausado") | Médio/Alto — pausar e sair da tela por 5s faria os controles sumirem sem ação nenhuma, na Live TV e em Filmes igualmente (código compartilhado) | **Resolvido**: novo `useEffect` reage à mudança real de `phase.state` (via uma variável derivada `sessionState`, não ao objeto `phase` inteiro — que muda a cada `onProgress`) e rechama `scheduleHide()` toda vez que o estado confirmado muda, cancelando o temporizador assim que `paused` é confirmado e rearmando ao retomar |

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

**PRÓXIMO**: Fase 4 (User Story 2 — Retomar de onde parou, T027–T038) — criar `progressRecorder.ts`, ligar a gravação de progresso à `PlayerLayer` e trocar a ação primária do `MovieDetailScreen` entre Assistir/Retomar/Reiniciar via `useUserState`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/components/PlayerLayer.tsx` — camada de reprodução compartilhada (Fase 3: R-014/R-015 corrigidos)
- `tv-web/src/components/PlayerControls.tsx` — barra de controles (Fase 3, T022)
- `tv-web/src/features/live/LiveScreen.tsx` — consome `PlayerLayer` (Fase 3, T021)
- `tv-web/src/features/movies/MovieDetailScreen.tsx` — ação primária liga a `PlayerLayer` (Fase 3, T024/T025); próximo alvo: ação Retomar/Reiniciar (Fase 4, T036)
- `tv-web/src/lib/player/PlayerService.ts` — contrato, estados, sessão (estendido, Fase 2)

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
