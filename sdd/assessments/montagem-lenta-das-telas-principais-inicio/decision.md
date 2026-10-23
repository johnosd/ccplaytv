# Assessment Decision: Montagem lenta das telas principais (Início, Filmes, Séries)

- **Slug**: montagem-lenta-das-telas-principais-inicio
- **Decidido**: 2026-10-20
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Medido duas vezes na TV com a lista real: Início revela por `cap` em ~2 047 ms com **6 de 6 leituras pendentes** (tela vazia). O sintoma não é impressão, é número |
| Força da evidência | adequate | A causa — varrer o tipo inteiro por abertura — está fundamentada no código (`loadShowcaseSelections`, `catalogApi.ts:1651`) e medida no PC (281–298 ms e +34–41 MB para 43 510 filmes). **O rateio por leitura na TV não foi medido**: sabe-se que em 2 s nenhuma das 6 terminou, não qual pesa mais. A tradução PC→TV (~4×) é ASSUMPTION |
| Valor vs. custo de inação | adequate | É a primeira tela de toda abertura; o ganho esperado é de ~2 s vazia para ≤ 1 s com conteúdo, e dezenas de MB a menos. Não há falha hoje (o app nunca fechou sozinho), então é qualidade percebida, não correção |
| Viabilidade / apetite | adequate | O usuário aceita uma feature completa. O desenho tem **precedente direto no projeto**: `catalogReadManifests` + `readProjection.ts` já mantêm uma projeção derivada por categoria, invalidada na gravação. A regra "todo gravador chama `makeRoomFor`" (082) dá o ponto exato onde atualizar |
| Fit estratégico | strong | Client-first (ADR-008) e offline-first (ADR-002): o catálogo no aparelho é a fonte da verdade, e pré-calcular derivados é a consequência natural. Fecha a última frente de lentidão medida hoje, junto com a 085 e o ajuste do orçamento |

Nenhum critério ficou `weak` ou `unknown`. O `adequate` da evidência é reconhecido explicitamente: a primeira fase da feature
deve **medir cada leitura do Início na TV** antes de mudar o desenho, para não otimizar a leitura errada.

## Abordagens Candidatas

### 1. Seleções da vitrine calculadas uma vez e guardadas no banco (recomendada)

Uma tabela pequena por lista e tipo guarda o que as fileiras precisam — os 12 "Adicionados recentemente" e os "Bem
avaliados" já escolhidos — gravada **quando o catálogo muda** (a gravação de categoria já sabe o que entrou) e lida em
milissegundos na abertura. A varredura sai do caminho da tela e vira trabalho de quem grava, que já roda em Worker na
pré-carga.

- **Velocidade**: a abertura lê dezenas de registros, não 43 mil.
- **Memória**: a thread da interface deixa de reter o tipo inteiro (+34–41 MB por tipo, mais o `compact` com chave TMDB).
- **Precedente**: `readProjection.ts` e `catalogReadManifests` fazem exatamente isso por categoria, com invalidação na gravação.
- **Risco**: dado derivado desatualizado. Mitigação: a projeção carrega a geração e a revisão da origem (como a atual) e, em
  divergência, a tela cai para a varredura de hoje.
- **Recomendada**: sim — é a única que atende aos dois eixos que o usuário pôs juntos (velocidade e memória) e à exigência de
  que as fileiras caras estejam prontas quando a tela aparece.

### 2. Varrer num Worker e guardar o resultado

Move `loadShowcaseSelections` para um Web Worker e guarda a saída. A interface para de travar, mas o trabalho continua
(~1,2 s estimados na TV por tipo) e a memória continua sendo usada, só que fora da thread da interface. Não entrega a fileira
pronta na primeira abertura depois de uma sincronização.

- **Recomendada**: não — resolve a trava, não o custo. Pode entrar como complemento da (1) para o recálculo.

### 3. Só adiar as fileiras caras

A tela revela com as leituras baratas e as pesadas entram depois. É barato e melhora o "tela vazia", mas mantém o custo de
CPU e de memória, e contraria a escolha do usuário ("prontas sempre, com dado guardado").

- **Recomendada**: não como solução — mas a montagem em partes continua valendo, e a ordem das leituras deve ser revista junto.

## Veredito

**go.** O problema é válido e medido na TV, a causa está localizada no código e medida no PC, e o desenho recomendado tem
precedente no próprio projeto. O usuário definiu meta (≤ 1 s com conteúdo), prioridade (velocidade e memória juntas),
comportamento (em partes, sem mover o foco) e apetite (feature completa).

### Se go — Handoff

- **Problema**: Início aparece em ~2 s e vazio, e Filmes/Séries aparecem incompletas, porque cada abertura varre o catálogo
  inteiro do tipo (43 510 filmes, 9 768 séries) para montar duas fileiras de 12 cards. Custa tempo na thread da interface e
  retém +34–41 MB por tipo.
- **Abordagem recomendada**: guardar as seleções das fileiras já calculadas no banco, atualizadas quando o catálogo muda, e
  ler na abertura. A varredura completa fica como caminho de reserva quando o dado guardado não bate com a geração atual.
- **Escopo sugerido**:
  - **Entra**: Início, Filmes e Séries; as fileiras "Adicionados recentemente" e "Bem avaliados" (as caras); onde as seleções
    são calculadas, guardadas e invalidadas; a ordem das leituras na montagem; medição por leitura no canal de métricas,
    incluindo pico de heap na TV.
  - **Fica de fora**: desenho visual, quais fileiras existem, o motor `stepAssembly` da 079, a entrada em categoria, rede.
- **Métricas de sucesso** (TV física, lista real, ≥ 2 amostras na primeira abertura): Início `revealMs` ≤ 1 000 ms com
  `pending` ≤ 2; nenhuma das três revela por `cap`; leitura das seleções por tipo ≤ 100 ms; pico de heap não maior que hoje;
  contratos das features 079, 065, 056, 082 e 085 verdes.
- **Perguntas em aberto para o `sdd-specify`**:
  - Qual leitura do Início pesa mais na TV? A primeira fase deve instrumentar as 6 leituras no build de medição e fazer uma
    passada na TV **antes** de mudar o desenho (a evidência é `adequate`, não `strong`, exatamente por isso).
  - O que acontece com as fileiras quando a lista ainda está sendo pré-carregada e a seleção guardada cobre poucas categorias?
    Hoje existe o aviso de escopo parcial (`coveredCategories`/`totalCategories`) — precisa continuar correto.
  - As capas da primeira tela (3 de 17 prontas na medição) entram no escopo ou ficam como estão?
  - Quando o dado guardado é recalculado: a cada categoria gravada, ao fim da carga por seção, ou nos dois momentos?
