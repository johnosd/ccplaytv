# Assessment Decision: Orçamento de memória do app na TV

- **Slug**: orcamento-memoria-app-tv
- **Decidido**: 2026-10-19
- **Problem**: ./problem.md
- **Veredito**: kill (reavaliado em 2026-10-19 após a medição na TV; antes: needs-clarification)

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | adequate | Leitores sem teto que carregam o tipo inteiro existem e foram confirmados no código (`loadSearchIndex`, busca global com 3 tipos, "Todos" por nome, páginas sem `maxPages`). O limite da TV foi medido. |
| Força da evidência | **weak** | O limite de 4,4 milhões de objetos veio de objetos sintéticos numa sonda separada. Nunca se viu o app real fechar, e o consumo dos leitores reais com a lista real nunca foi medido. A conta de objetos por registro é ASSUMPTION. |
| Valor vs. custo de inação | unknown | Depende da medição: se a lista real e uma de ~100 mil ficarem longe do limite, o valor é baixo. O usuário escolheu medir antes de decidir. |
| Viabilidade / apetite | adequate | O padrão "teto por área" já existe (cache de pedaços, memo de blocos, memo da projeção). A sonda (`tizen-sonda`) consegue medir. O alvo de ~100 mil evita reescrever busca e ordenação como índice paginado. |
| Fit estratégico | strong | Segue a 082 (orçamento de armazenamento) e o alvo da TV de referência; a ordenação pré-calculada entra junto por decisão do usuário. |

## Abordagens Candidatas

### A. Medir primeiro, depois pôr teto só onde a medição mandar

- Uma rodada de `tizen-sonda` carrega os leitores reais (índice de busca, busca global, "Todos" por nome) com a lista
  real sanitizada e com uma lista sintética de ~100 mil itens, e conta objetos e heap.
- A feature então ataca só os leitores que passarem do teto: uma cópia única do índice, `maxPages` em "Todos", índice
  compacto (só nome normalizado + chave de ordenação + id, com o registro lido por página) e chave de ordenação
  pré-calculada.
- **Recomendada**: sim. É a escolha do usuário e evita trabalho que ninguém consegue provar.

### B. Teto genérico em todos os leitores agregados, sem medir

- Aplica as mesmas mudanças de A em todos os leitores, já.
- **Recomendada**: não. Pode custar caro e entregar um ganho que não se mede.

### C. Índice persistido no IndexedDB (busca e ordenação paginadas)

- Resolve qualquer tamanho de lista, mas é mudança de arquitetura.
- **Recomendada**: não agora. Só se a medição mostrar que ~100 mil não cabem com A.

## Veredito

`needs-clarification`. O problema é plausível e o caminho é viável, mas a força da evidência é `weak` e o valor é
`unknown`: nada mostra ainda que o app real chegue perto do limite. Pela barra do `go`, isso não basta para
especificar. A pergunta bloqueante se responde com uma medição, não com entrevista.

### Se needs-clarification — Perguntas Bloqueantes

- Na TV de referência, com os leitores reais do app, qual o pico de objetos e de heap na busca global e em "Todos"
  ordenado por nome:
  1. com a lista real (~55 mil);
  2. com uma lista sintética de ~100 mil itens?
  Medir com `tizen-sonda` (app separado, autorização pedida antes de instalar).
- Critério para virar `go`: algum desses picos passa de ~50 % do limite medido (~2,2 milhões de objetos ou ~180 MB de
  heap). Se todos ficarem bem abaixo, a parte de memória vira `kill` e só a ordenação pré-calculada segue, pelo item de
  CPU.

**Fase a revisitar**: explora (anexar a medição em `explora.md` e rodar Decide de novo)

## Reavaliação após a medição na TV (2026-10-19)

Evidência: `./evidencias/memoria-leitores-tv-2026-10-19.md` (sonda com os leitores reais do app, 2 rodadas, autorizada
pelo usuário).

| Critério | Antes | Agora | Notas |
| --- | --- | --- | --- |
| Validade do problema | adequate | **weak** | Os leitores sem teto existem, mas o que eles retêm é pequeno: ≤ 32 MB com 100 mil itens (~12 % do ponto de queda). |
| Força da evidência | weak | **strong** | Gate medido na TV com o código real: os 6 cenários aguentaram a folga de 2,2 milhões de objetos nas duas rodadas. |
| Valor vs. custo de inação | unknown | **weak** | O custo de inação para memória fica perto de zero até ~100 mil itens. |
| Viabilidade / apetite | adequate | adequate | Sem mudança. |
| Fit estratégico | strong | adequate | O alvo continua certo, mas o problema não está onde se supunha. |

### Se kill — Motivo

O critério combinado antes de medir decidiu do lado do "não precisa". Com a lista real e com ~100 mil itens, a busca
global e "Todos" (por nome e na ordem da fonte até o fim) retêm no máximo ~32 MB, e a TV aguentou mais 2,2 milhões de
objetos por cima em todos os cenários, nas duas rodadas. Um orçamento de memória por área custaria trabalho sem ganho
mensurável. Se aparecer uma lista bem acima de 100 mil itens, ou o app real fechar em uso longo, a mesma sonda
(`memoriaLeitores`) mede de novo.

Os dois achados que a medição revelou seguiram, por decisão do usuário, para o item "Ajustes finos de CPU na TV" do
backlog:

- **Latência**: montar o índice leva ~2 s na lista real (busca global, "Todos" por nome) e ~4 s com 100 mil itens.
- **Ordenação**: a chave calculada na gravação ordena ~2,5× mais rápido (53 contra 137 ms em 11 mil nomes), mas muda a
  ordem de 126 pares em relação ao A–Z de hoje. Aceitar isso é pergunta aberta daquele item.
