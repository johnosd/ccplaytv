# Implementation Plan: EPG — Dados de Programação e "Agora" na Live TV, no Player e na Home

**Slug**: `030-epg-dados-agora` | **Date**: 2026-09-29 | **Spec**: `sdd/specs/030-epg-dados-agora/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Cada fonte ganha programação XMLTV guardada no aparelho: o endereço vem do
painel Xtream (`xmltv.php` com a credencial da fonte), do `url-tvg` da lista
M3U, ou de um endereço informado pela pessoa. O arquivo é baixado e lido em
fluxo num Web Worker próprio (gzip detectado pelo conteúdo), guardando só a
janela −12 h…+48 h numa tabela nova do Dexie, substituída por geração (falha
nunca apaga a anterior). Os canais passam a guardar o id de EPG declarado
(`epg_channel_id`/`tvg-id`) e o "Agora" é calculado na leitura, por igualdade
exata de id, com o deslocamento manual da fonte aplicado só na exibição. As
superfícies — linha de canal (inclusive zapping), preview ("A seguir" +
sinopse), banda do player Live e rail "Canais favoritos" — leem só do
aparelho, nunca da rede. Configurações ganha uma tela "EPG da lista" real
(estado, endereço manual, deslocamento, sincronizar, desativar), removendo o
mock `settings-epg`. O spike com o painel real do `.env` (research.md)
confirmou CORS liberado, 2,2 MB/7,5 k programas e 954/954 canais casando por
id exato.

## Technical Context

**Language/Version**: TypeScript ~6.0 (`tv-web/`), React 19; Vite 8 com alvo `chrome108`.

**Primary Dependencies**: Dexie 4 (IndexedDB), `@tanstack/react-query` 5,
`@tanstack/react-virtual` 3; APIs de plataforma `fetch`, `ReadableStream`,
`DecompressionStream`, `TextDecoder`, Web Worker. **Nenhuma dependência nova.**

**Storage**: IndexedDB (`ccplaytv`) — Dexie v11 com a tabela `epgPrograms`;
campos novos de valor em `SourceRecord` e `CatalogRecord` (data-model.md).

**Testing**: Vitest + jsdom + fake-indexeddb + Testing Library (unit/contrato);
Playwright via scripts `tv-web/e2e/*.mjs` contra `npm run dev`.

**Target Platform**: Samsung QN50Q60DAGXZD, Tizen 8.0 / Chromium 108, pacote
`CCPlayTv/` (`.wgt`); navegador desktop para desenvolvimento.

**Performance Goals**: navegação por setas responsiva durante toda a
sincronização (SC-002); nenhuma consulta de rede ao mover foco (FR-029);
"Agora" atualizado com ≤ 1 min de atraso (FR-028).

**Constraints**: client-first (ADR-008) — nenhum backend; segredos fora de
log/tela/erro (constitution, ADR-008/ADR-010); `DOMParser` indisponível em
Worker; todo arquivo emitido pelo Vite listado em
`CCPlayTv/tizen_web_project.yaml`; tokens V14, sem valor literal de estilo.

**Scale/Scope**: painel real: 2.266 canais, 982 canais no XMLTV, ~1.350
programas na janela; XMLTV de terceiros pode chegar a dezenas de MB
(não medido — R-006).

## Decisões Invariantes

- **D-001 — Formato único XMLTV**, endereço resolvido na ordem manual →
  painel (`${dns}/xmltv.php?username&password`, derivado de `readCredential`
  na hora, nunca copiado) → `url-tvg`/`x-tvg-url` declarado. `get_short_epg`
  não é usado (logic/sincronizacao-epg.md §1).
- **D-002 — Estado/configuração de EPG vivem em `SourceRecord`** (campos de
  valor, data-model §1); `SourceView` continua sem URL alguma e ganha só
  `epg: EpgStatus` + `epgManualHost`. "Sincronizando" é estado de execução
  (executor), nunca persistido.
- **D-003 — Tabela `epgPrograms` (Dexie v11)** com substituição por geração
  (`epgActiveGeneration`): nova geração inteira, troca, só então apaga a
  antiga. Falha no meio nunca toca a ativa.
- **D-004 — Janela guardada** `[syncAt − 12 h − |offset|, syncAt + 48 h + |offset|]`
  por sobreposição; descrição truncada em 600 caracteres.
- **D-005 — Worker próprio** `lib/epg/epgWorker.ts` + executor
  `lib/epg/epgRunner.ts` na thread principal (single-flight, estado
  "sincronizando", plano B na thread principal como `importRunner.ts`).
  `assets/epgWorker.js` entra na lista do `tizen_web_project.yaml`.
- **D-006 — Parser próprio por varredura de texto** (logic/xmltv-parse.md),
  sem `DOMParser` e sem biblioteca. Gzip só por magic `1f 8b` no primeiro
  pedaço, via `DecompressionStream`.
- **D-007 — Canais antigos (FR-007) por migração única**: `decideOnOpen`
  devolve `'migrate'` para fonte sincronizada sem `epgIdsCapturedAt`
  (importação silenciosa em segundo plano, fluxo já existente em `App.tsx`);
  `markSynced` grava `epgIdsCapturedAt` sempre. Ver R-002.
- **D-008 — Gatilhos de sincronização** só: importação concluída, abrir a
  fonte com EPG > 12 h (`EPG_STALE_AFTER_MS`), ações da tela de EPG. Nunca no
  foco, nunca ao exibir (FR-029).
- **D-009 — Leitura**: `useEpgPrograms(sourceId, keys)` (query
  `['epg', …]`, só IndexedDB) + `useNow(30 s)` + `nowAndNext()` puro; o
  executor avisa o fim de cada sincronização e o `App` invalida `['epg']` e
  `['sources']`.
- **D-010 — Tela própria "EPG da lista"** (`EpgSettingsScreen`, screen
  `epg-settings` em `appNav.ts`, molde de `edit-source`); `Modal` só na
  confirmação de "Desativar" (logic/tela-epg-configuracoes.md).
- **D-011 — Toda falha de EPG usa o código `EPG-02`** com motivo por
  `EpgErrorKind`; erro cru nunca é logado nem exibido.
- **D-012 — Fuso**: offset do XMLTV resolvido na leitura do arquivo (sem fuso
  = UTC); deslocamento manual da fonte aplicado **só** em `nowAndNext` (nunca
  gravado nos programas).
- **D-013 — Consulta de "agora"** lê programas com início em
  `[now − 24 h, now + 48 h]`; programa com mais de 24 h iniciado antes disso
  não aparece (limite aceito).
- **D-014 — Banda do player**: `PlayerIdentity` ganha `now?: { title: string;
  progress: number }` opcional; `PlayerChrome` desenha só quando presente.
  `LiveScreen` calcula; `PlayerLayer` continua sem saber o que é EPG.
- **D-015 — Busca global (`SearchScreen`)** fica fora: a spec lista só as
  listas da Live TV, o preview, a banda e a rail da Home.
- **D-016 — Botões "Guia completo"/"Guia"** continuam mock `epg-guide`
  (FR-031, feature 031).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | EPG é opcional por fonte; falha nunca bloqueia abertura nem catálogo (FR-005). |
| Segredos Fora dos Clientes e dos Logs | ⚠️ | ✅ (com justificativa) | URL do painel derivada na hora, nunca guardada; `epgManualUrl`/`epgDeclaredUrl` guardadas no aparelho — mesma classe da ADR-010, mas não citadas literalmente → Complexity Tracking + emenda inline na ADR-010 (T044). Erro só como categoria; contrato 4 prova senha fora de erro/log. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | EPG não cria nem reordena categoria. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Só id exato; slot vazio em lacuna/sem id (contratos 2 e 5). |
| Comandos Locais Independem de Rede | ✅ | ✅ | "Agora" lê só IndexedDB; sincronização em Worker, nunca no caminho do foco. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | EPG não toca `userStates`. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | ✅ | ✅ | Tela de EPG toda por setas/OK/RETURN; IME real para o endereço. |
| Lista de Catálogo ≠ Manifesto de Streaming | ✅ | ✅ | Não toca o importador de itens além de capturar um atributo. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Tela de EPG com ≥ 1 focável em todo estado (logic/tela-epg-configuracoes.md); "Tentar novamente" focável e ativável. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | RETURN da tela de EPG volta ao botão "EPG" pela restauração de `appNav`; grade de programação atualiza sem mexer no foco. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | EPG chaveado por `sourceId` + `channelKey`; nada usa URL de stream. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Barra = tempo decorrido ÷ duração declarada; sem programa, sem barra. |
| Documentação do Repositório É Canônica | ✅ | ✅ | Polish atualiza CLAUDE.md, backlog, `comingSoon.ts`, `migracao-design-system-v14.md`, ADR-010 (emenda). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/030-epg-dados-agora/
├── spec.md
├── plan.md
├── research.md            # spike com o painel real do .env (R1–R6)
├── data-model.md
├── logic/
│   ├── xmltv-parse.md
│   ├── agora-e-a-seguir.md
│   ├── sincronizacao-epg.md
│   └── tela-epg-configuracoes.md
├── quickstart.md
├── contract-tests.lock
├── handoff.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── lib/
│   │   ├── epg/                     # NOVO
│   │   │   ├── types.ts             # stub pronto (tipos)
│   │   │   ├── xmltvParser.ts       # stub
│   │   │   ├── nowNext.ts           # stub
│   │   │   ├── epgRepository.ts     # stub
│   │   │   ├── epgSync.ts           # stub
│   │   │   ├── epgFetch.ts          # novo (textChunks + gzip)
│   │   │   ├── epgStatus.ts         # novo (epgStatusOf, resolveEpgUrl, mensagens EPG-02)
│   │   │   ├── epgWorker.ts         # novo
│   │   │   ├── epgRunner.ts         # novo
│   │   │   └── *.epg-dados-agora.contract.test.ts   # travados
│   │   ├── useNow.ts                # novo
│   │   ├── comingSoon.ts            # remove settings-epg
│   │   └── catalog/
│   │       ├── db.ts                # v11 + campos
│   │       ├── xtreamConnector.ts   # mapLiveEntry → epgChannelId
│   │       ├── classifier.ts        # tvg-id → epgChannelId (canal)
│   │       ├── m3uParser.ts         # atributos do cabeçalho #EXTM3U
│   │       ├── importPipeline.ts    # epgChannelId nos registros; url-tvg → markSynced
│   │       ├── categoryLoader.ts    # toItemRecord → epgChannelId
│   │       ├── catalogRepository.ts # storeStoredCategory carrega o campo
│   │       ├── sourceRepository.ts  # SourceView.epg, SyncMark, deleteSource, setters de EPG
│   │       └── freshness.ts         # 'migrate' por epgIdsCapturedAt
│   ├── components/
│   │   ├── ChannelRow.tsx           # já tem nowPlaying/progress (feature 022)
│   │   ├── chromeControls.ts        # PlayerIdentity.now
│   │   └── PlayerChrome.tsx         # programa na banda
│   ├── features/
│   │   ├── catalog/catalogApi.ts    # epg_channel_id, useEpgPrograms
│   │   ├── import/importApi.ts      # gatilhos, SourceOut.epg
│   │   ├── live/LiveScreen.tsx      # linha, preview, identidade do player
│   │   ├── home/HomeContent.tsx     # rail "Canais favoritos"
│   │   └── settings/
│   │       ├── SettingsScreen.tsx   # botão EPG → onOpenEpg
│   │       ├── SourcesPanel.tsx     # estado do EPG na linha
│   │       └── EpgSettingsScreen.tsx  # NOVO
│   ├── navigation/appNav.ts         # screen 'epg-settings'
│   ├── App.tsx                      # rota + invalidação pós-sync
│   └── styles/                      # live.css, player.css, settings (tokens)
├── e2e/
│   ├── epg-dados-agora.mjs          # NOVO, em test:e2e (fixture fictícia)
│   └── epg-dados-agora-real.mjs     # NOVO, fora do test:e2e (.env)
└── package.json                     # test:e2e ganha o roteiro novo
CCPlayTv/tizen_web_project.yaml      # + assets/epgWorker.js
```

**Structure Decision**: frontend único em `tv-web/` (client-first, ADR-008);
`api/` não é tocado. Lógica de EPG nova em `tv-web/src/lib/epg/` (sem React,
testável), consumida pelas telas só por `features/catalog/catalogApi.ts` e
`features/import/importApi.ts` — mesma fronteira de D-001 da feature 005.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Guardar `epgManualUrl`/`epgDeclaredUrl` (podem carregar credencial/token) no IndexedDB, sem texto literal da ADR-010 cobrindo "URL de EPG" | Sem guardar, o EPG teria de ser reinformado a cada sincronização automática (FR-009) e o `url-tvg` de uma lista `stored` se perderia (o arquivo M3U não é mantido inteiro). É a mesma classe de dado que a ADR-010 já permite (URL de fonte e conteúdo do M3U, que é de onde o `url-tvg` vem) e fica sob as mesmas regras: nunca em log, tela, erro, terceiro ou exportação; apagada com a fonte. | Pedir a URL a cada sincronização quebra FR-009; guardar só o host perde o endereço; derivar do painel não cobre M3U avulsa. Emenda inline na ADR-010 (T044) registra a extensão. |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run <arquivo>        # o mais estreito primeiro
npx tsc -b
npm run lint
npm run test
npm run build:tizen
npm run test:e2e                # com `npm run dev` rodando
node e2e/epg-dados-agora-real.mjs   # dados reais do .env
```

Dados reais: spikes, o roteiro `epg-dados-agora-real.mjs` e a passada na TV
usam o `.env` da raiz (`CCPLAY_PROBE_*`), lido em tempo de execução — os
valores nunca vão para arquivo versionado, log ou commit.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/epg/xmltvParser.epg-dados-agora.contract.test.ts`,
`tv-web/src/lib/epg/nowNext.epg-dados-agora.contract.test.ts`,
`tv-web/src/lib/epg/epgSync.epg-dados-agora.contract.test.ts`,
`tv-web/src/features/live/LiveScreen.epg-dados-agora.contract.test.tsx`

Comando (de `tv-web/`): `npx vitest run src/lib/epg src/features/live/LiveScreen.epg-dados-agora.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| lê em pedaços partidos, resolve fuso, filtra pela janela e descarta programa sem título | FR-003, FR-004, FR-014, FR-030 | Fase 2 | `Error: not implemented` |
| acha agora/a seguir sem inventar: progresso real, lacuna vazia, sobreposição pelo mais recente, deslocamento na leitura | FR-020, FR-023, FR-025, FR-030 | Fase 2 | `Error: not implemented` |
| fonte Xtream sem configuração: baixa o xmltv.php do painel, grava, e a sincronização seguinte substitui a anterior | US1/AC1, FR-001, FR-004, FR-015 | Fase 2 | `Error: not implemented` |
| falha de rede preserva a programação anterior, registra o erro categorizado e nunca vaza a senha | US2/AC3, FR-005, FR-013, FR-019, Constitution: Segredos | Fase 2 | `Error: not implemented` |
| linha de canal: com id de EPG mostra o programa atual e a barra; sem id, slot vazio e sem barra | US1/AC1-AC2, FR-023, FR-029, FR-030, SC-003 | Fase 3 | `Error: not implemented` (seed via `writeEpgPrograms`) |

Vermelho confirmado em 2026-09-29: 5/5 falham por `not implemented`; `tsc -b`
limpo; suítes de `features/live`, `lib/catalog` e `features/catalog` verdes
exceto o flake conhecido `LiveScreen.test.tsx` T010 (passa isolado).

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/epg/{types,xmltvParser,nowNext,epgRepository,epgSync}.ts`;
campo `epg_channel_id` (só tipo) em `CatalogItemOut`
(`tv-web/src/features/catalog/catalogApi.ts`).

Fora do contrato, cobertos por testes da fase: captura do id (Xtream/M3U),
cabeçalho `url-tvg`, `resolveEpgUrl` (precedência), gzip, `not_xmltv`,
single-flight/descartar após desativar, migração `decideOnOpen`, tela de EPG
(estados, validação, RETURN), preview, banda, rail da Home.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup) | Concluída — T002: `DecompressionStream` existe e funciona no Vitest/jsdom; nenhum polyfill nem injeção necessária. |
| Fase 2 (Foundational) | Concluída — 4/4 contratos verdes, trava íntegra, 60 testes novos/ajustados verdes. |
| Fase 3 (US1) | Concluída — 5/5 contratos verdes, `build:tizen` verde com `assets/epgWorker.js` listado, "Agora" + barra em toda linha de canal da Live TV. |
| Fase 4 (US2) | Concluída — tela "EPG da lista" real, estado por lista, mock `settings-epg` removido; 157 testes da área verdes. |
| Fase 5 (US3) | Concluída — preview com "Agora"/"A seguir"/sinopse; 8/8 testes de `LiveScreen.epg`. |
| Fase 6 (US4) | Concluída — banda do player Live e rail "Canais favoritos" da Home com o programa atual. |
| Fase 7 (Polish) | Concluída, salvo T045 — E2E fictício (no `test:e2e`) e com lista/EPG reais do `.env` verdes; suíte 1534/1537 (só os 3 flakes de favoritos, 27/27 isolados); `tsc`/lint/`build:tizen` limpos; revisão de segredos limpa; ADR-010 emendada; docs atualizadas. |
| Gate físico | **Aberto, recomendado (não obrigatório)** — T045: `DecompressionStream` no Chromium 108 (R-007), Worker sem plano B (R-005), fluidez durante sync grande (SC-002/R-006), URL XMLTV externa do `.env` (R-001). Nada disso foi testado em TV. |
| Quickstart | Passos 1–11 cobertos pelo E2E. **Cenários "offline" e "fonte antiga" só têm cobertura de unidade** (`decideOnOpen`, `importApi.epg.test.tsx`, leitura só do IndexedDB) — não foram rodados num navegador. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | URL XMLTV externa do `.env` (`CCPLAY_PROBE_EPG`) expirou a conexão a partir da máquina de desenvolvimento (research R3). | Caminho "endereço manual" sem prova com dado real. | E2E com fixture local; repetir com a URL real da rede de casa/TV (quickstart passo 9). "Não testado" nunca vira "aprovado". |
| R-002 | FR-007 diz "categoria renovada na próxima entrada"; categorias `stored` antigas não têm de onde reler o `tvg-id` (research R6). | Mecanismo difere do texto da spec (resultado igual: nenhuma ação da pessoa). | Resolvido: D-007: migração única por ressincronização silenciosa ao abrir. Registrado aqui; sem reescrever a spec. |
| R-003 | Vários canais compartilham o mesmo `epg_channel_id` (variantes HD/SD). | Nenhum — muitos→um é o comportamento correto. | Resolvido: Consulta por conjunto de chaves únicas; mesma programação em todas as variantes. |
| R-004 | XMLTV real tem `<channel id="">`. | Chave vazia casaria canal sem id por engano. | Resolvido: Parser descarta `channel` vazio; canal sem id nunca consulta. |
| R-005 | Worker novo pode fazer o Vite emitir chunk compartilhado extra (ex.: Dexie). | `build:tizen` recusa (guard `findUnlistedFiles`) — bom — mas precisa listar. | Resolvido: T021: listar tudo que o build emitir; nunca desligar o guard. |
| R-006 | Tamanho/tempo de XMLTV grande de terceiros não medido (o do painel tem 2,2 MB). | SC-002 pode falhar na TV com arquivo de dezenas de MB. | Leitura em fluxo + gravação em lotes; medir na passada física; descarte por quota é o item 51 do backlog. |
| R-007 | `DecompressionStream` no Chromium 108 da TV não verificado no aparelho. | `.xml.gz` falharia só na TV. | Teste unitário do caminho gzip; conferir na passada física; falha vira `unreadable`/`not_xmltv` declarado, nunca silêncio. |
| R-008 | CORS de hosts `url-tvg` de terceiros desconhecido (o painel real libera `*`). | Alguma lista M3U fica com `EPG-02 network`. | Erro declarado; backend congelado não é caminho (ADR-008). |
| R-009 | Relógio da TV errado distorce "Agora". | Programa errado exibido. | Fora de escopo (spec, edge case); deslocamento manual ajuda em fuso. |
| R-012 | **Bug pré-existente corrigido com aprovação explícita do usuário (fora do escopo da 030):** `Modal` ativava num `useEffect`, então uma tecla logo após o diálogo aparecer vazava para a tela de baixo — o `Enter` seguinte caía em "Cancelar". Aparecia como falha intermitente da exclusão em `e2e/home-busca-configuracoes.mjs` (feature 026): ~36% (5/14) no código pré-030, medido num worktree do `HEAD`. | Corrida de teclado em componente compartilhado, real também no controle remoto. | Resolvido: Corrigido por subagente: `useEffect` → `useLayoutEffect` em `Modal.tsx`, teste de regressão `Modal.teclas-na-montagem.test.tsx` (falha no código antigo). Verificado depois de forma independente: 7 travas íntegras (022/023/024/026/027/029/030), `tsc` limpo, `src/components/Modal*` 6/6; o passo de exclusão do E2E deu 0 falhas em 26 rodadas do subagente. |
| R-013 | **Bug pré-existente NÃO corrigido**: o mesmo roteiro (`home-busca-configuracoes.mjs`) falha no passo "com progresso salvo, a ação primária do detalhe vira 'Continuar'" — ~19% (3/16) no código pré-030. O script lê `.vod-detail-action` logo após o player fechar, sem esperar a revalidação assíncrona do estado do usuário. | Roteiro E2E instável (e possivelmente uma corrida real de invalidação em `MovieDetailScreen`). | Aguardando decisão do usuário: registrar como `[Bug]` no backlog, ou corrigir. Não bloqueia a 030. |
| R-011 | `EpgSettingsScreen` usa foco DOM real (`useTvKeyNav`, o molde da tela de edição de lista, com IME já provado na TV) e botões "− 1 h"/"+ 1 h" para o deslocamento, em vez da navegação por ←/→ custom sobre uma linha de estado que `logic/tela-epg-configuracoes.md` descrevia. A ordem de foco também mudou: "Sincronizar agora"/"Tentar novamente" vem primeiro (evita abrir o IME ao entrar). | Mesma cobertura de FR-016/FR-018/FR-021/FR-022, com menos código de foco e sem risco de ←/→ colidir com a edição de texto do campo. | Resolvido: Decisão de execução, 2026-09-29. `logic/tela-epg-configuracoes.md` continua válido no conteúdo (campos, mensagens, confirmação); só o mecanismo de foco difere. |
| R-010 | `resolveEpgUrl(record)` (em `epgStatus.ts`) recebe só o `SourceRecord` e deriva a credencial do painel dele mesmo (`panelCredentialOf`), em vez de receber o resultado de `readCredential` como dizia `logic/sincronizacao-epg.md` §1. | Nenhum: mesma regra (provedor, ou `m3uUrl` em formato de painel via `parsePanelUrl`), sem chamada assíncrona extra; `epgStatusOf` precisa da mesma derivação de forma síncrona. | Resolvido: Decisão de execução, 2026-09-29. Comportamento coberto por `epgStatus.test.ts`. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-29 | Fases 1–2 (Setup + Foundational) | Schema v11, captura de id/`url-tvg`, `lib/epg/` completo (parser, nowNext, repositório, fetch/gzip, sync, Worker+runner), `SourceView.epg`, migração por `epgIdsCapturedAt`. 4/4 contratos verdes; 60 testes novos. | Fase 3: ligar gatilhos (importApi/App), pacote Tizen (`epgWorker.js`) e a linha de canal. |
| 2026-09-29 | Fase 3 (US1) | Gatilhos de sincronização (importação concluída / abrir com EPG > 12 h), invalidação na raiz, `epgWorker.js` no pacote, `useNow`/`useEpgPrograms`/`nowNextForChannel`, "Agora" + barra na `ChannelRow` da Live TV. 5/5 contratos; 10 testes novos. | Flake `LiveScreen.favorites` sob paralelismo (passa isolado). |
| 2026-09-29 | Fase 4 (US2) | Tela `EpgSettingsScreen` (foco DOM real + botões ±), estado do EPG na linha da lista, `onOpenEpg`, mutations/`useEpgSyncing` em `importApi`, mock `settings-epg` removido. 157/157 na área. | Nenhuma; R-011 registra o desvio de foco. |
| 2026-09-29 | Fases 5–6 (US3 + US4) | Preview da Live TV com "Agora"/"A seguir"/sinopse (`formatEpgTime.ts`); `PlayerIdentity.now` + faixa do player Live; título do programa nos cards de canais favoritos da Home. 8+3+2 testes novos; 281/281 em `home`+`components`. | Banda→`LiveScreen` sem teste de unidade (E2E cobre). |

| 2026-09-29 | Fase 7 (Polish) | E2E fictício e real, gates finais, revisão de segredos, ADR-010, docs. Achados: XMLTV do painel real só cobre 10 ids de canal; falha pré-existente do `Modal` (R-012, corrigida com aprovação) e do passo "Continuar" (R-013, aberta). | T045 (TV física, recomendada); decisão sobre R-013. |

**PRÓXIMO**: T045 — passada na TV física (`tizen-tv`), recomendada, não gate; decisão do usuário sobre R-013; depois `sdd-converge`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/e2e/epg-dados-agora.mjs` e `tv-web/e2e/epg-dados-agora-real.mjs` (novos), `tv-web/package.json` (`test:e2e`)
- Modelos: `tv-web/e2e/live-tv-ds-v14.mjs`, `tv-web/e2e/capa-real.mjs` (servidor fictício no próprio script)
- Docs: `CLAUDE.md`, `.planning/backlog.md`, `.planning/migracao-design-system-v14.md`, `sdd/adr/ADR-010-*.md`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)

## Resultado Final

Convergida em 2026-09-29. Tudo o que a spec pede foi construído e verificado no
navegador (unidade, contrato 5/5 travado e íntegro, E2E fictício e E2E com a lista
e o EPG reais do `.env`); o que só a TV física prova ficou de fora e está declarado.

**O que foi construído.** EPG por fonte em XMLTV: endereço resolvido na ordem manual →
painel Xtream (`xmltv.php`, derivado da credencial na hora, nunca guardado) → `url-tvg`
do cabeçalho M3U; download em fluxo num Worker próprio (`assets/epgWorker.js`, no
`tizen_web_project.yaml`), gzip reconhecido pelo conteúdo; janela −12 h…+48 h numa
tabela Dexie v11 (`epgPrograms`) substituída por geração; associação só por id exato
(`epgChannelId`). "Agora"/barra em toda lista de canais da Live TV (inclusive zapping),
"Agora"/"A seguir"/sinopse no preview, programa na faixa do player Live e na rail
"Canais favoritos" da Home; tela "EPG da lista" real em Configurações; mock
`settings-epg` removido; ADR-010 emendada.

**Desvios do plano original (todos registrados).** R-002: FR-007 vira ressincronização
única silenciosa (`epgIdsCapturedAt`), não "renovar a categoria" — resultado igual para a
pessoa. R-010: `resolveEpgUrl(record)` deriva o painel do registro. R-011: tela de EPG com
foco DOM real e botões ± 1 h, em vez de ←/→ customizado. R-012: correção do `Modal`
(`useLayoutEffect`), bug pré-existente fora do escopo, com aprovação explícita e teste
de regressão. Achado de dado real: o XMLTV do painel de referência só tem programação
para 10 ids de canal na janela.

**Continua aberto (não é bloqueio).** T045 — passada na TV física (recomendada, não gate):
R-001 (URL XMLTV externa do `.env` deu timeout), R-006 (fluidez com XMLTV grande, SC-002),
R-007 (`DecompressionStream` no Chromium 108), R-008 (CORS de `url-tvg` de terceiros),
R-009 (relógio do aparelho). R-013 — passo "Continuar" do E2E da 026 (~19% de falha já
no código pré-030), aguardando decisão do usuário. Cenários "offline" e "fonte antiga" do
quickstart só têm cobertura de unidade.

## Passada física na TV — 2026-10-02

Passada feita na TV QN50Q60DAGXZD (backlog item 58), com o build de 02/10/2026. Resultado relatado pelo usuário: roteiro aprovado, sem pendência aberta por esta verificação. Os riscos de hardware desta feature (`R-xxx` marcados como "só se prova na TV") ficam encerrados por decisão do usuário. Registro honesto: o resultado vem do relato do usuário, sem números medidos nem capturas.
