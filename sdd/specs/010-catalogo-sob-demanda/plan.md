# Implementation Plan: Importação por Estrutura com Carga sob Demanda por Categoria

**Slug**: `010-catalogo-sob-demanda` | **Date**: 2026-09-23 | **Spec**: `sdd/specs/010-catalogo-sob-demanda/spec.md`

## Summary

A importação de fonte de provedor passa a gravar apenas as **categorias**
declaradas pelo painel; os itens de cada categoria passam a ser obtidos e
gravados quando a pessoa entra nela, com prazo de validade próprio. A
motivação é medida, não suposta: na TV de referência, com a fonte real de
311.367 entradas, a tela de progresso parou em "Lendo entradas" com
contadores subindo devagar — gargalo de **gravação** no IndexedDB.

Tecnicamente: uma coleção `categories` nova vira entidade de primeira
classe; `catalogRepository` deixa de derivar categorias das chaves únicas
de `channels`; um `categoryLoader` novo vira o ponto único de obtenção sob
demanda; `importPipeline` bifurca por tipo de fonte (provedor JSON grava
estrutura, M3U e modo limitado seguem integrais).

**A feature depende de uma premissa não confirmada** — que o painel aceite
filtrar por `category_id`. Fechar isso é a Fase 0, antes de qualquer código
de produção.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Vite 8 (alvo de build
`chrome108`).

**Primary Dependencies**: Dexie (IndexedDB), TanStack Query (estado de
consulta das telas), `@tanstack/react-virtual` (instalado pela feature 009,
não consumido por esta).

**Storage**: IndexedDB no aparelho, via Dexie — é a fonte de verdade
(ADR-008). Sem backend. Schema atual na v6; esta feature abre a v7.

**Testing**: Vitest + Testing Library + jsdom (`npm run test`). Lint por
oxlint (`npm run lint`). Sem backend envolvido: `api/` não é tocado.

**Target Platform**: Samsung QN50Q60DAGXZD, Tizen 8.0 / Chromium 108,
empacotado em `.wgt` a partir de `CCPlayTv/`.

**Performance Goals**: SC-001 (sincronizar em ≤ 15 s), SC-002 (abrir
categoria em ≤ 3 s com rede), SC-004 (espaço pós-sincronização proporcional
ao número de categorias, não de itens).

**Constraints**: a TV não entrega console — sem `dlog`, sem `ps`, Web
Inspector fechado (confirmado em 23/09/2026). A única instrumentação em
campo é a própria interface. Isso obriga a medição a ser visível na tela ou
inexistente.

**Scale/Scope**: fonte real de referência com 311.367 entradas e algumas
centenas de categorias. É essa a escala que decide o desenho, não um caso
médio hipotético.

## Decisões Invariantes

- **D-001**: Categoria é entidade própria, com geração. Saber que uma
  categoria existe deixa de depender de ter os itens dela.
- **D-002**: A troca de geração **nunca** toca `userStates`. FR-010
  descarta catálogo; favoritos e progresso sobrevivem a qualquer
  ressincronização. Reconciliar estado do usuário pressupõe que ele
  continue existindo.
- **D-003**: A obtenção acontece na **entrada** da categoria (SELECT),
  nunca no foco. Não há pré-busca de vizinhas nesta feature.
- **D-004**: Fonte por URL M3U e provedor em modo limitado (`legacy_m3u`)
  mantêm o caminho integral atual, sem bifurcar o repositório de leitura —
  as telas continuam pedindo página de categoria, venha ela de onde vier.
  **Consequência travada (achado A1 do Analyze)**: *toda* fonte grava
  linhas em `categories`, inclusive as integrais. O que difere é
  `fetchMode` — `on_demand` versus `eager` —, nunca a existência da
  estrutura. `listCategories` tem um caminho de leitura só; não existe
  derivação de reserva para fonte sem estrutura gravada.
- **D-005**: `declaredCount` (promessa da fonte) e `itemsCount` (fato do
  disco) são campos distintos e nunca fundidos. É o que permite declarar
  divergência em vez de escolher um número.
- **D-006**: Substituição de itens de uma categoria é **integral** e em
  transação. Substituição parcial deixaria órfão de obtenção anterior.
- **D-007**: Se a Fase 0 mostrar que o painel não honra `category_id`,
  **nenhuma** alternativa de `research.md` é adotada sem reabrir o design.
  Escolher em silêncio uma que muda o perfil de memória desfaria, sem
  registro, a decisão que a feature 005 tomou por medição.
- **D-008**: Nenhuma tela fala com Dexie direto (herdado de 005 D-001).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | PASS | PASS | Nada muda no acesso; fonte continua não sendo conta. |
| Segredos Fora dos Clientes e dos Logs | ATENÇÃO | PASS | A URL de `player_api.php` com credencial deixa de ser montada 1× por importação e passa a ser montada a cada categoria aberta. Mais superfície, mesma regra. FR-017 + `data-model.md` §6 tornam explícito; task de revisão de vazamento na Polish. |
| Categorias da Fonte São Preservadas | PASS | **REFORÇA** | A categoria vira entidade com nome e ordem declarados, `name` vazio preservado. Deixa de ser número derivado. |
| IA e Classificação Nunca Inventam Dados | ATENÇÃO | PASS | Exibir `declaredCount` é exibir dado da fonte, não estimativa — desde que distinguível do real (D-005, SC-006) e com divergência declarada (FR-015). |
| Comandos Locais Independem de Rede, Backend ou IA | ATENÇÃO | PASS | O princípio enumera foco, Voltar e controles de mídia em reprodução — nenhum deles passa a depender de rede. Entrar numa categoria é obtenção de dado, como abrir uma fonte sempre foi. A degradação offline é real e está coberta pela ADR-002; ver R-007 e a emenda obrigatória. |
| Trailers e Metadados Não Alteram Estado da Obra | N/A | N/A | Feature não toca trailers nem metadados externos. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | PASS | PASS | FR-008 exige focável em carregando e erro; SC-005 verifica só com o controle. |
| Lista de Catálogo Nunca É Manifesto de Streaming | N/A | N/A | Caminho M3U inalterado; o reconhecimento de manifesto continua onde está. |
| Foco Visível e Sem Becos Sem Saída | PASS | **REFORÇA** | FR-004 (obter na entrada, não no foco) é a aplicação literal de "focar não dispara consulta externa". FR-008 cobre os estados novos. |
| Voltar Restaura Foco e Posição | **LACUNA** | PASS | A spec não tinha requisito para isso. Voltar a uma categoria revalidada precisa reconciliar o foco por id do item, não por índice — a lista pode ter mudado entre a saída e a volta. Coberto por R-004 e por task própria; recomendado virar FR na spec. |
| Identidade de Reprodução Não Depende da URL | ATENÇÃO | PASS | FR-010 descarta itens no resync. D-002 trava que `userStates` não é tocado — sem isso, ressincronizar apagaria favoritos e retomada. |
| Progresso e Capacidades São Reais | PASS | PASS | FR-013 proíbe percentual. Nota: com categorias existe denominador confiável, então percentual seria *permitido* pela constitution; a spec escolheu ser mais estrita. Não é violação. |
| Documentação do Repositório É Canônica | ATENÇÃO | PASS | Esta feature invalida `contracts/local-storage.md` §2 e `data-model.md` da 005, e amplia o alcance da ADR-002. Correção na mesma feature, não depois — tasks na Polish. |

Nenhuma violação não justificável. Nada foi para Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/010-catalogo-sob-demanda/
├── spec.md                        # Saída do sdd-specify
├── plan.md                        # Este arquivo
├── research.md                    # Fase 0 — a premissa não confirmada
├── data-model.md                  # Fase 1 — categories, v7, fronteiras
├── contracts/
│   └── catalog-on-demand.md       # Fase 1 — delta sobre o contrato da 005
├── quickstart.md                  # Fase 1 — verificação manual
└── tasks.md                       # Saída do sdd-plan
```

### Source Code (repository root)

Monorepo com frontend Tizen, projeto de empacotamento e backend congelado.
Esta feature toca **apenas** `tv-web/` e `CCPlayTv/` (nada em `api/`).

```text
tv-web/                              # React 19 + TS + Vite — o que roda na TV
├── src/
│   ├── App.tsx                      # Roteamento por estado; invalidação de consultas
│   ├── features/
│   │   ├── catalog/catalogApi.ts    # ALTERADO — hooks de consulta das telas
│   │   ├── live/
│   │   │   ├── LiveScreen.tsx       # ALTERADO — entra em categoria sob demanda
│   │   │   └── groupChannels.ts     # ALTERADO — totais reais por categoria
│   │   ├── movies/MoviesScreen.tsx  # ALTERADO
│   │   ├── series/SeriesScreen.tsx  # ALTERADO
│   │   ├── list-home/ListHomeScreen.tsx  # ALTERADO — contagem declarada
│   │   └── import/
│   │       ├── importApi.ts         # ALTERADO
│   │       └── ImportProgressScreen.tsx  # ALTERADO — conta categorias
│   └── lib/catalog/
│       ├── db.ts                    # ALTERADO — v7, coleção categories
│       ├── catalogRepository.ts     # ALTERADO — categories como entidade
│       ├── categoryLoader.ts        # NOVO — obtenção sob demanda
│       ├── importPipeline.ts        # ALTERADO — bifurca por tipo de fonte
│       ├── xtreamConnector.ts       # ALTERADO — consultas por category_id
│       └── freshness.ts             # ALTERADO — prazo por categoria
└── vite.config.ts                   # target chrome108 — não mexer

CCPlayTv/                            # Projeto Tizen empacotado em .wgt
└── tizen_web_project.yaml           # Lista de arquivos do pacote

api/                                 # Backend congelado — NÃO tocado por esta feature
```

**Structure Decision**: frontend-only. O trabalho concentra-se em
`tv-web/src/lib/catalog/` (contrato de dados) e nas telas que consomem o
catálogo. `api/` permanece congelado por ADR-008.

## Complexity Tracking

> Nenhuma violação de constitution exigiu justificativa.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| — | — | — |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

O que é testável sem a TV: toda a lógica de decisão do `categoryLoader`
(fresh/fetched/stale-served/failed), a bifurcação do `importPipeline`, o
schema v7, os repositórios, e os estados focáveis das telas. Testes com
instante **injetado**, nunca lendo o relógio dentro da função — é o padrão
que `freshness.ts` já estabelece e o que torna a regra de validade
determinística.

O que **só** a TV decide: SC-001, SC-002 e SC-004. São números de
desempenho no aparelho de referência, e a TV não entrega console — a
medição tem que aparecer na interface ou não existe.

Comandos-base:

```powershell
cd tv-web
npm run test        # vitest run
npm run lint        # oxlint
npm run build       # tsc -b && vite build
npm run build:tizen # build + sync para CCPlayTv/
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | O painel pode não honrar `category_id`. A única referência do repositório (`docs/iptvnator/06`) mostra o cliente maduro baixando a seção inteira e filtrando localmente | **Crítico** — é a premissa que sustenta a feature | Fase 0 sonda o painel real antes de qualquer código de produção. Alternativas mapeadas em `research.md`; D-007 proíbe adotar qualquer uma sem reabrir o design |
| R-002 | Painel pode limitar taxa de requisições quando a pessoa percorre muitas categorias rápido | Médio — categorias falhando sem motivo aparente | Uma obtenção por categoria compartilhada entre chamadas concorrentes (contrato §2, regra 2); observar na TV; não há retentativa automática agressiva |
| R-003 | `declaredCount` pode divergir do entregue | Baixo — mas vira número mentiroso se escondido | D-005 separa os campos; FR-015 exige declarar |
| R-004 | Voltar a uma categoria revalidada com a lista mudada pode perder o foco ou estourar índice | Médio — viola "Voltar Restaura Foco e Posição" | Reconciliar por id do item, padrão que `LiveScreen` já usa (`FocusIdentity`) e que `MoviesScreen`/`SeriesScreen` passaram a usar em 23/09/2026 |
| R-005 | A feature 009 está Em Execução e refatora `LiveScreen.tsx`, que esta feature também altera | Médio — conflito e retrabalho | Ordem entre as duas é decisão a tomar antes da Fase 3; recomendação em "Cuidados" |
| R-006 | FR-010 descarta itens obtidos ao ressincronizar; a pessoa perde o que baixou navegando | Médio — percepção de perda | Decisão explícita do usuário na clarificação de 23/09/2026. Registrada, não silenciosa |
| R-007 | Cobertura parcial deixa de ser exceção e vira o modo normal de operação | Médio — a ADR-002 passa a ser lida ao contrário do que o app faz | Emenda obrigatória à ADR-002 dentro desta feature (R0-4 de `research.md`) |
| R-008 | Fonte importada pelo modelo antigo fica sem `categories` e com itens sem `categoryId` | Médio — catálogo existente parece vazio | Sem migração de dados: tratada como fonte a re-sincronizar (`data-model.md` §4). Converter exigiria adivinhar `providerCategoryId`, que a constitution proíbe |
| R-009 | **Resolvido**: trocar `listCategories` para ler a coleção `categories` deixaria toda fonte M3U sem categoria alguma, porque o caminho integral não gravava estrutura. Regressão invisível aos testes atuais — nenhum deles lê categorias de fonte M3U depois da migração | **Era crítico** — quebraria fontes que funcionam hoje | Resolvido em 23/09/2026 (achado A1 do Analyze): o caminho integral passa a gravar estrutura com `fetchMode: 'eager'`, criando a categoria na primeira aparição do grupo. D-004 estendida; `data-model.md` §2.1 e contrato §3 registram a decisão e a alternativa rejeitada. Coberto por T021 (implementação) e T016/T017 (regressão) |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: Fase 0 — sondar `category_id` contra o painel real. Nada de
produção antes disso (D-007).

## Arquivos Principais

- (nenhum ainda)

## Cuidados para Retomada

- (nenhum ainda)
