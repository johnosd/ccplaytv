# Implementation Plan: Upload no teste de conexão da TV

**Slug**: `064-upload-teste-conexao` | **Date**: 2026-10-07 | **Spec**: `sdd/specs/064-upload-teste-conexao/spec.md`

## Summary

O teste de conexão da 062 passa a medir também o **upload**, na mesma ação "Iniciar teste", e a mostrá-lo junto do último resultado (diálogo e card de Configurações). Em vez de reescrever o motor da 062, uma camada nova, `runConnectionTest`, **compõe**: executa o `runSpeedTest` atual (latência + download, com teto de 30 s / 75 MB) e depois uma etapa de upload (30 s / 75 MB), somando os 60 s / 150 MB do pedido. O resultado ganha quatro campos opcionais, sem mudar o esquema do Dexie nem tocar nos contratos travados da 062, e o resultado antigo continua legível com o upload "não medido".

## Technical Context

**Language/Version**: TypeScript ~6.0 (app, `tv-web/src`), Node 24 / JS ESM nos scripts

**Primary Dependencies**: React 19, Vite 8, Dexie 4.4, TanStack Query, vitest 5, oxlint 1.81, Playwright 1.63. Nenhuma dependência nova.

**Storage**: IndexedDB via Dexie **v17, sem mudança de esquema**: o registro `networkDiagnostics/last` ganha campos não indexados (`data-model.md`).

**Testing**: vitest com dois projetos (`dom` para `*.test.tsx`, `node` para `*.test.ts`); E2E em `tv-web/e2e/` com o dev server em `:5173`; travas SHA256 por `check-contract-tests.ps1`.

**Target Platform**: TV Samsung (Tizen 9 / Chromium 120, build `chrome108`, origem `file://`). O `POST` cross-origin a partir de `file://` só a TV prova (recomendação, não gate).

**Performance Goals**: o teste inteiro dura no máximo 60 s e envia/recebe no máximo 150 MB de carga útil; memória do envio limitada a um `Uint8Array` de 20 MB por teste.

**Constraints**: os 5 contratos travados da 062 (`speedTest`, `speedTestRepository`, `SpeedTestDialog`) não podem ser editados e têm de seguir verdes: eles fixam `runSpeedTest` (12 GETs, `complete` com 3 métricas, 100 MB). A catraca da 063 vale: arquivo novo ≤ 300 linhas, e `lib/i18n/messages/settings.ts` está **no teto exato (482 linhas)**.

**Scale/Scope**: 1 módulo novo de motor, 1 componente de UI novo, 1 área de i18n nova, 4 arquivos editados (`speedTest.ts`, `speedTestRepository.ts`, `useSpeedTest.ts`, `SpeedTestDialog.tsx`), 1 card (`IntegrationsPanel.tsx`) e 1 E2E.

## Decisões Invariantes

- **D-001 O motor da 062 não muda de comportamento.** `runSpeedTest` só ganha a opção `limits`; sem ela, é idêntico (C1–C3 da 062 provam). Nada de upload dentro dele.
- **D-002 O upload é uma etapa de `runConnectionTest`**, depois do download, nunca em paralelo, com flag de exclusão própria. A primeira etapa `failed` ou `cancelled` encerra o teste sem tentar upload.
- **D-003 O envio é só do que o app gera**: `POST` para `https://speed.cloudflare.com/__up` (sem query), `Uint8Array` de bytes sem significado, **sem headers**, `credentials: 'omit'`, `cache: 'no-store'`, `redirect: 'error'`.
- **D-004 Tetos por etapa.** Download (com latência) e upload têm, cada um, no máximo **30 s e 75 MB**; o teto do teste inteiro (60 s / 150 MB) é a soma. Reserva-se o corpo antes de cada `POST` e nunca se devolve.
- **D-005 Cálculo igual ao do download.** `Mbps = 8 * bytes / (ms * 1000)` sobre `POST`s concluídos com 2xx; válido com ≥ 1 000 000 bytes e ≥ 200 ms; para com 3 amostras e 3 000 ms.
- **D-006 Falha do upload nunca é `failed`.** Vira `uploadMbps: null` e resultado parcial, salvo, com `reason: measurement_error` (ou `time_limit`/`byte_limit`).
- **D-007 "Completo" = quatro métricas.** Só para resultado que tem `uploadMbps !== undefined`; o resultado antigo mantém a regra de três.
- **D-008 Persistência aditiva.** Campos opcionais, `version` continua 1, Dexie v17. `undefined` = não medido, `null` = sem amostra. Upload inválido gravado é normalizado na leitura para indisponível; a gravação de resultado inválido é ignorada.
- **D-009 A Home não muda** (decisão do usuário). O dock continua mostrando só o download.
- **D-010 Textos novos numa área própria** (`messages/speed.ts`), porque `messages/settings.ts` está no teto da catraca. A troca do texto de `settings.speed.limits` fica na mesma linha, sem crescer o arquivo.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Sem conta, sem chave. |
| Segredos Fora dos Clientes e dos Logs | OK | OK | O envio só leva bytes gerados pelo app (D-003): nada de fonte, catálogo, credencial ou chave BYOK; sem headers; resultado e mensagens sem URL. O contrato U1/U3 confere a URL, os headers e a ausência de URL no resultado. |
| Categorias da Fonte São Preservadas | N/A | N/A | — |
| IA e Classificação Nunca Inventam Dados | OK | OK | Upload sem amostra é `null`, mostrado como "Amostra insuficiente", nunca 0 Mbps nem estimativa (FR-006/FR-008, U2/U3). |
| Comandos Locais Independem de Rede, Backend ou IA | N/A | N/A | O teste é diagnóstico de rede por definição, com início manual. |
| Trailers e Metadados Não Alteram o Estado | N/A | N/A | — |
| Toda Ação Essencial por Controle Remoto | OK | OK | Nenhuma ação nova: o upload corre dentro do "Iniciar teste"; "Cancelar" continua acessível durante o envio (U4). |
| Lista de Catálogo ≠ Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | OK | OK | `SpeedTestMetrics` não é focável e nenhum estado novo foi criado; os estados existentes (inicial, execução, resultado, erro, bloqueio) mantêm a ação focável (C5 da 062 segue travado). |
| Voltar Restaura Foco e Posição | OK | OK | RETURN/Cancelar passam pelo mesmo caminho da 062; o E2E repete o cancelamento durante o upload. |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | — |
| Progresso e Capacidades São Reais, Nunca Prometidos | OK | OK | A etapa e os MB enviados são reais, sem percentual; o upload só é medido quando o destino confirma; a explicação continua distinguindo a rota medida da do provedor IPTV. |
| Documentação do Repositório É Canônica | OK | OK | A 062 ganha nota apontando a 064; `CLAUDE.md` não muda. |
| Restrição: Plataforma-alvo / build `chrome108` | OK | OK | `fetch` com `Uint8Array` e `AbortController` existem no Chromium 108; nada de upload por stream. |
| Restrição: Design system / i18n | OK | OK | Tokens V14, textos em pt/en/es pela área `speed.ts`. |
| Fluxo: testes por task + E2E antes da TV | OK | OK | A TV é recomendação (spec), não gate. |
| Fluxo: revisão de segredos antes de commit | OK | OK | Tarefa T052. |

Nenhuma violação, então o Complexity Tracking fica vazio. **ADR:** consistente com ADR-008 (client-first, sem backend). O destino é o mesmo da 062; nenhuma ADR a emendar.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/064-upload-teste-conexao/
├── spec.md
├── plan.md                     # este arquivo
├── research.md                 # destino verificado, composição, medição, payload, persistência
├── data-model.md               # campos novos, validade, normalização, exibição
├── quickstart.md
├── logic/upload.md             # composição, tetos, etapa de upload, resultado, progresso
├── contract-tests.lock
├── handoff.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── e2e/teste-conexao-tv.mjs                       # atualizado: atende o POST /__up e confere as 4 métricas
└── src/
    ├── lib/
    │   ├── network/
    │   │   ├── speedTest.ts                       # +campos opcionais, +limits (honrado na T021), +etapa 'upload'/sentBytes
    │   │   ├── connectionTest.ts                  # NOVO (stub do plan) — runConnectionTest
    │   │   ├── connectionTest.upload-teste-conexao.contract.test.ts        # TRAVADO (4)
    │   │   ├── speedTestRepository.ts             # normalize/valid/clean com upload
    │   │   └── speedTestRepository.upload-teste-conexao.contract.test.ts   # TRAVADO (1)
    │   └── i18n/messages/
    │       ├── speed.ts                           # NOVO — chaves de upload (pt/en/es)
    │       ├── settings.ts                        # só o texto de `settings.speed.limits`, mesma linha
    │       └── pt.ts, en.ts, es.ts, areas.test.ts # registram a área nova
    ├── features/settings/
    │   ├── SpeedTestMetrics.tsx                   # NOVO — as 4 métricas (diálogo e card)
    │   ├── SpeedTestDialog.tsx                    # usa SpeedTestMetrics, etapa e tráfego do upload
    │   ├── IntegrationsPanel.tsx                  # usa SpeedTestMetrics
    │   └── useSpeedTest.ts                        # padrão passa a ser runConnectionTest
    └── styles/settings.css                        # .speed-test-metrics com 4 colunas
```

**Structure Decision**: frontend `tv-web/` apenas. O motor novo fica ao lado do da 062 em `lib/network/`, e a regra de fronteiras da 063 (features → lib, nunca o contrário) é respeitada. Nada em `api/`.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

- **Motor e persistência (contrato):** U1–U5 cobrem o caso central, o teto, a falha só do upload, o cancelamento/limite de tempo e a compatibilidade do resultado antigo.
- **UI (sem contrato, P2 de baixo risco):** o orçamento de 5 contratos acabou nos casos acima. A exibição das 4 métricas e dos dois estados "sem upload" fica nos testes da fase (`SpeedTestMetrics.test.tsx`, `SettingsScreen.speedTestUltimo.test.tsx`) e no E2E. As travas da 062 seguem cobrindo foco e RETURN no diálogo.
- **E2E:** `teste-conexao-tv.mjs` passa a simular também o `POST`.
- **Manual:** `quickstart.md` §3 (internet real) e §4 (TV, recomendação).

Comandos-base (em `tv-web/`):

```powershell
npx tsc -b
npm run lint
npm run test
npx vitest run <arquivo>            # o mais estreito primeiro
npm run build
npm run dev                          # outro terminal, para o E2E
node e2e/run.mjs --only teste-conexao-tv --jobs 1   # PowerShell: o `--` do npm se perde
npm run test:e2e
```

Travas (na raiz):

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 064-upload-teste-conexao
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 062-teste-conexao-tv
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:

- `tv-web/src/lib/network/connectionTest.upload-teste-conexao.contract.test.ts` (4)
- `tv-web/src/lib/network/speedTestRepository.upload-teste-conexao.contract.test.ts` (1)

Comando (em `tv-web/`):

```powershell
npx vitest run src/lib/network/connectionTest.upload-teste-conexao.contract.test.ts src/lib/network/speedTestRepository.upload-teste-conexao.contract.test.ts
```

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `U1` upload depois do download, POSTs sequenciais sem credencial, completo com 4 métricas | US1/AC1, FR-001..005 | Fase 3 (US1) | `Error: not implemented` (`runConnectionTest`) |
| `U2` cada etapa ≤ 75 MB, total ≤ 150 MB, nada pedido depois do limite | FR-004/005/006, SC-002 | Fase 3 (US1) | `Error: not implemented` |
| `U3` falha só do upload dá parcial salvo; falha total não tenta upload | US1/AC4-AC5, FR-007/008/016, SC-003 | Fase 3 (US1) | `Error: not implemented` |
| `U4` limite de tempo e cancelamento no upload abortam, sem sobreposição nem retorno | US1/AC2-AC3/AC7, FR-009/010/012 | Fase 3 (US1) | `Error: not implemented` |
| `U5` guarda o upload, lê o antigo como "não medido", upload inválido vira indisponível | FR-011/012/014, SC-002/004 | Fase 2 (Foundational) | `AssertionError` (hoje `clean` descarta os campos de upload) |

**Provado satisfazível:** antes de travar, um protótipo descartável (fora do repositório) fez passar os cinco contratos e, ao mesmo tempo, os cinco da 062 e 128 testes da área. O protótipo não foi mantido.

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/network/connectionTest.ts`; em `speedTest.ts`, os campos opcionais de upload e a opção `limits` já existem **só como tipo** (T021 faz o motor honrá-la).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 — Setup | Concluída. Linha de base: `tsc` 0, lint 0, 2 914 verdes e só os 5 contratos desta feature vermelhos; travas 062/063/064 íntegras. |
| Fase 2 — persistência | Concluída. `speedTestRepository.ts` lê, valida, normaliza e grava o upload; contrato U5 verde; 5 testes novos. |
| US1 — motor, hook, diálogo, E2E | Concluída e verde. `runConnectionTest` (135 linhas) com etapa de upload, hook, `SpeedTestMetrics`, diálogo com etapa e MB enviados, E2E atualizado (11/11); 249 testes da área verdes. |
| US2 — card | Concluída e verde. O card usa `SpeedTestMetrics`; os três estados do upload conferidos em teste e no navegador; a Home não mudou (teste novo). |
| Polish | Concluído. `tsc` 0; lint 0 (`architecture: ok`, `messages/settings.ts` segue em 482); `npm run test` 2 938/2 938; build ok (`check-no-demux-in-build` ok); E2E 42/42 na terceira rodada completa (ver R-008); quickstart §1–§3 incluindo uma rodada real contra o destino; revisão de segredos sem achados; nota na 062. TV física: não feita (recomendação). |
| Contratos | 5 de 5 verdes (U1–U5) na suíte completa. Trava íntegra; as 5 da 062 e as 5 da 063 íntegras. |
| Fase 6 — Convergence | Concluída: T057/T058 (2/2). Cinco regressões novas reproduziram e verificaram CF-001/CF-002; área de rede 44/44, suíte completa 2 943/2 943, tipagem/lint/build verdes, E2E da feature 1/1 e completo 42/42. As primeiras rodadas falharam em testes fora da 064 (R-009/R-010), que permanecem como riscos abertos. |
| Convergência final | Convergida em 2026-10-07. CF-001 e CF-002 resolvidas, nenhuma lacuna acionável; tasks preservadas. TV física recomendada (R-001); instabilidades R-008/R-009/R-010 continuam registradas. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | O `POST` cross-origin a partir de `file://` e o corpo de 20 MB não foram provados no navegador da TV (só o protocolo, no PC, com 100 KB). | Médio: o upload pode falhar na TV | A falha é parcial e graciosa (D-006), com "Amostra insuficiente". A passada na TV é recomendação (spec). Registrar a evidência quando for feita. |
| R-002 | A medição inclui um RTT por requisição e não vê o progresso do envio. | Baixo: upload levemente subestimado em link muito rápido | Resolvido: mitigação confirmada na auditoria — cronômetro monotônico e taxa HTTP observada, sem promessa de velocidade contratada; o viés de RTT permanece como limitação aceita. Mesmo viés do download; documentado em `research.md` R-003. Não rotular como "velocidade contratada". |
| R-003 | `speed.cloudflare.com/__up` só foi sondado com 100 KB; o limite por requisição é desconhecido. | Baixo | Resolvido: a rodada real do Polish registrou três POSTs com sucesso, incluindo o bloco de 20 MB previsto na etapa; isso confirma o uso observado no PC, sem garantir disponibilidade futura nem a origem file:// da TV (R-001). Blocos de até 20 MB (como o download). Recusa vira parcial. Não há fallback automático para outro serviço (spec). |
| R-004 | As travas da 062 fixam `runSpeedTest`; a spec diz que o teto novo "substitui" o de 100 MB / 30 s. | Médio: leitura literal da spec exigiria emendar contrato de outra feature | Resolvido: o hook usa runConnectionTest com os tetos novos; os contratos da 062 preservam o motor isolado e passaram sem emenda. O teto novo vale para o **teste inteiro** (`runConnectionTest`); `SPEED_TEST_MAX_*` ficam como padrão do `runSpeedTest` isolado, que o app não usa sozinho. Sem emenda das travas da 062. |
| R-005 | `messages/settings.ts` está no teto exato da catraca (482 linhas). | Médio: qualquer chave nova reprova o lint | Resolvido: área speed registrada em pt/en/es, texto de limits sem crescer settings.ts e catraca verde no gate final. Área nova `messages/speed.ts` (D-010); o texto de `limits` muda na mesma linha. |
| R-006 | O E2E `teste-conexao-tv` simula só `GET …?bytes=`; um `POST` sem o parâmetro vira `NaN`. | Médio: gate E2E vermelho | Resolvido: stub de POST presente no E2E, com cancelamento de upload e requisições sanitizadas; roteiro principal novamente verde nesta auditoria. T027 atualiza o stub de transporte do E2E para atender o `__up`. Lembrar da instabilidade antiga de `scrollTop` (R-010 da 063), já tratada. |
| R-007 | 20 MB de `Uint8Array` na memória da TV durante o teste. | Baixo | Resolvido: mitigação estrutural confirmada — makePayload chamado uma vez por etapa, corpos por subarray do mesmo buffer de 20 MB; isso não equivale a uma medição de memória na TV. Uma alocação por teste, visões por `subarray`, liberada ao fim; mesmo tamanho de bloco do download. |
| R-008 | O E2E `detalhe-cinema` (feature de filme, sem relação com o upload) reprovou em 2 de 3 rodadas completas do Polish e em 2 de 22 rodadas isoladas com servidor novo, sempre em `openVodCategory` (`não achei o item da lista lateral "Lançamentos 2024"`: varredura por teclas que depende de timing). No `HEAD` limpo passou 22 de 22. A terceira rodada completa passou 42/42. | Baixo/médio: gate E2E instável, **atribuição não provada** | Não corrigido (fora do escopo). Com o servidor velho a taxa de falha foi bem maior (4 de 6 isoladas): reiniciar o dev server antes do gate. A diferença contra o `HEAD` (0/22 contra 2/22) não é estatisticamente conclusiva, e nada em `src/features/vod` mudou nesta feature, mas as mudanças pendentes (063, ajuste do card e 064) não foram descartadas como contribuintes. Candidato a `sdd-bugfix`: trocar a varredura por espera condicional do item. |
| R-009 | Na primeira suíte completa da Fase 6, `scripts/bench/importBench.test.mjs` (063) teve timeout de 10 s no `afterEach` de limpeza do caso XMLTV/stages: 2 942/2 943 verdes. A mesma bancada passou isolada 9/9. A rodada estava concorrendo com build e E2E. | Médio: gate unitário instável, atribuição não provada | A segunda suíte completa, sem build/E2E concorrentes, passou 2 943/2 943; a causa do timeout não foi comprovada. Não alterar timeout nem código do benchmark na 064; manter a falha registrada mesmo que a nova rodada passe. |
| R-010 | Na primeira rodada E2E completa da Fase 6, `historico-continuar-assistindo` falhou na asserção do selo "Em dia" da série (linha 336): 41/42 verdes. O mesmo roteiro passou isolado 1/1. | Médio: gate E2E instável, atribuição não provada | A segunda rodada completa, com servidor reiniciado e sem build/Vitest concorrentes, passou 42/42; a causa da falha não foi comprovada. Não alterar histórico/séries nesta fase; manter a falha registrada mesmo que a nova rodada passe. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-07 | Fase 1 — Setup | Linha de base: `tsc` 0, lint 0, 2 914 verdes, 5 contratos vermelhos; travas íntegras. | — |
| 2026-10-07 | Fase 2 — persistência | `speedTestRepository.ts` com upload (normalize/valid/clean) e 5 testes novos; U5 verde, 062 intacta. | Aviso do oxlint em arquivo de contrato travado (linha 32). |
| 2026-10-07 | Fase 3 — US1 | `messages/speed.ts`, `limits` em `runSpeedTest`, `connectionTest.ts`, hook, `SpeedTestMetrics`, diálogo, CSS 2×2, E2E com POST e `cancel-up`; 12 testes complementares; U1–U4 verdes; E2E 11/11. | Card (US2) ainda mostra 3 métricas. |
| 2026-10-07 | Fase 4 — US2 | Card com `SpeedTestMetrics`; testes do card e da Home; verificação visual dos três estados no navegador. | — |
| 2026-10-07 | Fase 5 — Polish | `tsc`, lint, `npm run test` 2 938 verdes, build, E2E (2 falhas de `detalhe-cinema` em 3 rodadas completas, passou 42/42 na terceira; R-008), rodada real contra o destino (Download 332 Mbps, Upload 62 Mbps, 15 GETs e 3 POSTs, sem falha de CORS), revisão de segredos, nota na 062, travas íntegras. | R-008 (flake do `detalhe-cinema`) e a TV física. |
| 2026-10-07 | Fase 6 — Convergence | T057/T058: normalização preserva as métricas restantes diante de upload inconsistente; data obtida ao concluir o upload. Cinco regressões vermelhas antes e verdes depois; rede 44/44, tsc/lint/build verdes, suíte completa 2 943/2 943 e E2E completo 42/42 na segunda rodada, travas 064/062/063 íntegras. | R-009/R-010: primeiras rodadas com timeout do benchmark e falha do selo de série; causas não comprovadas. R-008 e TV física continuam. |

**PRÓXIMO**: repetir `sdd-converge 064-upload-teste-conexao` para confirmar CF-001/CF-002 e sincronizar o resultado final. Nenhum commit feito. Instabilidades de testes registradas em R-008/R-009/R-010; TV física continua recomendação (R-001), sem gate.

## Arquivos Principais

- `tv-web/src/lib/network/speedTestRepository.ts` — normalização e validação das relações do upload (T057).
- `tv-web/src/lib/network/connectionTest.ts` — data de conclusão do teste inteiro (T058).
- `tv-web/src/lib/network/speedTestRepository.upload.test.ts` e `connectionTest.test.ts` — cinco regressões novas das lacunas de convergência.

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `tv-web/src/lib/network/connectionTest.ts`, `speedTest.ts` (limits), `speedTestRepository.ts` — motor e persistência do upload.
- `tv-web/src/features/settings/` — `SpeedTestMetrics.tsx`, `SpeedTestDialog.tsx`, `IntegrationsPanel.tsx`, `useSpeedTest.ts`; `lib/i18n/messages/speed.ts`; `e2e/teste-conexao-tv.mjs`.

- Fase 6: consultar R-009/R-010 antes de interpretar falhas de suíte completa; rodar gates sem build/Vitest/E2E concorrentes e reiniciar o dev server. Um teste que passa isolado não encerra a investigação de instabilidade.

## Auditoria de Convergência — 2026-10-07

**Estado Atual da convergência**: Convergência Pendente. Fases 1–5 permanecem registradas como executadas; a Fase 6 acrescenta T057–T058 para as lacunas reproduzidas abaixo. Nenhum código foi alterado nesta auditoria.

| ID | Tipo de Lacuna | Severidade | Origem | Evidência | Trabalho Restante |
| --- | --- | --- | --- | --- | --- |
| CF-001 | partial | MEDIUM | FR-014; D-008; `data-model.md` — Normalização na leitura | `tv-web/src/lib/network/speedTestRepository.ts:39` aceita tipos/contagens que as regras relacionais em `valid` rejeitam; a leitura em linha 91 retorna `null`. Reproduzido com upload positivo e zero amostras, bytes enviados acima dos pedidos ou pedidos acima de 75 MB; o download válido desaparece junto. | T057: normalizar apenas o upload inconsistente e preservar as métricas restantes, com regressões de leitura sem regravação. |
| CF-002 | contradicts | LOW | `logic/upload.md` §4 — data no fim do teste | `tv-web/src/lib/network/connectionTest.ts:125` herda `measuredAt` do resultado do download. Reprodução: `durationMs: 6090`, data em `1800000003090` em vez de `1800000006090`. | T058: obter o relógio civil ao concluir o teste inteiro, com regressão de relógio variável. |

**Validação desta auditoria**: pré-requisito `converge` passou; contratos travados sem alterações e sem atalhos condicionados ao ambiente de teste; travas 064, 062 e 063 íntegras (5 contratos cada). `npx vitest run src/lib/network src/features/settings src/features/home/HomeContent.speedTest.test.tsx src/features/home/HomeContent.speedTestUpload.test.tsx src/lib/i18n`: 43 arquivos / 165 testes verdes. E2E `node e2e/run.mjs --only teste-conexao-tv --jobs 1`: 1/1 verde. Reproduções adicionais executadas no Chromium com transporte e relógios sintéticos e banco separado, descartado ao fim; sem requisições externas.

**README**: conferido, sem atualização nesta passada; o resultado final ainda depende da Fase 6. A validação física continua recomendada, sem gate, conforme a spec/R-001. R-008 permanece registrado sem atribuição conclusiva.

**PRÓXIMO da convergência**: `sdd-execute 064-upload-teste-conexao` para T057–T058; depois `sdd-converge 064-upload-teste-conexao` novamente.

**Atualização após execução da Fase 6 (2026-10-07)**: T057 e T058 concluídas e verificadas pelas regressões e gates completos. A auditoria acima registra o estado anterior às correções; CF-001/CF-002 ficam para confirmação por nova passada de `sdd-converge`. Estado de execução: Implementada. **PRÓXIMO da convergência**: repetir `sdd-converge 064-upload-teste-conexao`.

## Resultado Final

**Status final**: Convergida em 2026-10-07. Esta seção registra o estado após a Fase 6 e substitui, para retomada, os encaminhamentos das auditorias anteriores. Nenhuma lacuna acionável remanescente contra spec, decisões invariantes ou constitution; CF-001 e CF-002 confirmadas como resolvidas.

### Construído e confirmado

- A mesma ação manual mede latência/jitter, download e upload em sequência, por `runConnectionTest`, com até 30 s / 75 MB por etapa (60 s / 150 MB no teste inteiro). POSTs com bytes gerados pelo app, sem query, headers próprios ou credenciais; sem envio adicional do resultado.
- Diálogo e card de Configurações exibem as quatro métricas, etapa real e tráfego confirmado do envio, com textos pt/en/es. A dica do dock da Home continua só com download. Cancelar/RETURN encerram o upload e preservam o último resultado; foco, saída/suspensão e bloqueio com mídia ativa seguem o fluxo da 062.
- O único resultado em IndexedDB ganha campos opcionais sem alteração de versão/esquema. Resultados antigos seguem legíveis com "Não medido neste teste"; upload tentado sem amostra aparece como "Amostra insuficiente". As relações inconsistentes do upload agora são normalizadas na leitura, preservando as outras métricas e o registro original; a gravação inválida continua ignorada (T057/CF-001).
- A data é obtida ao concluir o teste inteiro, com duração monotônica independente do relógio civil (T058/CF-002). Cinco regressões reproduziram as duas lacunas antes da correção e passaram depois.

### Desvios e decisões finais

A composição preservou o motor isolado e os contratos da 062, aplicando os tetos novos apenas no teste inteiro (D-001/R-004). O diálogo usa grade 2×2 para caber os rótulos, e o card usa quatro colunas, conforme a verificação visual das Execution Notes. Nenhuma dependência nova, backend, migração Dexie ou mudança da Home. A primeira auditoria acrescentou apenas T057/T058; não houve emenda dos contratos.

Os gates completos precisaram de repetição: no Polish houve falhas de `detalhe-cinema` (R-008); na Fase 6 houve timeout no teardown do benchmark da 063 e falha no selo de série no E2E (R-009/R-010). As rodadas completas posteriores passaram. As causas não foram comprovadas: estes riscos continuam abertos, sem alteração de código desses subsistemas e sem interpretar passagem isolada como resolução.

### Validação e limites

- Nesta auditoria: gate de pré-requisito verde; travas 064/062/063 íntegras (5 contratos cada). `npx vitest run src/lib/network src/features/settings/SpeedTestMetrics.test.tsx src/features/settings/SpeedTestDialog.upload.test.tsx src/features/settings/SettingsScreen.speedTestUltimo.test.tsx src/features/home/HomeContent.speedTestUpload.test.tsx` → 57/57 verdes, incluindo U1–U5 e as regressões de T057/T058.
- Com dev server reiniciado nesta auditoria, `node e2e/run.mjs --only teste-conexao-tv --jobs 1` → 1/1 verde (24 s), cobrindo sucesso, limites, parcial, erros, cancelamento do download/upload, persistência, foco/RETURN e idiomas.
- Gates completos da execução imediatamente anterior, sem alteração de código desde então: `npx tsc -b`, `npm run lint`, `npm run build` verdes; `npm run test` 2 943/2 943; `npm run test:e2e` 42/42. Revisão do motor sem atalhos de ambiente de teste, sem dados de fonte/BYOK nas transferências e sem erro cru serializado.
- Rodada real no navegador registrada no Polish: upload medido com três POSTs e sem falha de CORS. Isso não prova a TV. R-001 permanece: origem `file://`, envio no navegador do aparelho e comportamento físico ainda não validados. A spec explicitamente mantém a TV como recomendação, sem gate; o checkbox físico permanece desmarcado (35/36), sem alterar tasks.

**README**: atualizado pontualmente na seção Organização para descrever as quatro métricas, consulta local do último resultado, limites e rota Cloudflare, incluindo a limitação de validação física.

**PRÓXIMO**: ponto de commit da feature 064; opcionalmente validar na TV física e investigar as instabilidades R-008/R-009/R-010 em fluxo próprio. Nenhum commit ou deploy feito nesta passada.

## Instalação na TV — 2026-10-07

- Solicitada pelo usuário via skill `tizen-tv`, após a convergência. Comando: `.\.planning\scripts\powershell\deploy-tv.ps1` (build atual, sem `-SkipBuild`), exit 0.
- Samsung QN50Q60DAGXZD em `192.168.0.2`: preflight sdb conectado antes do build; `npm run build:tizen` e guarda de arquivos/demux verdes; pacote assinado com `ccplay_samsung_certificate_4`; atualização instalada sem desinstalação; CLI confirmou lançamento e `applist` confirmou o app.
- Evidência operacional: `install completed`; `Tizen application is successfully installed`; `successfully launched pid = 10693`. Pacote: `CCPlayTv/.buildResult/CCPlayTv.wgt`.
- Veredito: instalação e comando de abertura aprovados por evidência do CLI. Aparência na tela, reprodução, desempenho, POST a partir de `file://` e resultado real do upload **não observados nesta passada**. R-001 e o checkbox de teste físico continuam pendentes; a instalação não encerra a validação de upload.
- SHA256 do pacote instalado: `92E10B76DAE2A90B1F7F5BAC0E8A8131F3F6350C08FF64A3F0F0F2B79902060B`.
