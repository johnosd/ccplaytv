# Implementation Plan: Headers da lista no AVPlay e catch-up de programas passados (Xtream)

**Slug**: `058-headers-avplay-catchup` | **Date**: 2026-10-04 | **Spec**: `sdd/specs/058-headers-avplay-catchup/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Duas entregas no player, uma spec (pacote G1 do backlog):

- **US1 (P1, item 25b)** — os headers `User-Agent`/`Referer` que a lista M3U
  declarou (guardados desde a `044`) passam de `fetchPlayback` à sessão e ao
  adaptador; o AVPlay aplica o que aceitar via `setStreamingProperty` entre
  `open` e `prepareAsync`; o que o motor recusar vira diagnóstico `PLAY-05`
  quando a reprodução falha; o "Info do stream" mostra só os nomes.
- **US2/US3 (P2/P3, item 43)** — canais de painel Xtream ganham `archiveDays`
  (`tv_archive`); o Guia marca programas passados disponíveis e, com OK, toca
  o programa do início por uma URL de arquivo montada no relógio do painel; a
  sessão de arquivo é um VOD (`PlayableKind 'archive'`) com linha do tempo do
  EPG, "Ao vivo", sequência automática para o programa seguinte e para o ao
  vivo, sem histórico. "Do início" na linha do player ao vivo; selo de arquivo
  na prévia.

Achado que molda o plano (research R3): a lista real declara arquivo em 75
canais, mas o painel responde 404 nas duas variantes de URL — o catch-up é
aceito por painel falso, e a lista real fica "não testado" (decisão do usuário).

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (`tv-web/`), build `chrome108`.

**Primary Dependencies**: Vite 8, Dexie (IndexedDB), TanStack Query/Virtual,
`webapis.avplay` (TV), `<video>` + `mpegts.js` (só dev, feature 047).

**Storage**: IndexedDB via Dexie **v16** (sem bump: campos de valor sem índice —
`archiveDays` no item, `panelTimezone`/`panelUtcOffsetMinutes`/`archiveVariant` na fonte).

**Testing**: Vitest (projetos `dom` e `node`; `.ts` com DOM em
`TESTES_TS_COM_DOM` de `vite.config.ts`), Playwright via `e2e/*.mjs`, TV física pela skill `tizen-tv`.

**Target Platform**: Samsung QN50Q60DAGXZD — Tizen 9.0 / Chromium 120, origem `file://`.

**Performance Goals**: abrir um programa de arquivo no mesmo tempo de abrir um
filme (uma URL montada localmente, sem consulta extra quando o relógio do painel
já está guardado); o Guia não pode ficar mais lento (marcação é cálculo puro por bloco visível).

**Constraints**: Direct Play (sem proxy); valores de header e URL de arquivo
são segredo (ADR-010); a camada `lib/player` não importa `lib/catalog`;
contratos travados de 027/029/031/041/042 não podem quebrar (ver Cuidados).

**Scale/Scope**: lista real com 2 360 canais ao vivo, 75 com arquivo de 7 dias;
EPG guardado de −12 h a +48 h (030).

## Decisões Invariantes

- **D-001** — Valores de header só atravessam `fetchPlayback` → `createPlayerSession`
  → `adapter.open`. Para cima sobem só nomes (`RequestHeadersReport`). Nunca em
  `useState`, chave de query, log, erro, `aria-*` ou Info técnica.
- **D-002** — No AVPlay, header = `setStreamingProperty` **depois de `open` e antes
  de `prepareAsync`**. Só propriedades provadas na TV (T003); propriedade ausente
  ou que lança = recusado. `User-Agent` → `USER_AGENT`.
- **D-003** — "Aplicado" significa "o motor aceitou a chamada"; o FR-004 só dispara
  quando há recusado **e** a reprodução falha; sem falha, nada muda para a pessoa.
- **D-004** — Ordem do diagnóstico: conta (034) → offline → erro de formato →
  `PLAY-05` (header recusado) → o resto como na 042.
- **D-005** — Programa de arquivo é `PlayableKind 'archive'` com capacidades de
  VOD; a duração e o teto de busca vêm do EPG (`PlayerTimeline`), nunca do motor.
  O programa em exibição tem teto "agora" (FR-014).
- **D-006** — URL de arquivo: início no relógio do painel — fuso nomeado
  (`Intl`, acerta horário de verão) vence o deslocamento medido; sem os dois,
  nenhuma URL (nunca adivinhar fuso). Duração em minutos, arredondada para cima.
- **D-007** — A sondagem de variante é a própria abertura do player: lembrada
  (ou `rest`) → se falhar antes de tocar, a outra → a que tocou é gravada na
  fonte. Nenhum `fetch` de sondagem (origem `file://`, resposta opaca).
- **D-008** — Disponibilidade = canal com `archiveDays > 0`, programa já
  começado, **início** dentro dos dias (FR-008). `get_simple_data_table`/`has_archive`
  não é usado: o EPG continua sendo o da 030.
- **D-009** — Fim de programa de arquivo: só o contíguo (folga 60 s) e disponível;
  o atual termina no "agora" → ao vivo; lacuna → ao vivo. Quem decide é a tela
  (`onArchiveEnded`), nunca o `PlayerLayer`.
- **D-010** — Arquivo nunca grava progresso, histórico nem "Continuar assistindo"
  (`createProgressRecorder(null, …)`).
- **D-011** — "Do início" só no chrome do player ao vivo, depois de "Guia"; a prévia
  ganha só um selo não focável (decisão do usuário, mantém a 049).
- **D-012** — Teclas no arquivo: CH± sempre trocam para o ao vivo do vizinho;
  ↑/↓ trocam só com o chrome oculto; com chrome visível valem as do VOD.
  RETURN: origem Guia → Guia com foco no programa; origem "Do início" → ao vivo.
- **D-013** — Canal sem arquivo mantém o aviso "Este programa já terminou." no
  Guia (contrato travado da 031); canal com arquivo fora dos dias ganha
  "Este programa já saiu do arquivo deste canal.".

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Nada exige conta do app; relógio do painel vem da verificação de conta que já existe (034). |
| Segredos Fora dos Clientes e dos Logs | ⚠️ | ✅ | Headers e URL de arquivo carregam token/credencial. D-001/D-006 + `PlayerError` sanitizado + contrato `everythingRendered()`; ADR-010 já cobre headers (044) e a URL de reprodução de cada item. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Nada reclassifica grupos. |
| IA e Classificação Nunca Inventam Dados | ⚠️ | ✅ | Fuso nunca adivinhado (D-006); disponibilidade só pelo que o painel declara (D-008); "aplicado" não finge que o servidor recebeu (D-003). |
| Comandos Locais Independem de Rede | ✅ | ✅ | Pausa/busca no arquivo são do motor; "Ao vivo"/RETURN só trocam estado local. |
| Trailers e Metadados Não Alteram o Estado | n/a | n/a | — |
| Toda Ação Essencial por Controle Remoto | ✅ | ✅ | Guia (OK), "Do início" e "Ao vivo" na linha de controles; RETURN fecha camada por camada. |
| Lista Nunca É Manifesto de Streaming | ✅ | ✅ | Sem mudança no importador além de ler dois campos. |
| Foco Visível e Sem Becos Sem Saída | ⚠️ | ✅ | Erro `PLAY-06` com "Ao vivo"/"Voltar"; "Do início" desabilitado é soft disabled e OK explica; focar programa no Guia não toca nada (FR-009). |
| Voltar Restaura Foco e Posição | ⚠️ | ✅ | RETURN do arquivo volta ao programa no Guia por identidade (canal + início), nova prop `initialProgramStart`. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | O próprio princípio cita catch-up: D-010 (nada gravado por URL de arquivo); a variante lembrada é por fonte, não por item. |
| Progresso e Capacidades São Reais | ⚠️ | ✅ | Barra só com a duração do EPG; teto no "agora"; "Do início" só existe com arquivo declarado; busca sem prova na TV é risco R-003 com gate. |
| Documentação É Canônica | ✅ | ✅ | Polish atualiza backlog, ADR-010 (nota sobre URL de arquivo), quickstart e `docs/status-features.md` não (só plan/backlog). |
| Validação em hardware real (restrição) | ⚠️ | ✅ | **Elevada a gate** para US1: T003 (TV) no meio da Fase 2, e T014 (busca) no início da Fase 3 — o `<video>` estruturalmente não envia headers. Catch-up na lista real fica "não testado" (decisão do usuário). |

Sem violações não justificáveis — `Complexity Tracking` vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/058-headers-avplay-catchup/
├── spec.md
├── plan.md
├── research.md            # R1–R6: AVPlay, painel real (404), variantes, fuso, busca
├── data-model.md          # campos novos sem bump do Dexie
├── logic/
│   ├── headers.md         # US1: adaptador, sessão, diagnóstico, Info
│   └── arquivo.md         # US2/US3: regras, URL, sessão, chrome, tela, Guia
├── quickstart.md
├── contract-tests.lock
├── handoff.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── vite.config.ts                         # TESTES_TS_COM_DOM (+ contrato do adaptador)
├── e2e/
│   ├── run.mjs                            # SUITE (+ headers-catchup.mjs)
│   └── headers-catchup.mjs                # novo: M3U com header + painel Xtream falso com arquivo
└── src/
    ├── lib/player/
    │   ├── PlayerService.ts               # RequestHeaders/Report, PlayerTimeline, sessão
    │   ├── capabilities.ts                # PlayableKind 'archive'
    │   ├── avplayAdapter.ts               # setStreamingProperty, requestHeadersReport
    │   ├── htmlVideoAdapter.ts            # requestHeadersReport: tudo recusado
    │   └── playbackDiagnosis.ts           # headersNotSent → PLAY-05; PLAY-06
    ├── lib/catalog/
    │   ├── archiveUrl.ts                  # novo: buildArchiveUrl
    │   ├── playbackUrl.ts                 # resolveArchivePlaybackUrl
    │   ├── xtreamConnector.ts             # mapLiveEntry (archiveDays), AccountStatus.clock
    │   ├── categoryLoader.ts              # toItemRecord copia archiveDays
    │   ├── categoryBlocks.ts              # itemsSignature
    │   ├── importPipeline.ts              # caminho eager copia archiveDays
    │   ├── sourceRepository.ts            # markSynced/markAccount gravam o relógio; rememberArchiveVariant
    │   └── db.ts                          # campos novos (sem bump)
    ├── lib/epg/catchup.ts                 # novo: isArchiveAvailable, nextArchiveStep
    ├── lib/errors/errorCatalog.ts         # PLAY-05, PLAY-06
    ├── lib/i18n/messages/{errors,playerUi,live}.ts
    ├── features/catalog/catalogApi.ts     # headers no playback, archive_days, fetchArchivePlayback
    ├── components/
    │   ├── PlayerLayer.tsx, PlayerChrome.tsx, chromeControls.ts, playerPanels.ts, PlayerInfoPanel.tsx, PlayerErrorInfoPanel.tsx
    │   └── player/{usePlayerSession,usePlayerKeyboard,usePlayerChrome,playerErrorActions,playerLayerTypes}.ts
    └── features/live/
        ├── LiveScreen.tsx, liveColumns.tsx, useLiveZapping.ts, useLiveGuide.tsx
        ├── useLiveArchive.ts              # novo: estado e transições do arquivo
        └── guide/EpgGuide.tsx
```

**Structure Decision**: tudo em `tv-web/` (client-first, ADR-008); `api/` não é tocado.
Regras puras novas ficam em `lib/` (`archiveUrl.ts`, `catchup.ts`) e a tela compõe
num hook novo (`useLiveArchive.ts`) para não inchar `LiveScreen`/`useLiveZapping`
(regras da 040: um `useRemoteNav` por componente, refs continuam refs).

## Complexity Tracking

> Sem violações.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).
A US1 só se prova na TV (o `<video>` não envia headers): por isso a T003 é gate (e a T014 para a busca do arquivo).

Comandos-base (em `tv-web/`):

```powershell
npx tsc -b
npm run lint
npx vitest run <arquivos>          # o mais estreito primeiro
npm test
node e2e/headers-catchup.mjs       # com `npm run dev` rodando
npm run test:e2e
npm run build:tizen
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/player/avplayAdapter.headers-avplay-catchup.contract.test.ts`,
`tv-web/src/components/PlayerLayer.headers-avplay-catchup.contract.test.tsx`,
`tv-web/src/lib/epg/catchup.headers-avplay-catchup.contract.test.ts`,
`tv-web/src/lib/catalog/archiveUrl.headers-avplay-catchup.contract.test.ts`

Comando (em `tv-web/`):
`npx vitest run src/lib/player/avplayAdapter.headers-avplay-catchup.contract.test.ts src/components/PlayerLayer.headers-avplay-catchup.contract.test.tsx src/lib/epg/catchup.headers-avplay-catchup.contract.test.ts src/lib/catalog/archiveUrl.headers-avplay-catchup.contract.test.ts`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| aplica o User-Agent entre open e prepareAsync, informa o recusado, e a abertura seguinte sem headers não aplica nada | US1-AC1/AC4/AC6; FR-001, FR-003, FR-004 | Fase 2 | `expected [] to deeply equal [ [ 'USER_AGENT', 'VLC/3.0.20' ] ]` |
| headers do item chegam ao motor; falha com header recusado explica o header sem mostrar o valor; sem headers, o erro é o de sempre | US1-AC1/AC3/AC4; FR-001, FR-002, FR-004, FR-006; Constitution: Segredos | Fase 2 | `expected undefined to deeply equal { userAgent, referer }` |
| arquivo: toca pela URL de arquivo, mostra "Arquivo" e a duração do EPG, "Ao vivo" chama onGoLive, o fim chama onArchiveEnded e nada vai para o histórico | US2-AC2/3/4/5; FR-010..FR-013, FR-019; Constitution: Identidade de Reprodução | Fase 3 | `expected undefined to be 'http://…/timeshift/…'` (a prop `archive` não é lida) |
| disponível só com arquivo, já começado e dentro dos dias; o fim segue para o contíguo, o atual vai ao vivo e lacuna vai ao vivo | FR-008, FR-013; US2-AC5/AC6 | Fase 3 | `Error: not implemented` |
| monta as duas variantes no relógio do painel (fuso nomeado com horário de verão, ou deslocamento medido) e recusa sem relógio | FR-017, FR-020; Constitution: Nunca Inventam Dados | Fase 3 | `Error: not implemented` |

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/player/PlayerService.ts` (tipos + `requestHeaders` fixo),
`tv-web/src/lib/player/capabilities.ts` (`'archive'` = FULL — já definitivo),
`tv-web/src/lib/player/avplayAdapter.ts` (`_headers` ignorado, `requestHeadersReport` fixo),
`tv-web/src/lib/catalog/archiveUrl.ts`, `tv-web/src/lib/epg/catchup.ts` (funções que lançam),
`tv-web/src/features/catalog/catalogApi.ts` (`headers`, `archive_days`, `fetchArchivePlayback` que lança),
`tv-web/src/components/player/playerLayerTypes.ts` (props `archive`/`onArchiveEnded`/`onGoLive`/`startOver`, `PlayerArchive`),
`tv-web/src/components/PlayerErrorInfoPanel.tsx` + `lib/i18n/messages/playerUi.ts` (rótulo de mídia `archive`, já definitivo),
`tv-web/vite.config.ts` (contrato do adaptador em `TESTES_TS_COM_DOM`).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup) | Concluída — servidor de teste `e2e/lib/servidorHeadersArquivo.mjs` (lista com header, inclusive filme — A1; painel Xtream falso com arquivo; `/_registro`) |
| Fase 2 (US1) | Concluída — T003 feita na TV em 2026-10-05: User-Agent chega ao servidor; `Referer` sem propriedade provada (recusado) |
| Fase 3 (US2) | Concluída — T014 feita na TV em 2026-10-05: busca ok com e sem `Range` (arquivo de teste de 30 s; timeshift longo real não provado) |
| Fase 4 (US3) | Concluída — "Do início" no chrome do Live (depois de "Guia") e selo "Arquivo · N dias" na prévia |
| Polish | Concluída — E2E 37/37, `npm test` 2714/2714, `build:tizen` ok; T043 na TV em 2026-10-05; R-011 logado (item 71 do backlog); catch-up com lista real **não testado** (R-002) |
| Contratos | 5/5 verdes; trava íntegra; travas de todas as features `PASS` |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Não está provado que `setStreamingProperty('USER_AGENT')` chega ao servidor nesta TV, nem que exista propriedade para `Referer`. O "spike do item 58" citado no backlog não deixou evidência. | Alto (US1 inteira) | **Resolvido para `User-Agent`** (T003 na TV, 2026-10-05: `CCPlayTeste/1.0` chegou ao servidor; o UA não vaza para o canal seguinte). `Referer` **não chegou** e nenhuma propriedade foi provada: segue recusado. **T003 foi o gate da Fase 2** (servidor na LAN registrando headers). Se `USER_AGENT` não chegar: parar e voltar ao `sdd-plan` — FR-001 não pode ser cumprido só com código. `Referer` sem propriedade provada fica `undefined` em `PROPERTY_OF` (recusado → FR-004). |
| R-002 | A lista real declara arquivo (75 canais, 7 dias) mas o painel responde 404 nas duas variantes (research R3). | Alto (valor do catch-up para o usuário) | Decisão do usuário (2026-10-04): manter, aceite por painel falso, lista real = "não testado" + exercita `PLAY-06`. Nunca registrar o catch-up como validado na TV com essa lista. Registrado (2026-10-04): catch-up com a lista real = **não testado**. |
| R-003 | Busca (±10 s, barra) num TS de timeshift pode não funcionar no AVPlay se o servidor não aceitar `Range`. | Alto (FR-012; constitution "Capacidades São Reais") | **T014 executada na TV em 2026-10-05: a busca funcionou com e sem `Range`** (filme de teste de 584 KB, baixado por inteiro; o caminho `archive` e um timeshift grande de provedor real não foram provados — o risco só é resolvido nesse recorte). T014 testa com o painel falso com e sem `Range`. Sem `Range` e sem busca: **parar a Fase 3 e voltar ao `sdd-plan`** (busca por reabertura no minuto muda os controles); não remendar. |
| R-004 | Contratos travados que montam o player/guia sem as props novas: 027 (`player-chrome`), 029, 031 (`PlayerLayer`/`EpgGuide`/`LiveScreen`), 041 (contagem de passos na linha), 042 (`playbackDiagnosis`). | Médio | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. Tudo novo é opt-in por prop (`archive`, `startOver`, `onWatchArchive`, `headersNotSent`); "Guia" continua o 1º do Live; `goLive` só entra com arquivo. Rodar as travas de todas as features a cada fase. |
| R-005 | `Intl.DateTimeFormat` com `timeZone` nomeado no Chromium 120 do Tizen — esperado, não provado. | Médio | Fallback para o deslocamento medido já é parte do D-006; T003 confere. T003 rodou em 2026-10-05 sem esta checagem (Web Inspector não usado): **segue aberto/não provado na TV**. |
| R-006 | O contrato travado da 031 exige "Este programa já terminou." no OK de programa passado (fixture sem arquivo). | Baixo | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. D-013: mantido para canal sem arquivo; FR-010 e US2-AC6 refinados na spec. |
| R-007 | No navegador do dev, o arquivo `.ts` toca pelo `mpegts.js` (047) — que não prova nada da TV; e o `<video>` nunca envia headers. | Baixo | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. E2E prova fluxo/UI/erros; TV prova motor (T003, T014 + passada final). |
| R-008 | Voltar do app oculto num arquivo pausado: o programa pode ter saído do arquivo nesse intervalo. | Baixo | Resolvido: confirmado pela auditoria do `sdd-converge` de 2026-10-05. `verifyResume` usa `fetchArchivePlayback`; 409 → `onArchiveEnded` (logic §4). |
| R-009 | Decisão do usuário (2026-10-04): os gates na TV T003 (headers) e T014 (busca sem `Range`) ficam para o fim, junto da passada T043, em vez de bloquear as Fases 2 e 3. | Alto se um gate falhar: US1 (FR-001) ou os controles de busca do arquivo (FR-012) teriam de ser refeitos depois de prontos | Resolvido: T003 e T014 foram feitas na TV em 2026-10-05, condição para sair de "Implementada" pendente. Risco aceito pelo usuário. Fases 3–5 seguem; T003 e T014 continuam obrigatórias antes de declarar a feature pronta — sem elas o status não passa de "Implementada (gates na TV pendentes)". Se T003 falhar: voltar ao `sdd-plan` (R-001); se T014 falhar: idem (R-003). |
| R-010 | Achado no T031: `usePlayerSession` captura os callbacks da tela no efeito da sessão (deps só `itemId`/`attempt`/…); o `onArchiveEnded` do 1º render via a programação do canal ainda vazia e mandava o fim do programa ao ao vivo. | Médio (FR-013 quebrado em produção) | Resolvido: `onArchiveEndedRef` sempre com o callback mais recente (mesmo motivo dos refs da 027). |
| R-011 | Achado no E2E (T038), **fora do escopo**: o adaptador `<video>` de desenvolvimento (`htmlVideoAdapter.ts`, desde a 003) põe a URL do stream no atributo `src` do `<video>` — no navegador do dev a URL de arquivo (e qualquer URL ao vivo/VOD com credencial) fica no DOM. Na TV o AVPlay não usa o DOM. | Baixo (só no navegador do dev; nunca visível na tela; afeta toda reprodução, não só a 058) | Decidido pelo usuário em 2026-10-05: logar e seguir. Registrado como `[Bug]` item 71 em `.planning/backlog.md` (Ideias Futuras; corrigir via `sdd-bugfix`). O E2E da 058 deixa o `<video>` de desenvolvimento fora da varredura de segredos, com comentário. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-04 | Fase 1 (Setup) | T001: servidor de teste com lista M3U com header (canal + filme, A1), painel Xtream falso com arquivo, `Range` e variantes configuráveis, `/_registro` | T003 precisa da TV ligada na LAN |
| 2026-10-04 | Fase 2 (US1) | Concluída — T003 feita na TV em 2026-10-05: User-Agent chega ao servidor; `Referer` sem propriedade provada (recusado) |
| 2026-10-04 | Fase 3 (US2) | Concluída — T014 feita na TV em 2026-10-05: busca ok com e sem `Range` (arquivo de teste de 30 s; timeshift longo real não provado) |
| 2026-10-04 | Fase 4 (US3) | "Do início" (chrome/teclado/`useLiveArchive`) e selo da prévia; testes de tela do fluxo e do selo | E2E (T038); T003/T014 na TV |
| 2026-10-04 | Polish | Concluída — E2E 37/37, `npm test` 2714/2714, `build:tizen` ok; T043 na TV em 2026-10-05; R-011 logado (item 71 do backlog); catch-up com lista real **não testado** (R-002) |
| 2026-10-05 | Polish (TV) | T003, T014 e T043 na TV com o servidor falso na LAN: UA chega (sem vazamento), busca ok com e sem `Range`, selo + "Do início" + pedido `/timeshift` ok; ⏩ parou após ~2 saltos (arquivo de teste de 29,9 s, suspeita de artefato); R-011 logado (item 71) | Lista real e `Referer`/`Intl` na TV não provados; `sdd-converge` |

**PRÓXIMO**: `sdd-converge 058-headers-avplay-catchup`; o catch-up com a lista real segue "não testado".

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/components/player/usePlayerSession.ts` — caminho do arquivo (variante, `PLAY-06`, timeline, `onArchiveEndedRef`)
- `tv-web/src/features/live/useLiveArchive.ts` — estado/comportamento do arquivo na Live (RETURN, fim, CH±, "Do início")
- `tv-web/src/features/catalog/catalogApi.ts` — `fetchArchivePlayback`, `archive_days`, `headers`
- `tv-web/e2e/headers-catchup.mjs` — E2E dos Cenários A e B (no `SUITE`)
- `tv-web/e2e/lib/servidorHeadersArquivo.mjs` — servidor de teste (E2E e gates na TV)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `usePlayerSession` lê callbacks da tela dentro do efeito da sessão: um callback que depende de dado carregado DEPOIS (programação, lista) precisa de ref com o valor mais recente (R-010).
- Testes de tela que apertam uma tecla logo depois de um estado novo aparecer: o `useRemoteNav` troca os handlers num efeito — espere um tique (`act` + `setTimeout 0`) antes da tecla, senão a tecla age no estado anterior (flake de 1 em 3 visto no T031).
- `npm run test:e2e -- --only x` no PowerShell: o `npm` consome o `--only` (aviso "invalid config only") e roda a suíte INTEIRA. Use `node e2e/run.mjs --only x`.

## Resultado Final

Convergida em 2026-10-05, depois de `Implementada` (53/53 tasks, contratos 5/5 verdes, trava íntegra). Sem lacuna de código; um limite de validação física registrado abaixo.

**O que foi construído.** (1) Headers da lista no AVPlay (US1): o item guarda `User-Agent`/`Referer` (feature 044) e `applyHeaders` aplica `USER_AGENT` por `setStreamingProperty` no estado IDLE; `Referer` não tem propriedade provada (`PROPERTY_OF.Referer = undefined`) e é recusado, com erro acionável (`PLAY-05`, "esta lista exige um header que esta TV não envia") só quando a reprodução falha. Valores nunca aparecem em log, UI ou diagnóstico; "Info do stream" lista só os nomes. (2) Catch-up Xtream (US2): `tv_archive`/`tv_archive_duration` guardados por canal (`archive_days`), `isArchiveAvailable`, programas do Guia marcados e OK toca do início, duas variantes de URL sondadas e a que funcionou lembrada, chrome com título/horário, ⏪/⏩ limitados ao agora (`maxPositionMs`), barra do EPG, "Ao vivo", transição para o programa seguinte ou o ao vivo, CH± troca para o vizinho, e nada disso entra no Histórico. (3) "Do início" (US3) no chrome do Live, depois de "Guia" (desabilitado sem programa atual), e selo "Arquivo · N dias" na prévia.

**Desvios em relação ao plano original.** FR-015 emendado no `sdd-plan`: a prévia da Live não tem elemento focável desde a 049, então o selo é não focável e "Do início" mora no player. OK com a faixa recolhida abre o zapping; a linha de controles (onde está "Do início") abre com ←/→ — desenho existente do player, não alterado.

**Provado na TV física (2026-10-05, relato do usuário conferido no `/_registro` do servidor falso na LAN).** `User-Agent` chega ao servidor e não vaza para o canal seguinte; busca no filme `.ts` funciona com e sem `Range`; selo e "Do início" aparecem e a TV pede `/timeshift/…`.

**Não provado (limites aceitos).** `Referer` (sem propriedade); `Intl.DateTimeFormat` com fuso nomeado na TV (R-005); busca num timeshift longo e real (o arquivo de teste dura 29,9 s e o ⏩ parou depois de ~2 saltos de 10 s, suspeita de artefato do arquivo, não provada); catch-up com lista real (R-002, SC-006: "não testado", nunca aprovado); e SC-001 só foi exercitado na TV com canal — `Filme Header` e episódio com header passaram apenas nos testes automatizados (unit e E2E 37/37). Também não ficou registrado se o catch-up de 05/10 foi aberto por "Do início" ou pelo Guia.

**Ainda aberto.** R-011 virou o `[Bug]` 71 do backlog (URL do stream no `src` do `<video>` de dev; pré-existente desde a 003). R-002 e R-005 seguem como registrados.