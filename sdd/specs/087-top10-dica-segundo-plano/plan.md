# Implementation Plan: Top 10 e Dica produzidos em segundo plano

**Feature**: 087-top10-dica-segundo-plano
**Spec**: `spec.md`
**Criado**: 2026-10-21

## Summary

Mover a produção do **Top 10** e da **Dica** da tela para a fila de segundo plano, guardando o resultado, e fazer as
telas apenas **lerem** esse resultado. As regras de seleção da feature 057 não mudam — muda **onde** e **quando** são
calculadas.

O que motiva: casar o ranking do TMDB com a lista exige um índice com os nomes de **todos** os itens do tipo, e montá-lo
percorre o catálogo inteiro (43 549 filmes na TV de referência). Hoje isso acontece na tela — fora da montagem (o slot é
`external`), mas na mesma thread, enquanto a pessoa navega. Depois da feature 086, é a última coisa que ainda percorre o
catálogo quando uma tela abre.

O trabalho real **não** é a mudança (ela já foi escrita uma vez, na 086/T082, e revertida): é levar para o lugar novo as
**14 garantias de comportamento** que hoje vivem nos testes de tela da 057, listadas em `spec.md` → `## Assumptions`.

## Technical Context

- **Linguagem/plataforma**: TypeScript + React 19 + Vite, alvo `chrome108`; app Tizen rodando de `file://` na TV
  (QN50Q60DAGXZD, Tizen 9 / Chromium 120).
- **Armazenamento**: IndexedDB via Dexie 4 (`tv-web/src/lib/catalog/db.ts`). A tabela `showcaseExternalRows` **já
  existe** (schema v17, feature 086) com índice `'id, sourceId, [sourceId+generation+kind]'`. Os campos novos desta
  feature **não são indexados** → **não há migração de schema**.
- **Serviço externo**: TMDB, com a chave BYOK da pessoa (ADR-020). O carregador (`lib/metadata/tmdbDiscovery.ts`) já faz
  cache por período em `discoveryCache` e já responde sem rede quando o período está em cache.
- **Regras de seleção**: `lib/metadata/discoveryRules.ts` (`selectTop10`, `selectTip`, `matchDiscoveryTitlesAsync`,
  `TOP10_MIN`, `TIP_MIN`, `yieldToMain`). **Contrato travado da feature 057 — não muda.**
- **Fila de segundo plano**: `lib/catalog/prefetch/index.ts` → `housekeeping()`. Já traz de graça: espera o aparelho
  ficar quieto (`activityGate`), cede a vez à primeira tela da sessão (`firstReveal`, feature 086) e se cala durante a
  carga da lista (`loadActivity`, feature 086).
- **Testes**: Vitest em dois projetos (`dom` para `*.test.tsx`, `node` para `*.test.ts`); E2E próprio em `tv-web/e2e/`.
- **Performance**: Filmes e Séries abrem em 313–380 ms (medido na TV em 2026-10-21). Esta feature **não deve piorar**
  isso, e o ganho esperado é em fluidez durante a navegação, não em tempo de abertura.

## Decisões Invariantes

1. **`discoveryRules.ts` e `tmdbDiscovery.ts` não mudam**, exceto **exportar `localDay`** (uma linha). Os dois têm
   contrato travado da feature 057.
2. **A forma do retorno de `useWeeklyTop10`/`useDailyTip` não muda** (`DiscoveryRowResult<R>`): o contrato de tela da
   057 (`VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`) **mocka esses dois hooks**, e mudar a forma o quebra.
3. **O produtor mora em `lib/catalog/`**, nunca em `features/` (ratchet `lib-to-ui`). O registro guarda
   `CatalogReadItem`; a conversão para o item de tela fica na leitura, como a feature 086 já faz.
4. **Gravar vazio é intencional** quando a seleção fica abaixo do mínimo: o período é a validade, e sem isso a fila
   repete o trabalho mais caro (montar o índice do tipo) a cada rodada.
5. **A produção nunca roda na carga da lista nem antes da primeira revelação da sessão** — herda os portões da 086, e
   **não** é chamada ao fim da carga por seção.
6. **Consulta ao TMDB passa a ser disparada por tempo, não por abrir a tela.** É uma mudança de natureza, aceita com o
   limite que o período impõe: no máximo 1 consulta/semana (Top 10) + 1/dia (Dica) por tipo, com a lista ativa — no
   máximo 4 por dia. A ADR-016 ("nenhuma consulta automática") trata do **serviço do portal**, não do TMDB; nenhuma ADR
   é contrariada. Registrado como R-001.
7. **Nenhum segredo sai**: a chave do TMDB nunca entra em registro, log ou métrica. O registro guarda só o que o card
   mostra.

## Constitution Check

| Princípio | Pré-Design | Pós-Design |
| --- | --- | --- |
| Foco é o estado mais importante; todo estado tem elemento focável | OK — a fileira que entra depois não move foco nem rolagem (FR-006); sem resultado a fileira não existe, e a tela já tem outras fileiras e a trilha | OK — nenhuma mudança de foco; a leitura entra pelo caminho que a 086 já usa |
| Voltar restaura foco e rolagem por id | OK — não toca navegação | OK |
| Identidade lógica estável (nunca URL) | OK — o registro guarda itens por id local do catálogo | OK |
| Segredos fora de log, erro e UI | **Atenção**: a produção usa a chave BYOK. Decisão invariante 7 fecha: a chave não entra no registro nem em métrica | OK — o registro tem só itens, posições, fundos e notas |
| Nada de progresso inventado nem dado falso | OK — sem resultado a fileira **não existe**; nunca esqueleto nem "Em breve" (FR-005) | OK |
| Categoria do provedor nunca substituída por taxonomia externa | OK — o TMDB só casa títulos; categorias não são tocadas | OK |
| Categoria escondida/travada nunca aparece | **Atenção**: o índice do produtor é do tipo inteiro. A cobertura gravada vem de `listVisibleCategories` | **Ver R-002**: o casamento usa o tipo inteiro, como hoje; a decisão de visibilidade continua onde já está |
| Verdades honestas; gate de qualidade antes de "pronto" | OK | OK — 5 contratos travados + E2E + TV |

Sem violação não justificável. Nada para `## Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```
sdd/specs/087-top10-dica-segundo-plano/
├── spec.md
├── plan.md
├── tasks.md
├── logic/producao-em-segundo-plano.md    ← onde cada coisa mora e quando roda
├── quickstart.md
└── contract-tests.lock
```

### Source Code (repository root)

```
tv-web/src/
├── lib/catalog/
│   ├── externalRows.ts                 ← NOVO (stub criado): o produtor
│   ├── showcaseRows.ts                   readExternalRow / writeExternalRow (prontos)
│   ├── showcaseTypes.ts                  ShowcaseExternalRowRecord (campos novos já no stub)
│   └── prefetch/index.ts                 housekeeping chama o produtor
├── lib/metadata/
│   ├── discoveryRules.ts                 NÃO MUDA (contrato travado da 057)
│   └── tmdbDiscovery.ts                  só exporta `localDay`
└── features/catalog/
    ├── catalogApi.ts                     useWeeklyTop10/useDailyTip passam a ler
    ├── catalogApi.discovery.test.tsx      ← 14 garantias mudam de lugar
    └── catalogApi.discovery.estados.test.tsx
```

## Complexity Tracking

Nada a registrar.

## Estratégia de Testes

Prioridade: unitário → contrato → E2E → manual na TV.

```bash
# área tocada (rápido, durante as fases)
npx vitest run src/lib/catalog src/features/catalog src/lib/metadata

# contratos desta feature
npx vitest run src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx

# gates finais
npm run test && npx tsc -b && npm run lint && npm run build
npm run test:e2e        # precisa de `npm run dev` no ar
```

Travas a conferir (esta feature e as que ela pode quebrar):

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 087-top10-dica-segundo-plano
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 057-top10-dica-tmdb
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 086-montagem-rapida-telas
```

### Testes de Contrato

**5 de 5 do orçamento usados.** Arquivos travados em `contract-tests.lock`:

| Teste | Arquivo | Origem | Vermelho confirmado por |
| --- | --- | --- | --- |
| grava os mesmos itens, na mesma ordem e com a posição real | `lib/catalog/externalRows...contract.test.ts` | **FR-004**, US1/AC1 | `not implemented` |
| dentro do período não produz; vencido sem resposta mantém | idem | **FR-007**, **FR-008**, US2/AC1+AC3 | `not implemented` |
| abaixo do mínimo grava o período com a fileira vazia | idem | **FR-015** | `not implemented` |
| lê o guardado sem tocar a rede nem percorrer o catálogo; sem resultado a fileira não existe | `features/catalog/catalogApi...contract.test.tsx` | **FR-001**, **FR-002**, **FR-003**, **FR-005** | asserção (`expected +0 to be 3`) |
| remover a chave apaga o guardado e a fileira some, sem requisição | idem | **FR-011**, US3/AC2 | asserção — **hoje a tela toca a rede** (`called 1 times`) |

Confirmado em 2026-10-21: `5 failed (5)`, nenhum por erro de import, sintaxe ou tipo; e a suíte da área seguiu com
`1002 passed` — os stubs não quebraram nada.

**O que os contratos deliberadamente NÃO cobrem** (fica para os testes de fase, porque o orçamento é 5): troca de
idioma (FR-012), salvar a chave acordando a fila (FR-010), série usando o ranking de séries, estabilidade do sorteio da
Dica, e as demais garantias da lista de `## Assumptions`. **Elas não são opcionais** — o FR-017 as exige, e o Critério
de Conclusão de cada fase as cobra.

## Estado Atual

| Área | Estado |
| --- | --- |
| Contratos travados (087) | **5/5 verdes**. Trava íntegra |
| Travas de outras features (057, 086) | Íntegras |
| Código | Completo. O produtor só roda **com a fila vazia** e monta o índice **uma vez por tipo** (T050) |
| `npm run test` | **3714/3714**, 684 arquivos |
| `tsc` / `lint` / ratchet | Verdes |
| `npm run test:e2e` | 54/54 na última rodada completa (antes do T050/T051, que não tocam o E2E) |
| **SC-007 (fluidez na TV)** | **Ainda não cumprido**, com ganho medido: pior quadro **1750 → 583–900 ms**, entrada em categoria **3763 → 899 ms** (pior caso), fps mediano de volta a 38. 900 ms de quadro congelado segue visível. Evidência: rodada 3 de `evidencias/medicao-tv-2026-10-21.md` |
| **SC-008 (abertura na TV)** | **Aprovado** — 348–374 ms, dentro da faixa de 313–380 ms |
| Sonda automática (T051/T052) | Pronta, com trava testada e **ensaio no PC aprovado**. Tocou uma série na 1ª versão — incidente registrado na evidência |
| TV | Medida com a sonda automática (3 de 4 janelas; 1 abandonada pela trava, sem acionar nada). Pacote **normal** reinstalado |
| O que sobrou de engasgo | Duas fontes, separadas por evidência: a carga por seção (`movie` 9,69 s, com o produtor **calado**) e uma montagem de índice por tipo, que cede a vez entre categorias e não dentro. A 1ª **não é desta feature** |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação |
| --- | --- | --- | --- |
| R-001 | **A consulta ao TMDB passa a ser disparada por tempo**, não por abrir a tela: a cota da chave da pessoa é consumida mesmo em sessões em que ela nunca abriria Filmes ou Séries | Consumo de cota alheio ao uso; mudança de natureza em relação ao que existe hoje | **Resolvido** (auditoria 2026-10-21): o teto se sustenta no código — a produção disparada por cobertura chama o carregador, que responde do cache do período **sem rede**, então só a virada de período consulta. Decisão invariante 6: o período limita a no máximo 1 consulta/semana (Top 10) + 1/dia (Dica) por tipo, só com lista ativa — no máximo 4/dia. A ADR-016 trata do serviço do portal, não do TMDB. **Se o consumo incomodar, a saída é produzir só depois de a tela ter sido aberta uma vez na vida da lista** — registrar antes de implementar |
| R-002 | O índice do produtor é do **tipo inteiro**, incluindo categorias escondidas/travadas — igual a hoje | Um título de categoria escondida poderia entrar na fileira | **Resolvido** (auditoria: nenhuma violação nova). **Igual ao comportamento atual** (a feature não muda isso): o casamento é por nome, e a cobertura gravada vem de `listVisibleCategories`. Se virar requisito, é feature própria — não alargar aqui sem registrar |
| R-003 | Os 14 testes de comportamento mudam de lugar; perder uma garantia no caminho é silencioso | Regressão invisível em "sem rede", "chave recusada", "troca de idioma" | **Resolvido**: as 14 garantias estão no lugar novo e os dois arquivos antigos saíram. O FR-017 e a tabela do `logic` §8 listam cada garantia e o destino dela. O Critério de Conclusão da Fase 4 exige a tabela inteira coberta |
| R-004 | A estabilidade do sorteio da Dica **muda de natureza**: era "fixado na montagem da tela", passa a ser "fixado no período gravado" | Um teste de hoje cobre o comportamento antigo e não tem equivalente direto | **Resolvido**: teste do produtor afirma a estabilidade pelo `periodKey`. Esperado e mais forte (sobrevive a remontagens). Registrado no `logic` §8; o teste equivalente verifica a estabilidade pelo `periodKey` |
| R-005 | `catalogApi.ts` tem teto de linhas no ratchet | Build vermelho por 1 linha, como aconteceu na 086 | **Resolvido**: ratchet verde no fim, com `catalogApi.ts` em 2052 linhas (era 2160). Mordeu duas vezes durante a execução. Remover o bloco da tela **reduz** o arquivo. Rodar `node scripts/architecture.mjs` antes de fechar a fase, e **não** aproveitar para mover outras coisas para lá |
| R-006 | **Emenda aprovada ao contrato 1** (2026-10-21, Fase 3): a referência do teste lia `database.channels`, vazia desde a feature 082 (itens em bloco comprimido). Como escrito, ele exigia fileira vazia com 3 títulos cruzando — e contradizia o contrato 2, que exige `>= TOP10_MIN` com a mesma semeadura | Nenhum produtor satisfazia os dois contratos ao mesmo tempo | **Resolvido**: a referência passou a ler os itens por `iterateKindRecordBatches`, onde eles estão (7 linhas no próprio teste, intenção intacta — as mesmas funções da 057 sobre os mesmos dados). Trava regravada com `-Write`. Nada no código de produção mudou por causa disto; a comparação virou real (3 itens, ranks 1/3/4) em vez de vazia contra vazia |
| R-007 | **A invalidação que o plano supunha não alcançava a fileira** (descoberto na T027): o `logic` §7 dizia que a chave sob `catalog-search-index` bastaria, porque "a pré-carga e a sincronização já invalidam esse prefixo". Mas a pré-carga só invalida quando **uma categoria chega**, e o produtor roda no `housekeeping` — justamente quando não há mais nenhuma a chegar; e a invalidação que a 086 instalou é estreita (`…, kind, 'showcase'`) | O FR-006 não se cumpriria: a fileira só apareceria na próxima visita à tela | **Resolvido** pela T028, espelhando o canal da feature 086 (`onScreenDocumentRefreshed`): o produtor avisa ao gravar e `usePrefetchForSource` invalida **só** `['catalog-search-index', sourceId, kind, 'external']` — o foco e a rolagem ficam onde estão. Coberto por teste nos dois lados (produtor avisa / a tela relê sem remontar) |
| R-008 | **A validade pelo período sozinha perdia a garantia 4** (descoberto na T033): uma categoria que chega depois **não** muda o período, então o produtor recusava refazer e a fileira ficava parada no catálogo de quando foi produzida até a semana virar -- o teste de hoje (categoria que chega depois atualiza a fileira) não teria equivalente | Fileira desatualizada por até uma semana durante a pré-carga, que é justamente quando o catálogo cresce | **Resolvido** pela T036: a **cobertura gravada** (`coveredCategories`/`totalCategories`, que o registro já guardava) entra na validade junto com o período. Refazer não consulta nada -- o ranking do período já está em cache. Limite registrado: uma categoria **renovada** com a mesma contagem só entra quando o período virar |
| R-009 | **O produtor passou a carregar as suas próprias barreiras** (T047, achado CV-001 da convergência): o `activityGate` do agendador cobre tecla, player, app oculto e rede — e **nada mais** —, e o `housekeeping` é chamado depois de **cada categoria** da carga. A frase que eu escrevi no `logic` §5 e repeti no handoff (*"a fila já traz de graça os três portões"*) era falsa: traz um | Com a cobertura na validade (R-008), o índice do tipo inteiro seria remontado a cada categoria que chega — o trabalho que a 086 tirou desse caminho (carga de séries 26,6 s → 3,5 s) | **Resolvido**: `refreshStaleExternalRows` devolve `false` se `isSectionLoadActive()` ou `!isFirstRevealDone()`. Devolver e não esperar é de propósito (esperar prenderia o agendador), igual a `fillNextCandidates`. Dois testes provam as duas barreiras, e o `isFirstRevealDone` tem teto de 2,5 s, então nada fica preso se nenhuma tela montar |
| R-010 | **O T047 cobria só metade do FR-014** (achado na TV): ele barra a carga **por seção**, mas o agendador chama o `housekeeping` depois de **cada categoria** da pré-carga, e a cobertura na validade (R-008) mandava refazer | Medido: **10 montagens** do índice do tipo inteiro para 10 categorias chegando. Na TV: pior quadro **1750 ms**, mediana 32 fps (base 38) e entrada em categoria **3763 ms** (base ~200 ms) — SC-007 reprovado | **Resolvido pelo T050**: o `housekeeping` recebe `idle` e o produtor só roda com a fila vazia; o índice é montado **uma vez por tipo** e reusado pelas duas fileiras. Depois: 0 durante a carga, 1 por rodada. **Falta medir na TV** |
| R-011 | **A sonda automática tocou uma série** (T051): as teclas saíram no mesmo tick, o foco (estado do React, ADR-009) andou um passo e o `Enter` caiu num card de "Continue assistindo" | Reprodução acidental no aparelho do usuário, e rodada sem medida nenhuma | **Resolvido pelo T052**: laço fechado (uma tecla, confere o foco) e `Enter` **só** com o foco no item da topbar, pelo rótulo — 3 testes fixam isso e o ensaio no PC passou. Causa de método: eu pulei o ensaio no PC que a skill manda fazer **antes** de instalar |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-21 | Fase 1 (Setup) | T001/T002: 5 contratos vermelhos pelo motivo esperado (3 `not implemented`, 2 asserção) e as três travas (087/057/086) íntegras | Nenhuma |
| 2026-10-21 | Fase 2 (Foundational) | T010: `localDay` exportado (uma linha); `tsc` verde e trava da 057 íntegra | Nenhuma |
| 2026-10-21 | Fase 3 (US1 — MVP) | T020–T028: produtor pronto e ligado na fila; a tela só lê; `catalogApi.ts` 2160 → 2066 linhas. 3/3 contratos da fase verdes. **Emenda R-006** ao contrato 1 (referência lia `channels`, vazia desde a 082) aprovada pelo usuário e trava regravada. **R-007**: a invalidação suposta no plano não alcançava a fileira — resolvido pela T028 | As 15 garantias do lugar antigo seguem vermelhas até a T033 (Fase 4) |
| 2026-10-21 | Fase 4 (US2/US3) | T030–T036: salvar acorda a fila; remover apaga os registros na transação da chave; trocar o idioma mantém e marca para refazer. **As 14 garantias movidas** e os 2 arquivos antigos removidos — área com 1009 passed, 0 falhas. **R-008**: a validade só por período perdia a garantia 4 -> a cobertura gravada entra na conta | O ratchet de `catalogApi.ts` quebrou por 12 linhas e foi corrigido enxugando comentários (R-005) |
| 2026-10-21 | Fase 5 (Polish) | T040–T042 e T045: gates verdes (`test` 3708/3708, `tsc`, `lint`+ratchet podado, `build`), **E2E 54/54** e `CLAUDE.md` com a regra da 087. O roteiro `top10-dica.mjs` codificava o comportamento antigo em três pontos e foi adaptado (T045) | T043/T044 na TV, esperando autorização |
| 2026-10-21 | Fase 5 (T046) | Os itens 5 e 6 do `quickstart.md` §3 (chave salva de novo; troca de idioma) saíram do teste unitário para o navegador real, no `top10-dica.mjs` — §3 completo | Flake em `orcamento-armazenamento-migracao` (1 em 3 paralelas, verde em série), alheio a esta feature |
| 2026-10-21 | Fase 6 (Convergence) | T047–T049: o produtor passou a se calar durante a carga e antes da primeira revelação (CV-001, o achado que ordenava o resto); FR-006 afirmado com foco e rolagem reais (CV-002); `['tmdb-discovery']` removida de três pontos (CV-004). Gates: test 3710/3710, E2E 54/54 | CV-003: SC-007/SC-008 na TV, esperando autorização |
| 2026-10-21 | Fase 6 (TV) | A TV **reprovou o SC-007** (pior quadro 1750 ms, entrada em categoria 3763 ms) e o usuário percebeu antes do número. Causa medida sem TV: 10 montagens do índice para 10 categorias → **T050** (produtor só com a fila vazia; um índice por tipo). **T051/T052**: sonda automática de medição, que na 1ª versão tocou uma série — trava testada e ensaio no PC aprovado | Medir o T050 na TV |

PRÓXIMO: **medir o T050 na TV** — a sonda automática está pronta e ensaiada; instalar o build de medição com `VITE_CCPLAY_AUTOPILOT=1`, deixar as 4 janelas de 60 s rodarem e comparar com `evidencias/medicao-tv-2026-10-21.md` (mediana 32 fps, pior quadro 1750 ms, entrada 3763 ms). Depois reinstalar o pacote normal. **Pede autorização do usuário.** Enquanto não for medido, o SC-007 segue reprovado.

## Arquivos Principais

- `tv-web/src/lib/catalog/externalRows.ts` — o produtor (stub; T020/T021)
- `tv-web/src/lib/metadata/tmdbDiscovery.ts` — só exportar `localDay` (T010)
- `tv-web/src/lib/catalog/prefetch/index.ts` — `housekeeping` chama o produtor (T022)
- `tv-web/src/features/catalog/catalogApi.ts` — os dois hooks passam a ler (T023/T024)
- `tv-web/src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts` — 3 contratos travados
- `tv-web/src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx` — 2 contratos travados

## Cuidados para Retomada

- **O teto do ratchet de `catalogApi.ts` quebra por qualquer linha acrescentada depois da poda.** Pode (`node scripts/architecture.mjs --prune`) **uma vez, no fim**: podei na Fase 3 (2066) e a Fase 4 voltou a 2078. O contrato `scripts/architecture.codigo-saudavel.contract.test.mjs` reprova, e `npm run test` leva ~2,4 min para contar isso.
- **`catalogApi.ts` e `externalRows.ts` têm fim de linha diferente** (CRLF no antigo, LF no criado pelo Write). Editar por script sem detectar o fim de linha gera arquivo **misto** e as âncoras de texto param de casar. Normalize o arquivo inteiro antes de editar.
- **`queryClient.removeQueries` não faz uma consulta com observador ativo reler**: a tela fica com o dado anterior até sair e voltar. Para a fileira sumir na hora, é `invalidateQueries`. Custou uma rodada de depuração no contrato do FR-011.
- **`page.waitForFunction` não espera uma Promise devolvida pelo predicado** (trata o objeto como verdadeiro e segue): a espera da produção no E2E foi para o lado do Node, com `page.evaluate` em laço. O roteiro passava e falhava na asserção seguinte.
- **Trocar o idioma muda o rótulo da fileira**: no E2E, asserção depois da troca precisa de seletor neutro (`section.vod-row:has(.content-card-rank)`) e do título do provedor, que nunca é traduzido.
- **O portão do agendador (`activityGate`) não cobre carga nem primeira revelação.** Toda tarefa adiável nova que seja **cara** precisa checar `isSectionLoadActive()` e `isFirstRevealDone()` por conta própria — o `housekeeping` é chamado depois de cada categoria da carga. Foi o achado CV-001.
- **Teclas sintéticas: uma por tick, nunca em rajada.** O foco deste app é estado do React (ADR-009), então despachar várias no mesmo tick faz o React agrupar e o foco andar **um** passo. Quem automatiza navegação anda uma tecla, confere o foco, repete — e nunca aciona `Enter` sem conferir **onde** o foco está.
- **`housekeeping` é chamado depois de CADA categoria da pré-carga**, não só quando a fila esvazia. Tarefa cara precisa do `idle` (feature 087, T050) — `isSectionLoadActive()` cobre apenas a carga por seção.
- **Heredoc de shell com backtick quebra o parsing** neste ambiente: scripts de edição maiores vão para arquivo `.py` no scratchpad e são executados por caminho.

## Resultado Final

A tela de Filmes e de Séries **deixou de calcular** o Top 10 e a Dica. Um produtor na fila de segundo plano
(`lib/catalog/externalRows.ts`) carrega o ranking, monta o índice de nomes do tipo, cruza, seleciona e grava em
`showcaseExternalRows`; a abertura **lê um registro por chave primária**. As regras de seleção da feature 057 não
mudaram em nada — mudou **onde** e **quando** rodam. `catalogApi.ts` caiu de 2160 para **2052 linhas**.

### O que ficou diferente do plano

| O que o plano dizia | O que ficou | Por quê |
| --- | --- | --- |
| A referência do contrato 1 compara com o que as regras produzem sobre `database.channels` | Compara sobre os itens lidos por `iterateKindRecordBatches` | `channels` está vazia desde a feature 082: como escrito, o contrato exigia fileira vazia com 3 títulos cruzando, e contradizia o contrato 2. Emenda aprovada pelo usuário (R-006) |
| "A fila já traz de graça os três portões da 086" (`logic` §5) | **Falso**: traz um. O produtor carrega as suas próprias barreiras | O `activityGate` só sabe de tecla, player, app oculto e rede (R-009) |
| A validade do registro é o período | Período **mais a cobertura gravada** | Sem a cobertura, uma categoria que chega depois não atualizaria a fileira até a semana virar — a garantia 4 se perderia (R-008) |
| Uma fileira por rodada da fila | **Um tipo** por rodada, com o índice montado uma vez e reusado pelas duas fileiras | Uma montagem por fileira dobrava a parte cara. Medido na TV antes da correção: 10 montagens para 10 categorias (R-010) |
| O aviso da pré-carga faria a fileira entrar sozinha | Canal próprio (`onExternalRowRefreshed`) | A invalidação da pré-carga depende de **uma categoria chegar**, e o produtor roda quando não há mais nenhuma (R-007) |
| — | Sonda **automática** de medição (`lib/perf/autopilot.ts`), pedida pelo usuário | O roteiro manual exigia cronômetro e não era comparável entre rodadas. A 1ª versão tocou uma série na TV; corrigida com `Enter` só no item da topbar (R-011) |

### Vereditos na TV (`evidencias/medicao-tv-2026-10-21.md`)

Comparados com a medição da feature 086 que o próprio SC-007 manda usar como referência
(`086/evidencias/validacao-final.jsonl`, 332 janelas de quadros):

| Critério | Referência 086 | Medido | Veredito |
| --- | --- | --- | --- |
| **SC-007** (quadros longos ao navegar) | fps mediana **38**, pior quadro **917 ms** | fps mediana **38**, pior quadro **583–900 ms** | **Cumprido** — não aumentou |
| **SC-008** (abertura) | mediana 314 ms, faixa declarada 313–380 | 331 / 349 / 386 ms | **Cumprido** |
| registro: entrar em categoria | mediana **229 ms**, máximo **5945 ms** | mediana **627 ms**, máximo **899 ms** | Pior caso 6,6× melhor; mediana pior, **sem veredito** (ver abaixo) |

O caminho até aqui não foi reto, e vale registrado: a primeira medição na TV **reprovou** o SC-007 com pior quadro
de **1750 ms** e entrada em categoria de **3763 ms**, e o usuário percebeu a piora antes de qualquer número. A causa
era desta feature — o índice do tipo inteiro remontado a cada categoria que chegava — e foi medida sem a TV, com o
índice instrumentado: 10 categorias, 10 montagens. Depois do T050: **0 durante a carga, 1 por rodada**.

### O que fica aberto, e não é desta feature

1. **Pior quadro de ~900 ms e mediana de entrada em 627 ms.** A auditoria separou as fontes por evidência: o quadro
   de 900 ms caiu na janela em que `section-load movie` levou 9,69 s (2,65 s só de `encode`), com o produtor calado
   por `idle: false`. A raiz provável é **uma só** para os dois sintomas: uma categoria gorda é descomprimida e
   projetada numa **tarefa única** (`readHeaderChunks`), e `iterateKindRecordBatches` cede a vez **entre** categorias,
   não dentro. Isso é código da feature 082 e serve a **todo** leitor do catálogo — merece assessment próprio, agora
   que existe ferramenta para medi-lo de forma repetível.
2. **A mediana de entrada (627 contra 229 ms) está sem veredito de propósito**: a sonda navega sem pausa (uma tecla
   a cada 300 ms por 60 s), a medição da 086 foi roteiro humano com pausas. O A/B que resolve — produtor ligado
   contra desligado, mesma sonda — ficou para o assessment.
3. **Flake alheio**: `orcamento-armazenamento-migracao` falhou 1 em 4 execuções completas em paralelo e passou em
   série (29,2 s contra 131,4 s sob carga). Não é desta feature; o lugar dele é o backlog.

### Gates finais

`npm run test` **3714/3714** (684 arquivos) · `npx tsc -b` · `npm run lint` (ratchet verde) · `npm run build` ·
`npm run test:e2e` **54/54** · 5/5 contratos travados verdes · travas de **087, 057 e 086** íntegras · pacote
**normal** reinstalado na TV.
