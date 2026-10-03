# Implementation Plan: IME da TV nos formulários — teclado, Next/Done, senha e erros de conexão

**Slug**: `045-ime-formularios-tv` | **Date**: 2026-10-02 | **Spec**: `sdd/specs/045-ime-formularios-tv/spec.md`

## Summary

Backlog item 18. Três mudanças que o cadastro de lista precisa para ser o "primeiro contato" decente na TV:
(1) **confirmar a conexão antes de sair do formulário** — os quatro erros da 042 (`SRC-001`, `NET-01/02`,
`SRC-401`, `SRC-422`) passam a aparecer no próprio formulário, com os dados preservados, numa faixa única e
com o foco na ação; (2) **Next/Done e cobertura do campo** — o Done do IME leva à ação sem enviar, e o campo
focado sobe para a metade de cima da tela; (3) **"Mostrar/Ocultar" da senha** (e da chave TMDB). Vale para
cadastro/edição de lista, chave TMDB e EPG manual.

Abordagem: um módulo de lib novo e **sem React** (`lib/catalog/sourceConnectionCheck.ts`) que **reusa** o
conector Xtream e o parser M3U que a importação já usa — a confirmação nunca diverge do que a importação
consegue. Uma tabela única das teclas do IME (`lib/imeKeys.ts`) porque o que a Samsung entrega à página **não
foi medido** (R-001): tudo o que depende disso muda num lugar só depois da passada na TV. `TextField` ganha o
"mostrar" e a cobertura; um hook (`useImeChain`) liga Done ao botão de ação.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Vite (build `chrome108`, ver CLAUDE.md — não remover).

**Primary Dependencies**: as já existentes — `@tanstack/react-query` (mutations de `importApi.ts`),
`xtreamConnector.ts`, `m3uParser.ts`, `m3uPanelUrl.ts`, `errors/errorCatalog.ts`, `network/networkState.ts`.
Nenhuma dependência nova.

**Storage**: nenhuma mudança. Sem versão do Dexie (próxima livre segue **v16**, não usada). O resultado da
confirmação é transitório; "revelado" é estado de componente.

**Testing**: Vitest + Testing Library (jsdom), Playwright E2E (`tv-web/e2e/*.mjs`, dev server), contratos
travados por `check-contract-tests.ps1`.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, origem `file://`), palco 1920×1080.

**Performance Goals**: faixa de erro em ≤ 1 s após a falha ser conhecida (SC-001); confirmação com limite
de 15 s.

**Constraints**: constitution 1.7.0 (segredos, foco, RETURN, "defeito nosso nunca vira falha de rede");
ADR-008/010 (credencial só no IndexedDB, nunca em log/UI); ADR-009 (`useRemoteNav` é do projeto — esta feature
**não o altera**, só adiciona listeners no contêiner); `Enter` num campo continua do teclado do sistema.

**Scale/Scope**: 3 telas (`AddSourceScreen`, `TmdbKeyScreen`, `EpgSettingsScreen`), 1 componente compartilhado
(`TextField`, que a busca também usa), 1 módulo de lib, 2 hooks/utilitários pequenos.

## Decisões Invariantes

- **D-001** A confirmação roda **antes** de `createSource`/`updateSource` e nunca grava nada; falha = nenhuma
  fonte órfã. Reusa as funções da importação — nenhuma segunda implementação do protocolo.
- **D-002** No M3U, a confirmação lê **até a primeira entrada** e cancela o download (`for await` com `return`
  fecha o gerador → `reader.cancel()`); nunca baixa a lista.
- **D-003** Xtream sem protocolo JSON mas com M3U de fallback servindo é **sucesso** (`route: 'limited'`);
  `SRC-422` só quando o fallback também falha (FR-004). `direct_connection_refused` = `NET-02`.
- **D-004** `Enter` **nunca** é interceptado num campo (abrir/fechar o teclado do sistema é dele). Só o
  `keyCode` de **Done** do IME conclui o campo. Done num campo do meio avança ao próximo campo; no último,
  foca a ação principal. **Nunca** envia (FR-014). *Estreita o "(ou Enter)" da spec — R-011.*
- **D-005** Nenhum `keyCode` inventado: `IME_KEYCODES.next` fica vazio até a medição na TV (R-001).
- **D-006** Faixa de erro **única** (`role="alert"`), conteúdo só da tabela da 042 + código; **nunca** URL,
  usuário, senha ou mensagem crua. Fica até a próxima tentativa. O botão de ação vira "Tentar de novo" só para
  códigos `retryable`; o foco vai sempre ao botão de ação.
- **D-007** Limite de 15 s por `Promise.race` + `AbortController` (um `fetch` pode ignorar o sinal) e trava de
  envio **síncrona** por `useRef` (dois OK seguidos passam pelo `isPending`). RETURN com confirmação ativa
  cancela e **não** sai; sem confirmação, sai.
- **D-008** Em edição a confirmação só roda se endereço/usuário/senha/URL M3U mudaram; campos em branco são
  completados por `readCredential` **dentro do helper**, nunca em estado de tela, query key, log ou banner.
- **D-009** Erro inesperado da confirmação **sobe** (não vira "falha de rede"): a tela cai na linha genérica
  que já existe. Nenhum código novo na tabela (spec: fora de escopo).
- **D-010** "Mostrar/Ocultar" mora **dentro** de `TextField` (`revealable`, estado do componente → desmontar
  zera, FR-020); botão logo depois do `<input>`, `aria-pressed`, nome "Mostrar/Ocultar senha|chave".
- **D-011** Cobertura = o `.text-field` inteiro na metade superior do contêiner rolável, com folga de metade
  do palco no fim da área rolável das telas de formulário; geometria pura e testada.
- **D-012** Nenhum arquivo novo emitido pelo build ⇒ `tizen_web_project.yaml` inalterado.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | A confirmação só impede **criar uma lista nova** que o painel confirmou recusar/offline; a interface e as outras listas seguem abertas. Falha de rede nunca apaga nada (nada é gravado). |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Faixa/anúncio só da tabela da 042; resultado da confirmação não carrega URL/usuário/senha; erro cru nunca é logado nem exibido; "revelado" só no próprio `<input>`. Revisão de segredos antes do commit (C5-contrato + E2E SC-006). |
| Categorias da Fonte São Preservadas | n/a | n/a | — |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | `IME_KEYCODES.next` vazio até medir; códigos de erro só os da tabela. |
| Comandos Locais Independem de Rede | ✅ | ✅ | Foco, RETURN, Next/Done, Mostrar são locais; RETURN cancela a espera de rede, nunca depende dela. |
| Trailers e Metadados Não Alteram o Estado | n/a | n/a | — |
| Toda Ação Essencial Tem Caminho por Controle Remoto | ✅ | ✅ | Tudo por setas+OK+RETURN; Done leva à ação, nunca submete sozinho. |
| Lista de Catálogo Nunca É Manifesto | ✅ | ✅ | A leitura da primeira entrada usa o mesmo detector de HLS do importador → `SRC-422`. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Todo desfecho (sucesso, falha, cancelado) deixa o foco no botão de ação; "Mostrar" é focável e ativável. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | RETURN fecha primeiro a camada (a espera); só depois sai da tela. Nenhuma navegação nova. |
| Identidade de Reprodução Não Depende da URL | n/a | n/a | — |
| Progresso e Capacidades São Reais | ✅ | ✅ | "Conectando…" é indeterminado (sem %); "carregando" não esconde credencial inválida — é o ponto da feature. |
| Documentação Canônica | ✅ | ✅ | T022 atualiza CLAUDE.md, backlog; o contrato da 037 só muda com aprovação (R-003). |

Sem violações ⇒ `Complexity Tracking` vazio. ADRs relidas: ADR-008/010 (credencial no aparelho, nunca em
log/UI — respeitadas), ADR-009 (`useRemoteNav` intocado). Nenhuma exige emenda.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/045-ime-formularios-tv/
├── spec.md
├── plan.md                          # este arquivo
├── research.md                      # R0-1 (IME real), R0-2 (duplicação mínima), R0-3 (Modo limitado)
├── quickstart.md
├── logic/
│   ├── verificacao-conexao.md       # árvore de decisão + tempo/cancelamento + tela
│   └── ime-teclas-e-cobertura.md    # tabela de teclas, useImeChain, cobertura, "Mostrar"
├── tasks.md
├── handoff.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── lib/
│   │   ├── catalog/
│   │   │   ├── sourceConnectionCheck.ts            # NOVO (stub do plan; corpo = T004)
│   │   │   └── sourceConnectionCheck.ime-formularios.contract.test.ts   # TRAVADO
│   │   ├── imeKeys.ts                              # NOVO (T003)
│   │   ├── useImeChain.ts                          # NOVO (T013)
│   │   ├── imeProbe.ts                             # NOVO, dev-only (T001)
│   │   └── focus/revealInTopHalf.ts                # NOVO (T015)
│   ├── components/
│   │   ├── TextField.tsx                           # +revealable/revealNoun/enterKeyHint/onFocus→cobertura
│   │   ├── Button.tsx                              # +buttonRef (aditivo)
│   │   └── ImeProbeOverlay.tsx                     # NOVO, dev-only (T001; molde de PerfOverlay.tsx)
│   ├── features/
│   │   ├── import/
│   │   │   ├── AddSourceScreen.tsx                 # orquestração: confirmar → criar; faixa; RETURN; foco
│   │   │   ├── connectionBanner.ts                 # NOVO: code → conteúdo da faixa (usa describeError)
│   │   │   ├── ConnectionErrorBanner.tsx           # NOVO: faixa única role="alert"
│   │   │   ├── connectionInput.ts                  # NOVO: edição (null = não consulta) + readCredential
│   │   │   ├── AddSourceScreen.ime-formularios.contract.test.tsx   # TRAVADO
│   │   │   └── AddSourceScreen.entrada-listas.contract.test.tsx    # TRAVADO DA 037 — ver R-003
│   │   └── settings/
│   │       ├── TmdbKeyScreen.tsx                   # usa revealable; chain; cobertura
│   │       └── EpgSettingsScreen.tsx               # chain; cobertura (+ overflow)
│   └── styles/
│       ├── components.css                          # .text-field-control, toggle, .form-scroll-room
│       ├── onboarding.css                          # faixa .connection-banner
│       └── settings.css                            # overflow-y/no-scrollbar nas telas de EPG/TMDB
└── e2e/
    ├── ime-formularios.mjs                         # NOVO (entra em `test:e2e`)
    └── lib/entrada.mjs                             # painel falso passa a atender a confirmação
```

**Structure Decision**: estrutura real do `tv-web/` (feature-first em `src/features/*`, lib pura em
`src/lib/*`, componentes compartilhados em `src/components`, CSS em `src/styles`). A lógica de rede/regra
fica em `lib/catalog` sem React (testável sem DOM); a tela só orquestra.

## Complexity Tracking

> Sem violações do Constitution Check — nada a justificar.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| — | — | — |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (TV, último recurso).

Comandos-base (a partir de `tv-web/`):

```powershell
npx vitest run <arquivos>          # um arquivo por vez, antes da suíte inteira
npx tsc -b
npm run lint                       # 45 avisos é a linha de base aceita (040); 0 erros
npm run test:e2e                   # dev server reiniciado e de pé
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/catalog/sourceConnectionCheck.ime-formularios.contract.test.ts` (2) e
`tv-web/src/features/import/AddSourceScreen.ime-formularios.contract.test.tsx` (3) — **5/5**.

Comando: `npx vitest run src/lib/catalog/sourceConnectionCheck.ime-formularios.contract.test.ts src/features/import/AddSourceScreen.ime-formularios.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| distingue endereço inválido (sem rede), offline, falha de conexão, credencial recusada e resposta incompatível | US1/AC1-AC4, FR-002/003 | Fase 2 (T004) | `Error: not implemented` |
| painel sem protocolo Xtream cujo M3U serve confirma como "limited" e abandona o download depois da primeira entrada | US1/AC5, FR-004, Constitution: lista ≠ manifesto | Fase 2 (T004) | `Error: not implemented` |
| credencial recusada: o formulário permanece com os dados, uma única faixa com o código, foco na ação, nada criado e nenhum segredo à vista | US1/AC3+AC7, FR-005/006/007, SC-006, Constitution: segredos/foco | Fase 3 (T010) | `Unable to find role="alert"` (hoje cria a fonte e navega) |
| durante a confirmação um segundo OK é ignorado e RETURN cancela sem sair da tela; com nada pendente, RETURN sai | US1/AC6, FR-009/010, SC-008, Constitution: RETURN fecha a camada | Fase 3 (T010) | `Unable to find … button name /Conectando/` |
| Done do IME no último campo leva o foco à ação sem enviar; Enter sozinho continua do teclado do sistema | US2/AC2+AC4, FR-014, D-004 | Fase 4 (T014) | `expect(element).toHaveFocus()` (o botão não recebe o foco) |

Não cobertos por contrato (orçamento de 5; verificados por testes comuns e E2E): US3 (cobertura), US4
("Mostrar"), US5 (TMDB/EPG), Next, edição de lista, timeout de 15 s, STO-01.

Stubs criados pelo plan (ponto de partida do execute, **não travados**):
`tv-web/src/lib/catalog/sourceConnectionCheck.ts` (tipos + `checkSourceConnection` que lança
`not implemented`; **os tipos e a assinatura são o contrato — não mudar sem reabrir o design**).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (sonda) | T001 feita (`VITE_CCPLAY_IME_PROBE=1`); **T002 (passada na TV) pendente — pré-requisito da Fase 4** (R-012) |
| Fase 2 (lib de confirmação) | Concluída; contratos 1–2 verdes |
| Fase 3 (US1) | Concluída; contratos 3–4 verdes; 037 emendada (só o mock) e re-travada; E2E `ime-formularios.mjs` |
| Fase 4 (US2 — Done/Next) | Código concluído, contrato 5 verde. **Sem a medição na TV** (T002 não feita; usuário escolheu os padrões da tabela) e **T030 não implementada** (condicional à medição) |
| Fase 5 (US3 — cobertura) | Concluída; E2E mede 7 campos na metade superior |
| Fase 6 (US4 — Mostrar) | Concluída; `TextField` `revealable`; TMDB usa o controle |
| Fase 7 (US5) | Concluída: Done/`enterKeyHint` no TMDB e no EPG; erros próprios intactos |
| Aberto | T002 (sonda na TV), T030 (RETURN com o teclado aberto), T028 (passada na TV, SC-007) — **Next/Done/RETURN/cobertura pelo teclado real: não verificados** |
| Verificações | suíte final 2366/2371 — as 5 falhas são só os contratos da feature **046** (`catalogApi.key-repeat`, `LiveScreen.memoria-foco`, `liveSessionMemory.memoria-foco`), planejada em paralelo e vermelha por desenho; todos os testes desta feature passam, inclusive o contrato 5/5; `tsc` limpo; `npm run build` ok; lint 0 erros (54 avisos, nenhum nos arquivos desta feature); `test:e2e` completo (25 scripts, com `ime-formularios.mjs`) verde depois de ajustar 3 (`m3u-sob-demanda`, `capa-real`, `e2e.mjs` — R-013/R-016); todas as travas do repositório íntegras |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | **O que o IME real entrega à página (Next, Done, Cancel) não foi medido.** `65376/65385` são de memória; Next pode ser só movimento de foco pelo sistema. | ALTO — US2 pode não funcionar na TV | `IME_KEYCODES` é uma tabela; sonda dev-only (T001) + passada T002 medem e preenchem. Se Done não chegar à página como `keydown`, FR-014 fica sem caminho e volta ao usuário (decisão: aceitar que Done só fecha o teclado, ou outro gatilho). |
| R-002 | **RETURN com o teclado aberto**: não está em `EDITABLE_PASSTHROUGH_KEYS`, então se a TV o entregar à página, `useRemoteNav` o trata como "sair da tela" — a premissa da spec ("já ocorre hoje") não é verificável no código. | MÉDIO | A mesma sonda mede. Se chegar, adicionar um guard no contêiner da tela (primeiro RETURN só fecha o teclado) — mudança local, não em `useRemoteNav`. FR-017 entra na passada T002. |
| R-003 | **O contrato travado da 037** (`AddSourceScreen.entrada-listas.contract.test.tsx`, teste 1) mocka `fetch` para **rejeitar** e espera `onSourceCreated` — com a confirmação, uma lista M3U cuja rede falha agora **não** é criada. | ALTO — quebra uma trava de outra feature | Resolvido: **Aprovado pelo usuário em 2026-10-02**: emendar só o mock de `fetch` do teste 1 (servir um M3U mínimo) e re-travar a 037 (T011, agora liberada). Nada além do mock pode mudar nesse arquivo. |
| R-004 | A confirmação duplica 1 pedido leve que a importação refaz (conta Xtream / primeira entrada do M3U). | BAIXO | Aceito (R0-2); a 038 mediu o limite do painel em ~99 pedidos. Otimização futura: passar a "rota confirmada" ao importador. |
| R-005 | Painéis que montam a lista inteira antes do 1º byte (`get.php` de listas enormes) podem estourar 15 s e virar `NET-02` falso. | MÉDIO | Tentar de novo resolve na maioria; medir com a lista real (`CCPLAY_PROBE_*`) em T012. Se frequente, subir o limite só do M3U ou aceitar `timeout` como "demorou" sem culpar a rede (decisão de produto — voltar ao usuário). |
| R-006 | `.screen.epg-settings`/`.tmdb-key` hoje não rolam; dar `overflow` pode recortar o anel de foco (achado da 036). | MÉDIO | Seguir o remédio de `settings.css:27` (padding/folga) e cobrir no E2E de SC-005. |
| R-007 | `TextField` é compartilhado (busca incluída): `onFocus`→cobertura e o botão "Mostrar" mudam o DOM de todos. | MÉDIO | Resolvido: `revealable` é opt-in; a cobertura é no-op quando o bloco já está na metade de cima. Rodar `TextField.test.tsx`, `SearchScreen` e os contratos 026/028 depois de T018. |
| R-008 | Spec pede nome acessível que **muda** ("Mostrar"→"Ocultar senha") **e** `aria-pressed` — padrão ambíguo para leitores de tela. | BAIXO | Seguir a spec; revisitar se a passada de acessibilidade (item 56) reclamar. |
| R-009 | A confirmação em modo **edição** com campos em branco depende de `readCredential`; se a credencial guardada sumiu, o helper devolve `null` e o `updateSource` segue como hoje. | BAIXO | Resolvido: coberto por teste de `connectionInput.ts`. |
| R-010 | `fetch` com `mode` padrão numa `m3u_url` que redireciona a outro host pode falhar por CORS no navegador e ser lido como `NET-02`. | BAIXO | Igual ao que o importador já faz; fora de escopo. |
| R-011 | **Divergência de spec**: FR-014 diz "Done (ou Enter)"; o plano **não** toma `Enter` (D-004). | MÉDIO — a spec precisava de um ajuste de texto | Resolvido: FR-014 emendado para "Done do IME" com aprovação do usuário (2026-10-02). O contrato C5 trava o comportamento. |
| R-013 | **Consequência medida de R-004**: a confirmação faz 1 pedido a mais ao M3U (lê o começo e cancela). Dois E2E que contavam "o M3U foi pedido 1 vez" (`m3u-sob-demanda.mjs`, `capa-real.mjs`) falharam e passaram a esperar 2 (confirmação + download). Nenhuma asserção sobre "não relê ao entrar na categoria" foi afrouxada — só a base. | BAIXO | Resolvido: scripts ajustados e verdes. |
| R-014 | `npm run lint` mostra 54 avisos (a linha de base citada era 45); nenhum está em arquivo desta feature (`oxlint` filtrado por `AddSource|TextField|imeProbe|imeKeys|connection|Button`). Há trabalho de outra feature (044) em andamento no working tree. | BAIXO | Registrado; não corrigido aqui (fora de escopo). |
| R-016 | O E2E da raiz (`e2e.mjs`, SC-002 da 037) contava 2 setas de "Senha" até "Conectar e sincronizar"; o botão "Mostrar" da Fase 6 entrou na ordem de foco e passaram a ser 3 (achado só no E2E completo final, depois da Fase 6). Os OK de navegação (≤ 3) não mudaram. | BAIXO | Resolvido: `down(3)` no script; `AddSourceScreen.test.tsx` já tinha a ordem de foco atualizada. |
| R-015 | O contrato 4 depende de o botão mostrar `Conectando…` **imediatamente** após o clique: a tela chama `setPhase('checking')` antes de qualquer `await`. | BAIXO | Resolvido: mantido por construção em `AddSourceScreen.handleSubmit` (contrato 4 verde). |
| R-012 | **Decisões do usuário (2026-10-02)**: medir o IME real antes da Fase 4; depois, ao chegar lá, **escolheu implementar a Fase 4 com os padrões da tabela** (Done 65376, Cancel 65385, Next vazio) em vez de esperar a sonda. Anúncio da faixa: `role="alert"` (FR-007 lido como região viva equivalente). | ALTO (risco residual aceito pelo usuário) | **Decisão final do usuário (2026-10-02): convergir sem a passada na TV, aceitando o risco residual** (constitution, "Validação em hardware real": fechar sem o gate é decisão explícita registrada aqui). A Fase 4 foi implementada sem medir: no navegador está provada por evento simulado; **na TV continua não verificada**. T002/T030/T028 seguem abertas; se Done não chegar à página como `keydown` com esse código, US2/FR-014 não funcionam no aparelho e a correção é só a tabela `IME_KEYCODES`. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-02 | Fase 1 (T001) | Sonda do IME (`imeProbe.ts` + `ImeProbeOverlay`, `VITE_CCPLAY_IME_PROBE=1`) | T002: passada na TV |
| 2026-10-02 | Fase 2 | `checkSourceConnection` real, `imeKeys.ts`, `Button.buttonRef`; contratos 1–2 verdes | — |
| 2026-10-02 | Fase 3 (US1) | Confirmação antes de criar; faixa única; RETURN em camadas; 037 emendada com aprovação; E2E novo; 2 E2E ajustados (R-013) | medição na lista real (R-005) |
| 2026-10-02 | Fases 5–6 (US3/US4) | Cobertura do campo (geometria + folga de rolagem) e "Mostrar/Ocultar" no `TextField` | — |
| 2026-10-02 | Fases 4 e 7 (US2/US5) | `useImeChain` + `enterKeyHint` nas 3 telas, com os padrões da tabela (sem medir na TV, decisão do usuário, R-012); contrato 5 verde | T002/T030/T028 na TV |
| 2026-10-02 | Polish | CLAUDE.md, backlog, `ime-formularios.mjs` em `test:e2e`, BOM removido de 6 arquivos editados pelo `Set-Content` | passada na TV |

**PRÓXIMO**: passada na TV (T002 com `VITE_CCPLAY_IME_PROBE=1` + T028): confirmar Done/Next/Cancel e RETURN com o teclado aberto, ajustar `IME_KEYCODES` e decidir T030; só então `sdd-converge`. Sem a TV, o `sdd-converge` pode fechar **só por decisão explícita do usuário**, com R-012 como risco residual.

## Arquivos Principais

- Feitos: `tv-web/src/lib/catalog/sourceConnectionCheck.ts`, `src/features/import/{AddSourceScreen,connectionBanner,ConnectionErrorBanner,connectionInput}`, `src/components/{TextField,Button,ImeProbeOverlay}.tsx`, `src/lib/{imeKeys,imeProbe}.ts`, `src/lib/focus/revealInTopHalf.ts`, `e2e/ime-formularios.mjs`.
- Próximos (Fase 4): `src/lib/useImeChain.ts` (novo), `AddSourceScreen`/`TmdbKeyScreen`/`EpgSettingsScreen` (fiação) · `src/lib/useTvKeyNav.ts` · `src/lib/useRemoteNav.ts` (só ler)
- `tv-web/src/lib/errors/errorCatalog.ts` · `tv-web/src/lib/catalog/importPipeline.ts` (linhas ~738–805: a árvore que a confirmação espelha)

## Cuidados para Retomada

- Não editar os arquivos `*.ime-formularios.contract.test.*`. O contrato da **037** só com aprovação (R-003).
- `Enter` num campo nunca é interceptado. `useRemoteNav` e `useTvKeyNav` **não** são alterados.
- A fala de "campo coberto pelo teclado" depende de medir na TV (R-001/R-002) — "não testado" nunca vira "aprovado".

## Resultado Final

**Convergida em 2026-10-02**, com risco residual **aceito pelo usuário** (R-012): a passada na TV física não foi feita.

**O que foi construído** (tudo conforme o plano):
- `lib/catalog/sourceConnectionCheck.ts` — confirmação de conexão sem React, reusando o conector Xtream e o parser M3U da importação; Xtream = 1 consulta de conta, M3U = lê até a primeira entrada e cancela; limite de 15 s por `Promise.race` + abort; Modo limitado (014) preservado.
- `AddSourceScreen` — confirmar antes de criar, faixa única (`connectionBanner.ts`/`ConnectionErrorBanner.tsx`), trava síncrona, RETURN em camadas, edição só consulta quando algo mudou (`connectionInput.ts`), `STO-01` por quota.
- `TextField` — `revealable` (Mostrar/Ocultar), `enterKeyHint`, `onFocus` → `lib/focus/revealInTopHalf.ts` (+ `.form-scroll-room`); `lib/useImeChain.ts` + `lib/imeKeys.ts` (Done → próximo campo/ação, sem enviar; `Enter` nunca tomado); fiação em `AddSourceScreen`, `TmdbKeyScreen` e `EpgSettingsScreen`; sonda dev-only `VITE_CCPLAY_IME_PROBE=1`.

**Desvios em relação ao plano original** (todos registrados nas Execution Notes):
- FR-014 emendado de "Done (ou Enter)" para "Done do IME" (R-011) — com aprovação.
- Teste 1 do contrato da **037** emendado só no mock de `fetch` e a 037 re-travada (R-003) — com aprovação.
- `m3u-sob-demanda.mjs`, `capa-real.mjs` (2 pedidos ao M3U) e `e2e.mjs` (3 setas) ajustados (R-013/R-016).
- A Fase 4 foi implementada **sem** a medição na TV (R-012): `IME_KEYCODES.done`/`cancel` são de memória, `next` vazio; **T030 (RETURN com o teclado aberto, FR-017) não foi implementada**.

**Verificado**: contratos 5/5 e trava íntegra (todas as travas do repositório íntegras); suíte 2366/2371 (as 5 falhas são contratos da feature 046); `tsc`/`build` ok; lint 0 erros; `test:e2e` completo (25 scripts) verde.

**Não verificado — risco residual aceito**: Next, Done, Cancel e RETURN com o teclado aberto no IME real da Samsung; o teclado real não cobrindo o campo (SC-007); FR-017; a medição do limite de 15 s contra a lista real (R-005). Se o Done não chegar à página como `keydown` com o código da tabela, US2/FR-014 não funcionam no aparelho — a correção é só `IME_KEYCODES` (ou, se nenhum evento chegar, decisão de produto).


## Passada física na TV — 2026-10-02

Passada feita na TV QN50Q60DAGXZD (backlog item 58), com o build de 02/10/2026. Resultado relatado pelo usuário: roteiro aprovado, sem pendência aberta por esta verificação. Os riscos de hardware desta feature (`R-xxx` marcados como "só se prova na TV") ficam encerrados por decisão do usuário. Registro honesto: o resultado vem do relato do usuário, sem números medidos nem capturas.
