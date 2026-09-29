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

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | URL XMLTV externa do `.env` (`CCPLAY_PROBE_EPG`) expirou a conexão a partir da máquina de desenvolvimento (research R3). | Caminho "endereço manual" sem prova com dado real. | E2E com fixture local; repetir com a URL real da rede de casa/TV (quickstart passo 9). "Não testado" nunca vira "aprovado". |
| R-002 | FR-007 diz "categoria renovada na próxima entrada"; categorias `stored` antigas não têm de onde reler o `tvg-id` (research R6). | Mecanismo difere do texto da spec (resultado igual: nenhuma ação da pessoa). | D-007: migração única por ressincronização silenciosa ao abrir. Registrado aqui; sem reescrever a spec. |
| R-003 | Vários canais compartilham o mesmo `epg_channel_id` (variantes HD/SD). | Nenhum — muitos→um é o comportamento correto. | Consulta por conjunto de chaves únicas; mesma programação em todas as variantes. |
| R-004 | XMLTV real tem `<channel id="">`. | Chave vazia casaria canal sem id por engano. | Parser descarta `channel` vazio; canal sem id nunca consulta. |
| R-005 | Worker novo pode fazer o Vite emitir chunk compartilhado extra (ex.: Dexie). | `build:tizen` recusa (guard `findUnlistedFiles`) — bom — mas precisa listar. | T021: listar tudo que o build emitir; nunca desligar o guard. |
| R-006 | Tamanho/tempo de XMLTV grande de terceiros não medido (o do painel tem 2,2 MB). | SC-002 pode falhar na TV com arquivo de dezenas de MB. | Leitura em fluxo + gravação em lotes; medir na passada física; descarte por quota é o item 51 do backlog. |
| R-007 | `DecompressionStream` no Chromium 108 da TV não verificado no aparelho. | `.xml.gz` falharia só na TV. | Teste unitário do caminho gzip; conferir na passada física; falha vira `unreadable`/`not_xmltv` declarado, nunca silêncio. |
| R-008 | CORS de hosts `url-tvg` de terceiros desconhecido (o painel real libera `*`). | Alguma lista M3U fica com `EPG-02 network`. | Erro declarado; backend congelado não é caminho (ADR-008). |
| R-009 | Relógio da TV errado distorce "Agora". | Programa errado exibido. | Fora de escopo (spec, edge case); deslocamento manual ajuda em fuso. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: —

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- (nenhum ainda)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)
