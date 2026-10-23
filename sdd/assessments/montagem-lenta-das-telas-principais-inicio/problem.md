# Assessment Problem: Montagem lenta das telas principais (Início, Filmes, Séries)

- **Slug**: montagem-lenta-das-telas-principais-inicio
- **Criado**: 2026-10-20
- **Explora**: ./explora.md

## Problem Statement

O Início aparece em ~2 s e **vazio** (revelado pelo teto, com as 6 leituras ainda pendentes) porque cada abertura varre o
catálogo inteiro de filmes e de séries para montar duas fileiras de 12 cards. A varredura custa tempo na thread da interface e
retém dezenas de MB — trabalho refeito a cada abertura para um resultado que quase nunca mudou.

## Usuários / Partes Afetadas

- **Quem abre o app**: espera ~2 s e ainda vê a tela sem fileiras; o conteúdo entra depois, aos pedaços.
- **Quem entra em Filmes ou Séries**: a tela aparece em ~0,37 s, mas com 2 a 6 fileiras faltando e quase nenhuma capa pronta
  (3 de 17 na medição).
- **Quem navega enquanto a pré-carga roda**: a varredura disputa a thread com a navegação — casa com os 28 quadros acima de
  100 ms medidos com o controle parado (SC-003 da 082).

## Evidência medida (resumo; detalhe em `explora.md`)

| Medição | Resultado | Fonte |
| --- | --- | --- |
| Início, 1ª e 2ª abertura na TV | 2 048 e 2 047 ms, motivo `cap`, **6 de 6 leituras pendentes** | canal de métricas, app real, 2026-10-20 |
| Filmes, entradas na TV | 359–404 ms, motivo `ready`, 2–6 pendentes, capas 3/17 | idem |
| Passada do tipo no PC (43 510 filmes) | 281–298 ms, **+34 a +41 MB** de heap | ensaio no PC, lista real sanitizada |
| Passada do tipo no PC (9 768 séries) | 34–69 ms, +5 a +8 MB | idem |
| TV ~4× mais lenta que o PC em CPU | ASSUMPTION (medição da 082) → ~1,4 s somando os dois tipos | — |

## Goals

- O Início aparece **com conteúdo** (billboard e a primeira fileira preenchidos) em **≤ 1 s** na primeira abertura da lista real.
- "Adicionados recentemente" e "Bem avaliados" ficam **prontos quando a tela aparece**, lidos de dado já calculado — não
  recalculados na abertura.
- A montagem deixa de reter o catálogo do tipo em memória durante a abertura.
- Filmes e Séries revelam com as fileiras de itens preenchidas, não só com a lista de categorias.
- As três telas continuam revelando **em partes, sem mover o foco** (constituição: foco é o estado mais importante).

## Non-Goals

- Mudar o desenho visual das telas, a ordem das fileiras ou quais fileiras existem.
- Trocar o motor de montagem da feature 079 (`stepAssembly`): o teto, o streaming e os motivos de revelação ficam.
- Resolver a entrada numa categoria (o caso dos 6,8 s medidos hoje) — frente separada.
- Rede: nada aqui consulta o provedor; tudo é leitura local (ADR-002/ADR-008).
- Reduzir o uso de memória do app como um todo; o alvo é a montagem das três telas.

## Success Metrics

Medidas na TV física com o canal de métricas (fonte `assembly`), lista real, **primeira abertura**, ≥ 2 amostras:

- `revealMs` do Início **≤ 1 000 ms** com `pending` ≤ 2 (hoje: ~2 047 ms com `pending` 6).
- Nenhuma das três telas revela por `cap` na abertura comum (hoje o Início revela sempre por `cap`).
- Filmes e Séries: `revealMs` ≤ 1 000 ms com `pending` ≤ 2 (hoje ~0,37 s com 2–6).
- A leitura das seleções por tipo custa **≤ 100 ms** (hoje ~300 ms no PC, estimados ~1,2 s na TV para filmes).
- Pico de heap da abertura medido na TV e **não maior** que o de hoje (a passada deixa de reter +34–41 MB por tipo).
- Sem regressão: suíte unitária, E2E (`carrosseis-filmes-series`, `home-vitrine-expandida`, `bem-avaliados`,
  `campos-da-listagem`) e os contratos travados das features 079, 065, 056, 082 e 085.

## Cost of Inaction

É a primeira tela de toda abertura do app: a demora é o primeiro contato da pessoa com o produto, e hoje ela vê uma tela
vazia por 2 s. O custo também não é só de percepção — a varredura concorre com a navegação e com a pré-carga, e retém memória
na TV de 364 MB de limite. Nenhuma falha acontece hoje (o usuário nunca viu o app fechar sozinho), então é prioridade de
qualidade percebida, não de correção.
