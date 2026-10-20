# Assessment Explora: Montagem lenta das telas principais (Início, Filmes, Séries)

- **Slug**: montagem-lenta-das-telas-principais-inicio
- **Criado**: 2026-10-20
- **Origem**: texto do usuário ("as principais telas ainda têm as montagens demoradas... medir, entender e propor uma nova
  solução... velocidade, performance e eficiência no uso de memória")

## Ideia Bruta

A montagem de Início, Filmes e Séries demora. Medir na TV, entender a causa e propor uma solução que melhore os três eixos:
tempo até a tela aparecer com conteúdo, custo de processamento e uso de memória.

## Como a montagem funciona hoje (feature 079)

`useScreenAssembly` + `stepAssembly` (`lib/assembly/`) esperam as leituras de cada fileira e as capas da primeira tela, e
revelam por um de quatro caminhos: **cache** (leituras principais já prontas no 1º render), **ready** (streaming: passados
300 ms, mostra o que já está pronto), **pronta** (tudo resolvido) ou **cap** (teto de 2 000 ms — revela com o que tiver).
O Início tem 6 slots (billboard + 5 fileiras); a vitrine tem 8 (sendo `categories` obrigatória).

## Evidência a Favor

### 1. Medição no app real da TV (2026-10-20, canal de métricas, lista real)

Fonte: `sdd/specs/082-orcamento-armazenamento-tv/evidencias/app-metricas-tv-2026-10-20.jsonl` (linhas `assembly`).

| Tela | Momento | `revealMs` | Motivo | Leituras ainda pendentes | Capas prontas/pedidas |
| --- | --- | --- | --- | --- | --- |
| Início | 1ª abertura | **2 048** | `cap` | **6 de 6** | 0 / 0 |
| Início | 2ª abertura (depois de reinstalar) | **2 047** | `cap` | **6 de 6** | 0 / 0 |
| Filmes | 1ª entrada | 404 | `ready` | 6 | 0 / 13 |
| Filmes | demais entradas | 359–371 | `ready` | 2–3 | 3 / 17 |
| Início | reentradas | 1 | `cache` | 2–3 | 0 / 2–8 |

Leitura: nas duas aberturas medidas o Início **estourou o teto de 2 s com as 6 leituras ainda pendentes** — ou seja, a tela
apareceu sem nenhuma fileira. A vitrine de Filmes aparece em ~0,4 s, mas pelo caminho `ready` (streaming aos 300 ms), com
2 a 6 fileiras ainda faltando e quase nenhuma capa pronta (3 de 17).

### 2. A causa provável: cada tipo é varrido inteiro na abertura

`features/catalog/catalogApi.ts:1651` `loadShowcaseSelections` percorre **todo o catálogo do tipo**, bloco a bloco
(`iterateKindRecordBatches`), para escolher 12 "Adicionados recentemente" e os "Bem avaliados". O Início pede isso para
**filmes e séries** (`useRecentlyAdded(sourceId, 'movie')` e `(… , 'series')`, `HomeContent.tsx:125-126`), e a vitrine usa a
mesma chave.

Medição no PC (2026-10-20, Node 22, lista real reconstruída das amostras sanitizadas; **diagnóstico, não aprova desempenho**):

| Tipo | Itens | Passada | Heap retido na passada | Pico de heap |
| --- | --- | --- | --- | --- |
| Filmes | 43 510 | 281–298 ms | +34,2 a +41,4 MB | 125–166 MB |
| Séries | 9 768 | 34–69 ms | +5,1 a +7,7 MB | 193–198 MB |

A TV de referência é ~4× mais lenta em CPU (medição da 082): ASSUMPTION — a mesma passada custaria ~1,2 s (filmes) e ~0,2 s
(séries) lá, ~1,4 s somados, na thread da interface, só para montar duas fileiras de 12 cards. Isso sozinho consome a maior
parte do teto de 2 s, e as outras quatro leituras do Início disputam a mesma thread.

### 3. O custo não para na montagem

- A passada cede a thread a cada 2 000 registros (`SHOWCASE_SLICE`), mas o trabalho total continua: casa com os **28 quadros
  acima de 100 ms com o controle parado** medidos hoje (SC-003 da 082, `evidencias/medicao-app-real-tv-2026-10-20.md`), que
  subiram justamente na janela de remontagem de Início e Filmes.
- Com chave TMDB configurada, a passada ainda acumula `compact` — o tipo inteiro compactado em memória — para o Top 10 e a
  Dica cruzarem na mesma passada (+7 MB no PC, sobre os +34 MB da passada).
- As capas quase nunca ficam prontas na janela de 300 ms (3 de 17 em Filmes): a tela aparece e as imagens entram depois.

### 4. Já há precedente de ganho grande atacando leitura no IndexedDB

Hoje mesmo, o orçamento de armazenamento caiu de ~1,7 s para ~0,4 s por chamada ao reduzir o **número de consultas**
(`sdd/assessments/orcamento-armazenamento-makeroomfor-custa-18-s/`). O padrão "não toque no que não precisa" se repete aqui.

## Evidência Contra

- **A reentrada já é instantânea**: `cache` revela o Início em 1 ms. O custo só aparece na primeira abertura do app, depois de
  60 s de `SHOWCASE_STALE_MS`, ou quando a pré-carga/sincronização invalida a chave. Quem deixa o app aberto sente pouco.
- **A vitrine não está lenta**: Filmes aparece em ~0,37 s. O problema visível ali é *conteúdo faltando na revelação*, não
  demora — e o caminho `ready` aos 300 ms é uma decisão deliberada da feature 079, não um defeito.
- **A passada já foi otimizada uma vez** (feature 065, D-005): antes ela carregava o índice inteiro e selecionava no `select`;
  hoje retém só os 12 mais novos e os candidatos. Repetir a otimização pode render pouco sem mudar a abordagem.
- **As duas medições do Início foram feitas em condição ruim**: logo após reinstalar o app, com a pré-carga de seções rodando
  ou prestes a rodar. ASSUMPTION — numa abertura comum, sem pré-carga, o tempo seria menor; não foi medido.
- **Memória não foi medida na TV**, só no PC. O pico de heap do PC (125–198 MB) não traduz direto para os 364 MB de
  `jsHeapSizeLimit` da TV, e o `heapUsed` do Node não é o mesmo alocador do Chromium.

## Perguntas em Aberto

- Quanto cada leitura do Início custa isoladamente na TV? Hoje o canal só diz quantas ficaram pendentes, não qual demora.
- O que a pessoa prefere ver na abertura: a tela aparecer rápido com menos fileiras, ou esperar mais com tudo pronto?
- "Adicionados recentemente" e "Bem avaliados" precisam estar na **primeira** tela do Início, ou podem entrar logo depois?
- Qual o custo de memória real na TV durante a montagem (medir com `performance.memory` no build de medição)?
