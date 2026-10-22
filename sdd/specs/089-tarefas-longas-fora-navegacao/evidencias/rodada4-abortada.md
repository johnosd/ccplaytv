# Rodada 4 — abortada, e por quê (feature 089)

**Data**: 2026-10-22 · **Classificação**: **nenhuma** — esta rodada não produziu medida válida, e por isso o `.jsonl`
não foi guardado.

## O que aconteceu

A rodada 4 foi instalada para medir, pela primeira vez, a navegação **de cards** de verdade — depois de o usuário
observar na TV que a sonda passava pela lista de categorias antes de ir para a próxima fileira (R-015).

Com a sonda ainda rodando, **o usuário observou que ela andava _somente_ pela lista de categorias**. A rodada foi
interrompida e o pacote normal reinstalado.

## A causa: o conserto estava errado, e pior que o original

A primeira tentativa de conserto detectava a saída da fileira e dava **uma tecla contrária** para voltar. Isso não
funciona: na lista lateral, `←` e `→` **paginam as categorias** em vez de sair dela. O foco ficava preso lá, e o
roteiro passava a janela inteira paginando categorias — pior que os 53% do roteiro original.

O ensaio no PC não pegou isso porque partia com o foco **já numa fileira** e nunca o perdia por mais de uma tecla. O
cenário que falha é entrar na lista e tentar sair com uma tecla só.

## O conserto que funcionou, e como foi verificado

Três tentativas, medidas no PC com 34 categorias (o mesmo número da lista de referência da TV):

| Roteiro | Teclas na lista lateral | Teclas nas fileiras |
| --- | --- | --- |
| Original (`→`×8, `↓`, `←`×8, `↓`) | **53%** | 47% |
| Tecla contrária ao sair | **pior** — ficava preso na lista (observado na TV) | — |
| Derivar à direita (`←`×6) | 24% — sobrava alternância na borda | 76% |
| **Final: só `→` e `↓`** | **0%** | **100%** |

O roteiro final não usa `←`: `→` no último cartão não sai da fileira, e `↓` troca de fileira. `recuperar()` continua no
código como rede (insiste em `→` até voltar), não como regra — e foi ela que trouxe o foco de volta no ensaio que
**começa de propósito na lista lateral**, o cenário que travava.

## O que isto custou e o que fica

Custou uma instalação sem medida. O que fica é a sonda medindo o que diz medir, verificado sem gastar TV — e o registro
de que **as medições das features 087, 088 e das rodadas 1–3 desta carregam o viés de 53%**: metade daquelas teclas era
navegação de categoria. Os números delas valem como comparação entre si (mesmo roteiro), não como medida de navegação
de cards.
