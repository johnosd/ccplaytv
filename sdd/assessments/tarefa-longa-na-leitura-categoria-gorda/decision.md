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

---

# Reabertura (2026-10-22) — com a evidência que faltava

O veredito acima era **needs-clarification** por falta de evidência da causa. A instrumentação foi entregue, a
sonda rodou (`explora.md` → "Rodada de medição com o discriminador") e as perguntas bloqueantes têm resposta.

## Perguntas bloqueantes, respondidas

| Pergunta | Resposta |
| --- | --- |
| O quadro longo coincide com tarefa longa de JavaScript? | **Sim, 48 de 49.** É código nosso, não pausa de memória |
| Aparece com a fila de segundo plano desligada? | **Sim** — o produtor é só **8,6%** do tempo em tarefa longa (7,5 s de 87,6 s); 91% é do caminho de navegação |
| O cache de pedaços passa do teto? | **Evidência a favor**: filmes custam **164 µs/item** contra 34 µs/item de séries (4,8×), e `CHUNK_CACHE_MAX_ITEMS = 30 000` < 31 915 itens de filmes |
| A mediana de entrada de 627 ms é piora real? | **Sem veredito ainda** — não era o alvo desta rodada, e segue como pergunta aberta para a feature |

## Scorecard revisado

| Critério | Antes | Agora | Notas |
| --- | --- | --- | --- |
| Validade do problema | strong | **strong** | 475 tarefas longas, thread presa 33% da janela (mediana) |
| Força da evidência | **weak** | **adequate** | Classe de causa localizada com 48/49 de correlação, em medição repetível. O **código exato** dentro das tarefas longas ainda não está atribuído — é a 1ª fase da feature, não um palpite |
| Valor vs. custo de inação | adequate | **adequate** | Inalterado: ninguém bloqueado, mas o número ronda toda estimativa |
| Viabilidade / apetite | adequate | **adequate** | Instrumentação já existe e a medição é repetível sem ninguém com cronômetro |
| Fit estratégico | strong | **strong** | Fluidez na TV é central |

Nenhum critério em `weak` ou `unknown` → a barra do `go` foi atingida.

## Veredito revisado: **go**

**E para uma feature diferente da que qualquer um especificaria ontem.** O alvo não é a leitura do catálogo: é o
**caminho de navegação** (tecla → foco → render → pintura), responsável por 91% do tempo em tarefa longa. As duas
abordagens que a feature 087 havia registrado atacariam 8,6% do problema — e uma delas já era refutada pelo código.

### Handoff para o `sdd-specify`

- **Problema**: navegar entre cards e fileiras em Filmes/Séries na TV mantém a thread presa **33% do tempo**
  (mediana, máximo 67%), em 475 tarefas longas de 50–736 ms, produzindo quadros congelados de até ~780 ms. 48 de 49
  desses quadros coincidem com tarefa longa de JavaScript: é código nosso.
- **Abordagem recomendada**: feature de desempenho do caminho de navegação, com a **1ª fase sendo atribuição** —
  `performance.measure` em volta do manipulador de tecla e das etapas de render/virtualização, para saber **qual**
  código está nas tarefas longas antes de otimizar qualquer coisa. Só depois, as mudanças.
- **Escopo sugerido — entra**: o caminho de navegação das vitrines (foco, virtualização, re-render de fileira) e a
  pista concreta do cache de pedaços (`CHUNK_CACHE_MAX_ITEMS = 30 000` contra 31 915 itens de filmes, 4,8× mais
  lento por item).
- **Escopo sugerido — não entra**: ceder a vez dentro da leitura do bloco e mover o índice para o Worker (8,6% do
  problema, e a primeira é refutada pelo código); mudar o formato de gravação da feature 082; reabrir a 087.
- **Métricas de sucesso**: medidas pela sonda automática, no mesmo roteiro de duração fixa, contra esta rodada
  (`app-metricas-tv-2026-10-22.jsonl`): **fração da janela em tarefa longa abaixo de 15%** (hoje 33% de mediana),
  **pior quadro abaixo de 300 ms** (hoje 717–783 ms) e **fps mediano ≥ 45** (hoje 33–41).
- **Perguntas em aberto para o `sdd-specify`**: qual código está nas tarefas longas (a 1ª fase responde); se a
  mediana de entrada em categoria de 627 ms tem a mesma causa; e qual o teto aceitável de tarefa longa numa TV com
  ~310 MB livres.
