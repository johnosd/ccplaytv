# Implementation Plan: Contrato de compatibilidade do parser M3U (headers, radio, tvg-chno)

**Slug**: `044-parser-m3u-headers` | **Date**: 2026-10-02 | **Spec**: `sdd/specs/044-parser-m3u-headers/spec.md`

## Summary

O parser M3U passa a separar a URL do sufixo `|User-Agent=…&Referer=…`, a ler `#EXTVLCOPT`/`#KODIPROP` e a entregar à classificação os headers, o atributo `radio` e o `tvg-chno`; o pipeline grava os três como campos de valor sem índice no `CatalogRecord` (`playbackHeaders`, `radio`, `declaredChannelNumber`) pelo caminho `stored` (feature 014) e a URL de reprodução guardada fica limpa. **Nenhuma tela, player ou adapter muda**: o repasse ao AVPlay é a 25b. A abordagem é um módulo puro (`m3uHeaders.ts`, `logic/headers-m3u.md`) mais fiação em quatro pontos que copiam campos um a um (`classifyEntry`, `toStoredRecord`, `itemsSignature`, tipo `CatalogRecord`).

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19 / Vite 8 (alvo `chrome108`) — esta feature só toca `lib/catalog/`, sem React.

**Primary Dependencies**: nenhuma nova. Dexie (já em uso), Vitest + `fake-indexeddb`/jsdom (já em uso).

**Storage**: IndexedDB via Dexie, **sem bump** (continua v15): três campos opcionais sem índice em `CatalogRecord`, que `StoredCatalogRecord` (`Omit<CatalogRecord, …>`) e `BlockItem` herdam por tipo.

**Testing**: Vitest. 5 contratos travados (2 arquivos) + testes unitários da fase; E2E de importação M3U já existente roda como regressão.

**Target Platform**: TV Samsung Tizen (QN50Q60DAGXZD) e navegador de desenvolvimento. Sem passada física: nada visível muda.

**Performance Goals**: SC-004 — importação de 100 mil entradas ≤ 5% mais lenta; o caminho rápido é um `indexOf('|')` por linha de URL e um `startsWith` por linha de diretiva.

**Constraints**: leitura em fluxo (nunca materializar a lista); valores de header são segredo em potencial (ADR-010); `CatalogItemOut` não ganha campo; sem rede, sem log.

**Scale/Scope**: listas de até centenas de milhares de entradas; poucas entradas trazem headers.

## Decisões Invariantes

- **D-001**: Só **User-Agent** e **Referer** são guardados. Todo outro header e toda chave de DRM somem sem erro e sem valor guardado.
- **D-002**: O valor do `|` prevalece sobre o de diretiva, **por chave**.
- **D-003**: Uma diretiva vale só para a próxima URL emitida (regra exata em `logic/headers-m3u.md` §3).
- **D-004**: A URL guardada em `directUrl` é **sempre a limpa**. Até a 25b o player abre a URL limpa, sem headers.
- **D-005**: `radio` só marca; não muda tipo, categoria, contagem nem UI. `declaredChannelNumber` **nunca** é o número exibido (ADR-011 continua valendo). Ambos só em `kind: 'channel'`.
- **D-006**: Campo novo só entra no registro quando existe; item sem eles é idêntico ao de hoje, inclusive em `itemsSignature` (FR-011).
- **D-007**: Nenhum campo novo em `CatalogItemOut`/`itemOut`, nenhuma mudança em `playbackUrl.ts`, `PlayerLayer` ou `avplayAdapter` (25b).
- **D-008**: Persistência só pelo caminho `stored`; o painel Xtream detectado pela URL não passa pelo parser de itens (R-002).

## Constitution Check

*GATE: passou antes do design; reavaliado depois.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ N/A | ✅ | Nada de conta. |
| Segredos Fora dos Clientes e dos Logs | ⚠️ aplica | ✅ | Header pode carregar token. Fica **só** no IndexedDB, igual à URL de reprodução (ADR-010); nunca em log/UI/erro/terceiros. FR-010 + contrato "segredos" + emenda inline da ADR-010 (T013). Sem mudar o texto da constituição (mesmo padrão da 030). |
| Categorias da Fonte São Preservadas | ✅ | ✅ | `radio` não muda a categoria nem o tipo. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Só o que a lista declarou; `tvg-chno` inválido vira ausente, nunca inferido. |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ N/A | ✅ | — |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ N/A | ✅ | — |
| Controle Remoto Completo | ✅ N/A | ✅ | Nenhuma tela muda. |
| Lista de Catálogo Nunca É Manifesto de Streaming | ✅ | ✅ | `#EXTVLCOPT`/`#KODIPROP` não casam `HLS_TAG`; a detecção continua antes. Teste adicional T008. |
| Foco Visível e Sem Becos Sem Saída | ✅ N/A | ✅ | — |
| Voltar Restaura Foco e Posição | ✅ N/A | ✅ | — |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | `identityKey` (nome original no M3U) não muda; limpar a URL não altera favoritos/retomada. |
| Progresso e Capacidades São Reais | ✅ N/A | ✅ | — |
| Documentação do Repositório É Canônica | ✅ | ✅ | ADR-010 emendada, backlog e CLAUDE.md no Polish, spec refinada (R-001/R-002). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/044-parser-m3u-headers/
├── spec.md
├── plan.md
├── tasks.md
├── quickstart.md
├── handoff.md
├── contract-tests.lock
└── logic/
    └── headers-m3u.md      # regras exatas do `|`, das diretivas e da assinatura
```

Sem `research.md` (nenhuma incerteza técnica restante: o único ponto aberto é o formato real dos headers no AVPlay, que é da 25b) e sem `data-model.md`/`contracts/` (três campos opcionais, descritos em `db.ts` e no `logic/`).

### Source Code (repository root)

```text
tv-web/src/lib/catalog/
├── m3uHeaders.ts                # NOVO (stub criado): PlaybackHeaders, splitUrlHeaders, readDirectiveHeaders
├── m3uParser.ts                 # lê diretivas, separa o `|`, ParsedEntry.headers, tally.unsupportedDirectives
├── classifier.ts                # ClassifiedEntry + radio/declaredChannelNumber/playbackHeaders nos 3 ramos
├── importPipeline.ts            # toStoredRecord copia os 3 campos (radio/chno só canal)
├── categoryBlocks.ts            # itemsSignature: campos novos só quando existem
├── db.ts                        # CatalogRecord: 3 campos opcionais (já feitos como stub final)
├── m3uParser.test.ts, classifier.test.ts, importPipeline*.test.ts   # testes da fase
├── m3uHeaders.test.ts           # NOVO: unitário da lógica pura
├── m3uParser.parser-m3u-headers.contract.test.ts        # contrato (travado)
└── importPipeline.parser-m3u-headers.contract.test.ts   # contrato (travado)
tv-web/src/lib/catalog/fixtures/m3u-headers/              # NOVO: amostras reais anonimizadas (FR-013)
sdd/adr/ADR-010-url-completa-fonte-arquivo-m3u.md          # emenda inline
```

**Structure Decision**: a feature vive inteira em `tv-web/src/lib/catalog/` (zona `IMPORT`). `api/`, `CCPlayTv/`, `features/` e `components/` ficam intactos.

## Complexity Tracking

Nenhuma violação.

## Estratégia de Testes

Prioridade: unitário (módulo puro) → contrato/integração (parser e pipeline) → E2E de importação já existente como regressão → manual só se uma lista real expuser um formato não coberto.

Comandos-base (a partir de `tv-web/`):

```powershell
npx vitest run src/lib/catalog          # a área tocada
npx tsc -b
npm run lint
npm run build
npm run build:tizen    # só se o build do Tizen precisar ser atualizado no commit (um arquivo novo? não: nada novo é emitido)
npm run test:e2e       # com `npm run dev` rodando; regressão da importação M3U
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/catalog/m3uParser.parser-m3u-headers.contract.test.ts` (3 testes) e `tv-web/src/lib/catalog/importPipeline.parser-m3u-headers.contract.test.ts` (2 testes).

Comando: `npx vitest run src/lib/catalog/m3uParser.parser-m3u-headers.contract.test.ts src/lib/catalog/importPipeline.parser-m3u-headers.contract.test.ts`

Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 044-parser-m3u-headers`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| separa URL e headers no primeiro `\|`; `&` dentro do Referer fica; chave desconhecida some | US1/AC1+AC3+AC4, FR-001/002 | Fase 3 (US1) | asserção: `url` ainda traz o sufixo `\|…` |
| diretriz vale só para a entrada seguinte, `\|` prevalece, DRM ignorado | US2/AC1-AC4, FR-003/004/005 | Fase 4 (US2) | asserção: `entries[0].headers` é `undefined` |
| `\|` comum no caminho fica; sufixo vazio ou só de header ignorado é limpo; sem `\|` nada muda | FR-006, FR-011 | Fase 3 (US1) | asserção: `c.ts\|` / `d.ts\|Cookie=abc` não são limpos |
| guarda headers, radio e tvg-chno; item sem nada fica como hoje | FR-002/007/008/009/011, US3 | Fase 5 (US3) | asserção: `directUrl` ainda traz o sufixo |
| reprodução abre a URL limpa; header nunca vai a log, execução ou fonte | FR-001/010, Constitution: Segredos | Fase 5 (US3) | asserção: `resolvePlaybackUrl` devolve a URL com sufixo |

Os cinco falham por **asserção** (confirmado: nenhum por import, sintaxe ou tipo; `tsc -b` limpo e a suíte de `lib/catalog` com os stubs: 446 passam, só os 5 contratos falham).

Stubs/tipos criados pelo plan (não travados): `tv-web/src/lib/catalog/m3uHeaders.ts` (`splitUrlHeaders` e `readDirectiveHeaders` lançam `not implemented`), `ParsedEntry.headers` em `m3uParser.ts`, os três campos de `CatalogRecord` em `db.ts` (estes já são finais).

## Estado Atual

| Área | Estado |
| --- | --- |
| Spec | Especificada; FR-006 e FR-009 refinados no plan (R-001/R-002) |
| Plan/Tasks | Implementada (25/25 tasks); contratos 5/5 verdes, trava íntegra; as outras 26 travas do repositório íntegras |
| Fases 1–5 | Concluídas: fixtures, tipos, `splitUrlHeaders`, diretivas, `classifyEntry`/`toStoredRecord`/`itemsSignature` |
| Fase 6 (Polish) | Concluída: ADR-010 emendada, SC-004 medido (R-009), regressão (suíte 2307 passam, só os 5 contratos da 045 vermelhos; `tsc`/lint/build limpos; 25 scripts E2E verdes), `CLAUDE.md` e backlog atualizados |
| Fase 7 (Convergence) | T017 concluída (registro sem chaves `undefined`, R-010); T018 (lista real) aberta, manual, não bloqueia |
| Ressalva | Passos manuais 3 e 5 do `quickstart.md` (DevTools, tocar um canal) não executados — recomendados, não gate; sem passada na TV |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A spec dizia que o `\|` só separa com par `User-Agent`/`Referer`; assim `URL\|Cookie=x` ficaria com sufixo e o player não abre. | Lista com só `Cookie`/`Origin` continuaria quebrada. | Resolvido: FR-006 refinado: separa se o sufixo é vazio ou começa com nome de header HTTP **conhecido**; só UA/Referer são guardados. Teste 3 trava. |
| R-002 | A spec dizia "persistir pelos dois caminhos M3U". A exploração mostrou que o painel Xtream detectado pela URL (014) nunca lê itens pelo parser — só o caminho `stored` o faz. | FR-009 pedia algo sem alvo. | Resolvido: FR-009 e o Incluído corrigidos; D-008. |
| R-003 | Várias listas escrevem `Referer=http://a/?x=1&y=2` sem codificar; separar em todo `&` cortaria o Referer. | Referer truncado → o servidor recusa mesmo com a 25b. | Fronteira só em `&`/`\|` seguido de nome de header **conhecido** (`logic/headers-m3u.md` §1); teste 1 trava o caso. Fica uma ambiguidade residual se um header conhecido aparecer dentro de um valor — improvável e documentada. |
| R-004 | `itemsSignature` copia campos um a um; se os novos entrarem sempre, toda lista antiga regrava todos os blocos na próxima renovação. | Regravação em massa, o oposto de "renovação sem esfriar" (038). | Resolvido: D-006/`logic` §5: só entram quando existem. Teste adicional T012 (valor da assinatura fixado e conferido contra o HEAD anterior). |
| R-005 | O nome do campo `declaredChannelNumber` difere do `channelNumber` citado na spec. | Confusão com o número exibido (ADR-011). | Resolvido: nome deliberado; comentário no `db.ts`. |
| R-006 | O formato real que o AVPlay aceita (`USER_AGENT`, `Referer`?) é desconhecido. | Afeta só a 25b. | Fora desta feature; o spike no item 58 decide. Os dados guardados aqui bastam para qualquer dos desenhos. |
| R-007 | Valor de header muito longo ou malformado (`%` inválido). | Lixo no IndexedDB / exceção no parser. | Resolvido: limite de 512 caracteres, `decodeURIComponent` em `try`, ambos por regra do `logic/` e cobertos em `m3uHeaders.test.ts`. |
| R-008 | Desvio pequeno, dentro do escopo (Fase 5): `playbackHeaders` só é gravado quando a URL também é (`keepUrl`, isto é, fonte `m3u_url`). No Modo limitado a URL é derivada da credencial e não fica no registro. | Sem isso, o header ficaria gravado sem URL a que servir, ampliando o segredo no aparelho sem uso. | Resolvido: implementado em `toStoredRecord`; `importPipeline.headers.test.ts` prova que nem o registro nem o que foi gravado contém o valor. ADR-010 emendada com a mesma regra (T013). |
| R-010 | Achado F-001 do `sdd-converge`: `toStoredRecord` gravava `playbackHeaders`/`radio`/`declaredChannelNumber` como `undefined` em todo item, e o clone estruturado do IndexedDB preserva a chave (verificado com `structuredClone`) — isso iria para `storedEntries` e `categoryBlocks`, contra o FR-011/SC-002. | Cada item de uma lista de centenas de milhares ganharia três chaves vazias; o contrato 4 só checava `toBeUndefined()` e não pegava. | **Resolvido:** a T017 monta o registro e só acrescenta os campos quando existem; o teste (visto vermelho antes da correção) confere `Object.keys` do registro lido do bloco. |
| R-009 | SC-004 (≤ 5% de lentidão em 100 mil entradas), medido em 02/10/2026 comparando o `m3uParser`+`classifier` do `HEAD` anterior com os atuais (7 rodadas, mediana, 100 mil entradas, mesma máquina). A 1ª versão media +5,2% sem headers e +14% com 5% das linhas com header; **Resolvido:** com o caminho rápido (`line.includes('\|')` antes de chamar `splitUrlHeaders`; `withDeclaredExtras` mutando em vez de 3 *spreads* por entrada) ficou em **+3,2% / +2,9%** sem headers (duas rodadas) e **+4,9% / +5,9%** com 5% das linhas com header (trabalho a mais inerente). | Só parse+classificação foram medidos, não a gravação no IndexedDB (que esta feature não altera para itens sem os campos). | Medição por teste temporário, removido (não commitado). Na TV, com CPU mais fraca, o custo relativo deve ser o mesmo; sem passada física (não é gate). |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-02 | Plan | Contratos escritos e travados (5/5); spec refinada; stubs criados. | Executar a Fase 1 |
| 2026-10-02 | Fase 1 (Setup) | T001: amostras anonimizadas (pipe, diretivas, radio/chno) em `m3uHeaders.fixtures.ts`; `tsc` limpo, trava íntegra. | Fase 2 (T002) |
| 2026-10-02 | Fases 2–3 (tipos + US1) | T002–T005: tipos; `splitUrlHeaders` e fiação no parser; `m3uHeaders.test.ts`. Contratos de US1/FR-006 verdes, trava íntegra, `tsc` limpo. | Fase 4 (US2) |
| 2026-10-02 | Fase 4 (US2) | T006–T008: `readDirectiveHeaders`, acumulador de diretivas, `tally.unsupportedDirectives`; `m3uParser.diretrizes.test.ts`. 3/3 contratos do parser verdes. | Fase 5 (US3) |
| 2026-10-02 | Fase 5 (US3) | T009–T012: `classifyEntry`, `toStoredRecord` (headers só com `keepUrl`, R-008), `itemsSignature` (valor fixado conferido contra o HEAD anterior). 5/5 contratos verdes. | Polish |
| 2026-10-02 | Fase 6 (Polish) | T013–T016: ADR-010 emendada; SC-004 medido e otimizado (R-009); regressão completa verde; `CLAUDE.md`/backlog. Um BOM acrescentado por `Set-Content` em `classifier.ts` e `tasks.md` foi detectado e removido. | `sdd-converge` |
| 2026-10-02 | Fase 7 (Convergence) | T017: `toStoredRecord` só acrescenta os três campos quando existem (F-001 do converge); teste visto vermelho antes. Regressão da área, lint e 4 E2E de catálogo verdes. | T018 (manual); `sdd-converge` |

**PRÓXIMO**: nenhum — convergida. T018 (manual, não bloqueia) pendente: a lista real do usuário não usa headers por pipe/`#EXTVLCOPT`; precisa de outra lista.

## Arquivos Principais

- `tv-web/src/lib/catalog/m3uHeaders.fixtures.ts` (amostras, T001)
- `tv-web/src/lib/catalog/m3uHeaders.ts` (lógica pura, a implementar)
- `tv-web/src/lib/catalog/m3uParser.ts`, `classifier.ts`, `importPipeline.ts`, `categoryBlocks.ts`, `db.ts`
- `sdd/specs/044-parser-m3u-headers/logic/headers-m3u.md`

## Cuidados para Retomada

- Os contratos estão **travados**: não editar `*.parser-m3u-headers.contract.test.ts`; se um estiver errado, parar e perguntar.
- `toStoredRecord` (`importPipeline.ts`) e `itemsSignature` (`categoryBlocks.ts`) copiam campos **um a um**: um campo novo esquecido ali some em silêncio (o contrato 4 pega o primeiro; a assinatura só o teste T010).
- `catalogApi.itemOut` é explícito: não passe o registro por spread para a UI.

## Resultado Final

**Convergida em 2026-10-02** (`sdd-converge`, segunda passada). A primeira passada achou F-001 (MEDIUM) e a T017 o fechou; esta confirmou o código contra a spec e as Decisões Invariantes, sem achado novo acionável.

**O que foi construído** — a fatia 25a do item 25 do backlog, só o parser, tudo em `tv-web/src/lib/catalog/` (zona `IMPORT`):

- `m3uHeaders.ts` (módulo puro): `splitUrlHeaders` separa a URL do sufixo no primeiro `|` (só quando o que vem depois é vazio ou começa com nome de header HTTP conhecido; um `&y=2` dentro de um Referer não é fronteira), `parseHeaderPairs` e `readDirectiveHeaders` (`#EXTVLCOPT` http-user-agent/http-referrer/http-referer, `#KODIPROP` stream_headers; qualquer outra chave é "não suportada", valor descartado). Só `User-Agent` e `Referer` são guardados; valor vazio ou acima de 512 caracteres vira ausência; `%` inválido não lança.
- `m3uParser.ts`: `ParsedEntry.headers`, acumulador de diretivas que vale só para a próxima URL (o `|` prevalece por chave), `ParseTally.unsupportedDirectives` (só contagem).
- `classifier.ts`: `playbackHeaders`, `radio` e `declaredChannelNumber` (`tvg-chno` inteiro positivo de até 6 dígitos) nos três ramos, via `withDeclaredExtras` (muta em vez de `spread`, para não alocar nada por entrada comum).
- `importPipeline.ts`: o registro guardado só ganha os campos quando existem; `playbackHeaders` só com `keepUrl`; `radio`/`declaredChannelNumber` só em canal.
- `categoryBlocks.ts`: `itemsSignature` só acrescenta os quatro valores novos quando algum existe; o valor de um item sem eles foi fixado e conferido contra o algoritmo do HEAD anterior.
- `db.ts`: três campos opcionais em `CatalogRecord`, sem índice, **sem bump** (continua v15).
- ADR-010 emendada (headers = mesma classe de dado da URL de reprodução, mesmas mitigações). A constituição não mudou.

**Desvios em relação ao plano original** (todos registrados): R-001 (FR-006: `|Cookie=x` sozinho também é limpo), R-002 (FR-009: só o caminho `stored` persiste; o painel Xtream detectado pela URL nunca passa pelo parser de itens), R-008 (headers só junto da URL guardada, nunca no Modo limitado), R-009 (SC-004: otimização do caminho rápido depois da primeira medição), R-010 (F-001: sem chaves `undefined` no registro).

**Verificação**: 5/5 contratos, trava íntegra e as outras 26 travas do repositório íntegras; suíte completa 2307 passam (só falham os 5 contratos da feature 045, ainda não executada); `tsc`, lint e build limpos; 25 scripts de `test:e2e` verdes, mais os 4 E2E de catálogo reexecutados depois da T017. SC-004 medido: +3% de parse+classificação em 100 mil entradas sem headers, +5–6% com 5% das linhas com header.

**Ainda aberto, de propósito** (não bloqueia):

- **T018 / F-002 (LOW)**: as amostras de teste seguem o formato de listas reais, mas são sintéticas; falta importar uma lista real que use `|` ou `#EXTVLCOPT` (quickstart, passo 3) e, se surgir formato não coberto, acrescentar o caso à fixture.
- **R-003**: risco residual aceito — um header conhecido dentro de um valor não codificado continua sendo fronteira de par.
- **R-006**: o que o AVPlay aceita (`USER_AGENT`, `Referer`) é da **25b**, depois do spike do item 58. Até lá o player abre a URL limpa **sem** headers; um servidor que exige o header ainda recusa.
- Passos manuais 3 e 5 do `quickstart.md` e qualquer passada na TV física: recomendados, não gate.

**Divergências de documentação conhecidas** (não reescritas por regra do converge): em `## Cuidados para Retomada`, "o teste T010" refere-se ao T012; em `## Arquivos Principais`, `m3uHeaders.ts` consta como "a implementar", mas está implementado.