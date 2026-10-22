# Assessment Decision: quadros congelados ao navegar nas telas de catálogo na TV

- **Slug**: tarefa-longa-na-leitura-categoria-gorda
- **Decidido**: 2026-10-22
- **Problem**: [./problem.md](./problem.md)
- **Veredito**: **needs-clarification**

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | **strong** | Quadro de ~900 ms medido em duas features independentes (086: pior 917 ms em 332 janelas; 087: 583–900 ms em 3 janelas de 60 s) e relatado pelo usuário sem ver medição |
| Força da evidência | **weak** | Forte para o **sintoma**, fraca para a **causa**. A hipótese que motivou este assessment — "a categoria é descomprimida numa tarefa única" — foi conferida no código e **é falsa**: `BLOCK_CHUNK_ITEMS = 500` e `decodeRange` dá `await decodeBlockChunk` por pedaço, com descompressão assíncrona real. As três suspeitas que sobraram (pausa de memória, descarte do cache de pedaços, outra) são **ASSUMPTION** |
| Valor vs. custo de inação | **adequate** | Ninguém está bloqueado: a 086 foi entregue e aceita com 917 ms e o fps mediano está em 38 nas três medições. O custo real é atribuição errada em features futuras — já aconteceu na 087, onde a causa foi acusada duas vezes antes de ser medida |
| Viabilidade / apetite | **adequate** | Decisão do usuário (2026-10-22): instrumentar para discriminar a causa **antes** de gastar rodada de TV |
| Fit estratégico | **strong** | Fluidez na TV é central (constitution: foco é o estado mais importante), e o precedente da 086 — "o gargalo é a **thread**, não a fila" — foi o que destravou aquela feature |

## Abordagens Candidatas

### 1. Instrumentar para discriminar, depois medir

- Acrescentar, atrás do portão de desempenho que já existe: um `PerformanceObserver` de `longtask` emitindo pelo canal
  de métricas, e tempo por etapa da montagem do índice. **Quadro longo sem tarefa longa correspondente = pausa de
  memória; com = código nosso.** Uma rodada da sonda automática passa a responder **onde está**, em vez de confirmar o
  sintoma pela terceira vez.
- **Recomendada**: sim — é a única que ataca o que falta (evidência da causa) em vez do que já se sabe (o sintoma). É
  também a escolha do usuário.

### 2. Ceder a vez dentro da leitura do bloco, ou montar o índice no Worker

- Era a abordagem registrada no `Resultado Final` da feature 087.
- **Recomendada**: **não** — nasceu da hipótese refutada. A leitura já cede a vez a cada 500 itens. Construir isso agora
  seria otimizar um caminho que a evidência do código diz não ser o problema.

### 3. Aceitar como linha de base e arquivar

- Registrar os ~900 ms como característica medida do aparelho e fechar.
- **Recomendada**: não **agora** — mas é um desfecho legítimo, e fica explícito como alvo 4 das Success Metrics: se a
  instrumentação mostrar que a causa não é acionável a custo razoável, este é o resultado correto, não uma derrota.

## Veredito

**needs-clarification.** O problema é válido e o apetite existe, mas a **Força da evidência é `weak`** no que importa
para construir: a causa. A barra do `go` exige `adequate`+ nos critérios centrais, e inflar isso aqui seria repetir o
erro que este assessment acabou de documentar — a feature 087 fechou com uma hipótese sobre a causa que o código
refuta.

O que **não** está em dúvida: o sintoma, o número e o apetite. O que está: de onde vem o quadro longo.

### Se needs-clarification — Perguntas Bloqueantes

- **O quadro de ~900 ms coincide com uma tarefa longa de JavaScript?** Se não, é pausa de memória ou compositor, e
  nenhuma otimização de laço resolve.
- **Ele aparece com a fila de segundo plano desligada?** Separa "é do catálogo" de "é da fila" — a sonda automática já
  roda esse A/B com o mesmo roteiro de duração fixa.
- **O cache de pedaços passa do teto durante a montagem do índice?** `CHUNK_CACHE_MAX_ITEMS = 30 000` contra 43 549
  itens do tipo: se houver descarte em laço, o custo é de cache, não de descompressão.
- **A mediana de entrada em categoria de 627 ms é piora real** ou efeito da navegação contínua da sonda (uma tecla a
  cada 300 ms, contra o roteiro humano com pausas da 086)?

**Fase a revisitar**: **explora** — com a instrumentação no lugar e uma rodada da sonda, as quatro perguntas acima têm
resposta numérica, e aí o Decide roda de novo com a evidência que falta.

### Próximo passo concreto

A instrumentação é mudança pequena, de baixo risco e atrás de portão que já existe — cabe em **`sdd-adhoc`**, não numa
feature: nada está quebrado, está claro que vale a pena (decisão do usuário acima), e são ~2 arquivos. Depois dela, uma
rodada da sonda automática e este `decision.md` é reaberto.

**Este assessment não edita código** — a instrumentação é trabalho de outro skill.
