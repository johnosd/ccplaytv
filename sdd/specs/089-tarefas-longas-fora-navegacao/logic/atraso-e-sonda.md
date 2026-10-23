# A medida do atraso, e o conserto da sonda

Dois algoritmos que o executor erraria sem este documento. O primeiro é o que a feature inteira depende (FR-002); o
segundo é o que impede metade de cada rodada de TV de ser desperdiçada (FR-009).

## 1. O atraso desde a última tecla (FR-002)

### Por que esta medida, e não outra

A 088 mediu intervalos nomeados (`tecla`, `render`, `capa`) e descobriu que **95,4%** do tempo em que a thread fica
presa cai **fora** de todos eles. O erro a não repetir é escolher o quarto nome por intuição — já custou duas
conclusões falsas nesta investigação.

O atraso não é um quarto nome: é um **discriminador**. Para cada tarefa longa, quanto tempo passou desde a última
tecla?

| Resultado | Leitura | Para onde a feature vai |
| --- | --- | --- |
| Concentrado em **0–50 ms** | O trabalho é disparado pela tecla e acontece logo depois do commit | Alvo: o que roda no mesmo turno do evento, além do primeiro quadro |
| Concentrado em **50–300 ms** | É consequência tardia da navegação: scroll, remedição do virtualizador, efeitos | Alvo: o ciclo de scroll/virtualização |
| **Espalhado**, inclusive acima de 300 ms | Não é a navegação — é trabalho periódico ou independente | Alvo: timers, consultas, trabalho de fundo não instrumentado |
| Muito em **sem tecla** | Acontece antes de qualquer tecla da janela | A causa é da abertura, não da navegação |

A cadência da sonda é de **300 ms por tecla** (`CADENCIA_MS` em `lib/perf/autopilot.ts`), e é isso que torna as faixas
informativas: se as tarefas longas estivessem distribuídas por acaso ao longo do intervalo entre teclas, as faixas
0–50 e 150–300 receberiam proporções parecidas. Concentração perto de zero é sinal, não ruído.

### A interface

```ts
import type { LongTaskWindow } from './longTaskAttribution'   // { start, duration } — reusa a da 088

/**
 * Reparte o tempo das tarefas longas por faixa de atraso desde a última tecla.
 * `null` quando não houve tarefa longa na janela.
 */
export function summarizeKeyDelays(
  tasks: readonly LongTaskWindow[],
  keyTimes: readonly number[],
): Record<string, number> | null
```

`keyTimes` são carimbos de `performance.now()` dos `keydown` da janela, na mesma origem de `task.start`. **Não precisam
vir ordenados** — a implementação ordena, porque depender disso é o tipo de suposição que quebra em produção e passa no
teste.

### As chaves (conjunto FECHADO)

Uma por faixa, com os ms de tarefa longa e a contagem:

| Faixa do atraso | Chaves |
| --- | --- |
| 0 ≤ atraso < 50 ms | `atrasoAte50Ms`, `atrasoAte50N` |
| 50 ≤ atraso < 150 ms | `atrasoAte150Ms`, `atrasoAte150N` |
| 150 ≤ atraso < 300 ms | `atrasoAte300Ms`, `atrasoAte300N` |
| atraso ≥ 300 ms | `atrasoAcima300Ms`, `atrasoAcima300N` |
| nenhuma tecla antes da tarefa | `atrasoSemTeclaMs`, `atrasoSemTeclaN` |

Todas passam o `KEY_PATTERN` do canal (`/^[a-z][A-Za-z0-9]{0,39}$/`). **Nenhuma chave fora desta tabela** — é por nome
livre que texto do provedor vazaria para a evidência.

Chaves de faixa vazia são **omitidas**, não emitidas como zero: o lote fica menor e a leitura não confunde "nenhuma
amostra" com "amostra de duração zero".

### O invariante que o contrato trava

**A soma dos `*Ms` é igual à soma das durações das tarefas longas, arredondada.** Cada tarefa cai em exatamente uma
faixa — a do atraso do seu **início**. Isso é de propósito: uma tarefa de 400 ms que começa 10 ms depois da tecla
pertence inteira à faixa 0–50, porque o que se quer saber é **o que a disparou**, não onde ela terminou.

```
atraso = task.start − (maior keyTime ≤ task.start)
```

Sem tecla anterior → `atrasoSemTecla*`. Arredonde **só na saída**, nunca nas contas intermediárias.

### O que NÃO fazer

- **Não** emitir uma linha por tarefa longa. Numa janela ruim há 8–18 delas; inundar o canal muda o que está sendo
  medido (a 087 aprendeu isso com a sonda, e a 088 confirmou).
- **Não** usar `Date.now()`. `task.start` vem de `PerformanceObserver`, na origem de `performance.now()`; misturar as
  duas origens produz atrasos de magnitude absurda, que é como a etapa `capa` da 088 registrou 266 s numa janela de
  5 s (R-008 de lá).
- **Não** interpretar o resultado antes de ele existir. O FR-001 proíbe otimizar antes da atribuição, e é a regra que
  pegou os dois erros da 088.

## 2. Por que a sonda falha, e o conserto (FR-009)

### A causa, medida (e a correção de uma conta errada minha)

`startAutopilot` percorre, em ordem: janela 1 Filmes, janela 1 Séries, janela 2 Filmes, janela 2 Séries. Entre uma
janela e a próxima, `irPara(destino)` precisa levar o foco de volta à topbar:

```ts
// lib/perf/autopilot.ts, antes da 089
if (!(await andarAte('ArrowUp', 12, naTopbar))) return false
```

**Doze passos — insuficientes.** `naTopbar` nunca ficava verdadeiro, `irPara` devolvia `false`, a janela era abandonada
e `falhas` incrementava. É o que explica as três rodadas de 2026-10-22 fecharem com `falhas = 2`.

**A primeira versão deste documento errou o motivo**, e o ensaio do T014 a refutou no mesmo dia. Eu havia escrito que
`navegar()` desce ~22 fileiras numa janela de 60 s (200 teclas ÷ 18 por ciclo × 2 descidas) e que eram essas 22 que os
12 passos não cobriam. **Falso**: o foco para na última fileira, então o número de `ArrowDown` não acumula
profundidade. O que determina a profundidade é o **número de fileiras da vitrine**, que escala com o número de
**categorias** da lista:

| Categorias no painel | Subidas medidas até a topbar |
| --- | --- |
| 6 | **9** |
| 34 (como a lista de referência da TV) | **31** |

Medido no navegador real, com o harness de painel fictício do E2E (`e2e/vitrine-filmes-series.mjs`), contando os
`ArrowUp` até `.topbar-item.tv-focus` aparecer. Com 34 categorias de filmes na TV, eram ~31 subidas contra um limite de
12 — a conclusão prática era a mesma, a mecânica não.

Por que isso importa e não é detalhe: a conta errada levaria a um **limite fixo** derivado da duração da janela (e foi
o que eu implementei primeiro: 69). Esse literal cobre 34 categorias, mas **voltaria a falhar** numa lista com 80 — o
mesmo bug, adiado. A causa correta pede um limite que **escale com as categorias**.

A sonda agiu **certo** ao desistir: a recusa de apertar `Enter` fora do rótulo é o que impede a reprodução acidental
(o precedente da 087, em que ela começou a tocar uma série). O defeito era o **limite**, não a trava.

### O conserto

O limite sai do DOM, para escalar com a lista, e tem um piso para o caso de a lista lateral ainda não ter montado:

```ts
function passosAteTopbar(): number {
  const categorias = document.querySelectorAll('.vod-showcase .side-category-nav-item').length
  return Math.max(PISO_ATE_TOPBAR, categorias + MARGEM_FILEIRAS)   // piso 69, margem 12
}
```

- **Escala**: 34 categorias → 46 passos permitidos contra 31 necessários; 200 categorias → 212. Um literal não faria
  isso.
- **Não custa nada no caminho feliz**: `andarAte` confere o destino **antes** de cada tecla e sai na primeira vez que
  ele vale. O limite só é consumido no caminho que hoje falha.
- **O piso de 69** mantém a sonda tentando de verdade antes de desistir, inclusive quando o foco está preso e o DOM da
  vitrine não montou — é o que o segundo contrato travado exige (≥ 50 subidas antes de desistir).
- A trava do `Enter` **não muda**: continua exigindo que o texto do elemento focado seja um dos rótulos do destino.
  Os três testes de `autopilot.test.ts` continuam valendo, e dois contratos travados desta feature fixam isso.

**Verificado de ponta a ponta no PC** (T014), com a sonda rodando o fluxo inteiro contra um painel fictício: as
**quatro** janelas mediram (Filmes, Séries, Filmes, Séries) e a linha final veio com **`falhas: 0`**.

### O que NÃO fazer

- **Não** apertar `Enter` "porque provavelmente chegou". É o bug que tocou uma série na TV do usuário.
- **Não** trocar a navegação por `document.activeElement` ou `.focus()`: o foco deste app é estado do React (ADR-009),
  e `.tv-focus` é a única leitura válida de onde ele está.
- **Não** despachar várias teclas no mesmo turno. O React agrupa as atualizações e o foco anda **um** passo — foi a
  primeira lição da 087, e está no cabeçalho de `autopilot.ts`.
- **Não** zerar a contagem de `falhas` nem deixar de emiti-la. Uma rodada sem medida nenhuma não pode parecer boa.
