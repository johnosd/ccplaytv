# Como atribuir as tarefas longas — e quando parar

Este documento existe porque o erro mais caro desta investigação já foi cometido **duas vezes**: na feature 087 eu
registrei uma causa provável sem medir, e o código a refutou. O FR-001 proíbe repetir isso. Aqui está o método.

## 1. O que já está estabelecido (não remedir)

| Fato | Número | Onde |
| --- | --- | --- |
| É código nosso, não pausa de memória | 48 de 49 quadros ≥ 200 ms coincidem com tarefa longa de JS | `assessments/tarefa-longa-na-leitura-categoria-gorda/explora.md` |
| A thread fica presa | **33%** da janela (mediana), máximo 67%; 475 tarefas, 87,6 s | idem |
| Não é a leitura do catálogo | o produtor do Top 10/Dica é **8,6%** (7,5 s de 87,6 s) | idem |
| As fileiras já são virtualizadas | vertical `overscan: 2` (`VodShowcaseScreen.tsx:483`), horizontal `overscan: 3` (`Rail.tsx:53`) | código |
| ~~Não há desistência do React Compiler nesta tela~~ | **ERRADO — corrigido em 2026-10-22**, ver §1.1 | — |

### 1.1 Correção de 2026-10-22: o React Compiler **desiste** desta tela

A linha riscada acima afirmava que o React Compiler memoiza a vitrine sozinho. **É falso.** `npm run lint` reporta, com
`VodShowcaseScreen.tsx` intocado:

```
src/features/vod/VodShowcaseScreen.tsx:483:23: warning react(incompatible-library): Use of incompatible library
  help: ... by default React Compiler will skip memoizing this component/hook
```

A linha 483 é o `useVirtualizer` da pilha vertical. Ou seja: **a vitrine não é memoizada**, nem à mão (zero `useMemo` em
733 linhas) nem pelo compilador. As duas metades do argumento original caem junto.

Isso **não** autoriza sair memoizando (FR-001 continua valendo, e foi ele que pegou este erro). É um **candidato
nomeado e verificável** para os 76% do tempo preso que a rodada de 2026-10-22 não atribuiu — a ser confirmado pela
atribuição por tarefa longa (§2.1), não pela plausibilidade.

Fica registrado como aviso de método: um fato colocado na tabela "não remedir" fecha a porta para uma hipótese boa. A
origem do erro foi aceitar uma busca que não distinguia aviso de erro no `npm run lint`.

## 2. As três etapas medidas

O caminho é `tecla → foco → render → pintura`. `longtask` diz que há tarefa longa; não diz de quem. Medimos três
intervalos nomeados, conjunto **fechado** (`SpanName`):

| Etapa | Onde abre | Onde fecha | O que isola |
| --- | --- | --- | --- |
| `tecla` | início do `handleKeyDown` de `lib/useRemoteNav.ts` | fim do mesmo manipulador | o custo **síncrono** do manipulador: `moveShowcaseVertical`/`moveShowcaseHorizontal`, `entryIdsOf`, `setFocusState` |
| `render` | antes do commit que o foco provoca | depois de o DOM refletir o foco novo | o custo de **re-render** da tela e das fileiras montadas |
| `capa` | quando o card pede a imagem | quando ela decodifica (ou falha) | decodificação de capa — a parte que **não** é JS nosso |

### 2.1 A quarta medida, acrescentada em 2026-10-22 (T024/T025)

A rodada na TV caiu no **passo 4** da ordem de leitura: `tecla` = 1%, `render` = 23%, **76% fora dos dois**. O passo 4
autoriza acrescentar uma etapa — e o usuário decidiu medir, em vez de otimizar às cegas ou encerrar.

A etapa acrescentada **não é um quarto nome adivinhado**. É a partição do que já medimos: `longTaskAttribution.ts`
cruza o início e o fim de cada tarefa longa com os intervalos das etapas abertas, e devolve

| Chave | O que é |
| --- | --- |
| `ltTeclaMs` / `ltRenderMs` | ms de tarefa longa que caem **dentro** daquela etapa |
| `ltForaMs` / `ltForaN` / `ltForaMax` | ms, contagem e **pior** tarefa longa que não cai em nenhuma |

A soma fecha com `longTaskMs` **por construção** (há teste para isso), então "fora" deixa de ser o resíduo de uma
subtração e passa a ser uma medida — com a pior tarefa sem dono, que é o alvo da Fase 4. `tecla` tem precedência sobre
`render` porque roda dentro dele; sem isso, o mesmo ms seria contado duas vezes.

E a etapa `capa` foi **corrigida** (R-008): mede agora do `onLoad` até o quadro seguinte (pintura, que é tempo de
thread), e não mais do pedido da imagem até ela chegar (espera de parede, que registrou 266 s numa janela de 5 s).

**Agregado por janela**, nas chaves planas do contrato (`teclaN`/`teclaMs`/`teclaMax`, e igual para `render` e `capa`),
emitido junto dos quadros e das tarefas longas no mesmo lote de ~5 s do `PerfOverlay`. Uma linha por evento inundaria o
canal — a feature 087 aprendeu isso com a sonda.

## 3. A ordem de leitura do resultado

Com `longTaskMs` (já existe) e as três etapas na mesma janela:

1. **`teclaMs` ≈ `longTaskMs`** → o manipulador de tecla é o custo. Alvo: o que ele faz de forma síncrona por tecla.
2. **`renderMs` ≈ `longTaskMs`** → é o re-render. Alvo: o que re-renderiza e quanto.
3. **`capaMs` alto e `longTaskMs` baixo** → é decodificação de imagem, **não JS nosso** → FR-008: encerra declarando o
   alvo não cumprido, com a causa nomeada.
4. **Soma das três ≪ `longTaskMs`** → a tarefa longa está fora dos três intervalos; **acrescente uma etapa só então**,
   e registre por que ela entrou. Não saia medindo tudo de uma vez.

## 4. A regra de parada (FR-008)

Encerrar declarando **não cumprido** é resultado correto, não derrota — decisão do usuário em 2026-10-22. Encerra
quando: o custo dominante é `capa` ou fica fora dos três intervalos e sua redução exigiria Worker ou outro formato de
dados (fora de escopo), **ou** duas rodadas na TV mostram que a mudança aplicada não move os três números.

## 5. O que NÃO fazer

- **Não** otimizar antes do passo 3 (FR-001). Inclui o que parece óbvio: memoizar à mão, cortar `overscan`, trocar a
  receita de foco.
- **Não** mexer em `lib/catalog` (formato da 082) nem na produção do Top 10/Dica (087): 8,6% do problema, fora de
  escopo.
- **Não** confiar no navegador do PC para o veredito: ele dá 60 fps em tudo. Serve para ensaiar a sonda, nunca para
  aprovar fluidez.
- **Não** emitir nome de etapa fora do conjunto fechado — é por aí que nome de item vazaria para a evidência.

## 6. As travas que são o guarda-corpo (e não são desta feature)

O FR-002 e o FR-006 **já estão protegidos por contratos travados de outras features**. Quebrar qualquer um significa
que a otimização mudou comportamento, e não que o teste está velho:

| Trava | O que ela fixa |
| --- | --- |
| `052-vitrine-filmes-series` | `← →` andam na fileira, `↑ ↓` trocam de fileira, Enter seleciona; **o foco devolvido restaura o mesmo cartão por id** |
| `053-carrosseis-filmes-series` | `← →` paginam a lista lateral e ela recolhe ao entrar nos cards; **categoria pendente não inventa cards** |
| `057-top10-dica-tmdb` | a forma do retorno de `useWeeklyTop10`/`useDailyTip` (os hooks são mockados lá) |
| `086-montagem-rapida-telas` | a montagem não lê bloco do catálogo |
| `087-top10-dica-segundo-plano` | a tela lê o registro guardado; sem ele, a fileira não existe |

Rodar as cinco é parte do gate desta feature, não cortesia.
